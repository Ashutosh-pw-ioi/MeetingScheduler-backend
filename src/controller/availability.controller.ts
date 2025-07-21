import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { Request, Response } from 'express';
import { generateAvailabilitySlots } from '../utils/slotGenerator.js';

const prisma = new PrismaClient();
const TIME_ZONE = 'Asia/Kolkata';


const createFutureAvailability = async (req: Request, res: Response) => {
  const interviewerId = (req.user as any).id;
  const { availabilities } = req.body;

  if (!Array.isArray(availabilities)) {
    return res.status(400).json({ message: "Expected 'availabilities' to be an array." });
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  const limitDate = now.plus({ days: 15 });
  const slotsToCreate: { interviewerId: string; startTime: Date; endTime: Date }[] = [];

  try {
    for (const entry of availabilities) {
      const { date, startTime, endTime } = entry;
      if (!date || !startTime || !endTime) {
        return res.status(400).json({ message: `Missing fields in entry: ${JSON.stringify(entry)}` });
      }

      const entryDate = DateTime.fromISO(date, { zone: TIME_ZONE });
      if (entryDate > limitDate || entryDate < now.startOf('day')) {
        continue;
      }

      const slots = generateAvailabilitySlots({ date, startTime, endTime, now });
      for (const slot of slots) {
        slotsToCreate.push({ interviewerId, ...slot });
      }
    }

    if (slotsToCreate.length === 0) {
      return res.status(200).json({ message: 'No valid future availability slots to create.' });
    }

    const result = await prisma.availability.createMany({
      data: slotsToCreate,
      skipDuplicates: true,
    });

    res.status(201).json({ message: `Successfully created ${result.count} future availability slots.` });

  } catch (error) {
    console.error("Error in createFutureAvailability:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


const createTodayAvailability = async (req: Request, res: Response) => {
  const interviewerId = (req.user as any).id;
  const { availabilities } = req.body;

  if (!Array.isArray(availabilities)) {
    return res.status(400).json({ message: "Expected 'availabilities' to be an array." });
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  const todayStr = now.toFormat('yyyy-MM-dd');
  const slotsToCreate: { interviewerId: string; startTime: Date; endTime: Date }[] = [];

  try {
    for (const entry of availabilities) {
      const { date, startTime, endTime } = entry;
      if (!date || !startTime || !endTime) {
        return res.status(400).json({ message: `Missing fields in entry: ${JSON.stringify(entry)}` });
      }

      if (date !== todayStr) {
        return res.status(400).json({ message: `This endpoint only accepts availability for today's date: ${todayStr}` });
      }

      const slots = generateAvailabilitySlots({ date, startTime, endTime, now });
      for (const slot of slots) {
        slotsToCreate.push({ interviewerId, ...slot });
      }
    }

    if (slotsToCreate.length === 0) {
      return res.status(200).json({ message: 'No valid time slots to create for today (possibly all in the past).' });
    }

    const result = await prisma.availability.createMany({
      data: slotsToCreate,
      skipDuplicates: true,
    });

    res.status(201).json({ message: `Successfully created ${result.count} availability slots for today.` });

  } catch (error) {
    console.error("Error in createTodayAvailability:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
export { createTodayAvailability, createFutureAvailability };   