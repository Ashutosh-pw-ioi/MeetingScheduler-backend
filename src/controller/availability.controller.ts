import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { Request, Response } from 'express';
import { generateAvailabilitySlots } from '../utils/slotGenerator.js';
interface FormattedMeeting {
  student_name: string;
  student_email: string;
  student_phone: string | null;
  scheduled_date: string;
  scheduled_time: string;
  meeting_link: string | null;
}

const prisma = new PrismaClient();
const TIME_ZONE = 'Asia/Kolkata';



export const setAvailabilityForMultipleDays = async (req: Request, res: Response) => {
  const interviewerId = (req.user as Express.User).id;
  const { availabilities } = req.body;

  if (!Array.isArray(availabilities)) {
    return res.status(400).json({ message: "Request body must include 'availabilities', an array of daily availability." });
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  const allSlotsToCreate: { interviewerId: string; startTime: Date; endTime: Date }[] = [];
  const dateRangesToDelete: { startTime: { gte: Date, lt: Date } }[] = [];

  for (const dailyInfo of availabilities) {
    const { date, timeRanges } = dailyInfo;
    const entryDate = DateTime.fromISO(date, { zone: TIME_ZONE });

    if (!entryDate.isValid) {
      return res.status(400).json({ message: `Invalid date format provided: ${date}. Use 'YYYY-MM-DD'.` });
    }
    if (entryDate < now.startOf('day')) continue;

    dateRangesToDelete.push({
      startTime: {
        gte: entryDate.startOf('day').toJSDate(),
        lt: entryDate.endOf('day').toJSDate(),
      }
    });

    for (const range of timeRanges) {
      const generatedSlots = generateAvailabilitySlots({ date, startTime: range.startTime, endTime: range.endTime, now });
      for (const slot of generatedSlots) {
        allSlotsToCreate.push({ interviewerId, ...slot });
      }
    }
  }

  if (dateRangesToDelete.length === 0) {
    return res.status(200).json({ message: "No valid future dates provided to update." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({
        where: {
          interviewerId,
          isBooked: false,
          OR: dateRangesToDelete,
        },
      });

      if (allSlotsToCreate.length === 0) {
        return { count: 0 };
      }

      return tx.availability.createMany({
        data: allSlotsToCreate,
        skipDuplicates: true,
      });
    });

    res.status(201).json({
      message: `Successfully updated availability for ${dateRangesToDelete.length} day(s). Created ${result.count} new slots.`,
      slotsCreated: result.count,
    });

  } catch (error) {
    console.error("Error in setAvailabilityForMultipleDays:", error);
    res.status(500).json({ message: "An internal server error occurred during the batch update." });
  }
};

export const updateOrSetAvailabilityForDay = async (req: Request, res: Response) => {
  const interviewerId = (req.user as Express.User).id;
  const { date, timeRanges } = req.body;

  if (!date || !Array.isArray(timeRanges)) {
    return res.status(400).json({ message: "Request body must include 'date' (string) and 'timeRanges' (array)." });
  }

  const entryDate = DateTime.fromISO(date, { zone: TIME_ZONE });
  if (!entryDate.isValid) {
    return res.status(400).json({ message: `Invalid date format: ${date}. Please use 'YYYY-MM-DD'.` });
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  if (entryDate < now.startOf('day')) {
    return res.status(400).json({ message: "Cannot set availability for a past date." });
  }

  const slotsToCreate: { interviewerId: string; startTime: Date; endTime: Date }[] = [];
  for (const range of timeRanges) {
    if (!range.startTime || !range.endTime) {
      return res.status(400).json({ message: `Invalid time range provided: ${JSON.stringify(range)}` });
    }
    const generatedSlots = generateAvailabilitySlots({ date, startTime: range.startTime, endTime: range.endTime, now });
    for (const slot of generatedSlots) {
      slotsToCreate.push({ interviewerId, ...slot });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({
        where: {
          interviewerId,
          isBooked: false,
          startTime: {
            gte: entryDate.startOf('day').toJSDate(),
            lt: entryDate.endOf('day').toJSDate(),
          },
        },
      });

      if (slotsToCreate.length === 0) {
        return { count: 0 };
      }

      return await tx.availability.createMany({
        data: slotsToCreate,
        skipDuplicates: true,
      });
    });

    res.status(201).json({
      message: `Successfully set availability for ${date}. Created ${result.count} new slots.`,
      slotsCreated: result.count,
    });

  } catch (error) {
    console.error("Error in updateOrSetAvailabilityForDay:", error);
    res.status(500).json({ message: "An internal server error occurred while updating availability." });
  }
};

export const deleteAvailabilityByRange = async (req: Request, res: Response) => {
  const interviewerId = (req.user as Express.User).id;
  const { startTime, endTime } = req.body;

  if (!startTime || !endTime) {
    return res.status(400).json({ message: "Both 'startTime' and 'endTime' ISO strings are required." });
  }

  try {
    const slotStartTime = new Date(startTime);
    const slotEndTime = new Date(endTime);

    if (isNaN(slotStartTime.getTime()) || isNaN(slotEndTime.getTime())) {
      return res.status(400).json({ message: "Invalid date format. Please use full ISO 8601 date strings." });
    }

    const result = await prisma.availability.deleteMany({
      where: {
        interviewerId,
        isBooked: false,
        startTime: {
          gte: slotStartTime,
          lt: slotEndTime,
        },
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: `No unbooked slots were found in the specified time range to delete.` });
    }

    res.status(200).json({ message: `Successfully deleted ${result.count} unbooked slots.` });

  } catch (error) {
    console.error("Error deleting availability range:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
export const getAllAvailability = async (req: Request, res: Response) => {
  const interviewerId = (req.user as Express.User).id;
  const now = new Date();

  try {
    // 1. Fetch all future unbooked slots, sorted by time. This is crucial.
    const allSlots = await prisma.availability.findMany({
      where: {
        interviewerId,
        isBooked: false,
        startTime: {
          gte: now,
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    if (allSlots.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Group slots by date string (e.g., "2025-07-25")
    const groupedByDate: Record<string, { startTime: DateTime, endTime: DateTime }[]> = {};

    for (const slot of allSlots) {
      const startTimeLuxon = DateTime.fromJSDate(slot.startTime).setZone(TIME_ZONE);
      const dateKey = startTimeLuxon.toFormat('yyyy-MM-dd');

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      
      groupedByDate[dateKey].push({
        startTime: startTimeLuxon,
        endTime: DateTime.fromJSDate(slot.endTime).setZone(TIME_ZONE),
      });
    }

    // 3. Consolidate contiguous slots for each day
    const finalResult = Object.entries(groupedByDate).map(([date, slots]) => {
      const consolidatedRanges: { startTime: string, endTime: string }[] = [];
      
      if (slots.length > 0) {
        let currentRange = {
          startTime: slots[0].startTime,
          endTime: slots[0].endTime,
        };

        for (let i = 1; i < slots.length; i++) {
          const slot = slots[i];
          // If the next slot starts exactly when the current range ends, extend the range
          if (slot.startTime.equals(currentRange.endTime)) {
            currentRange.endTime = slot.endTime;
          } else {
            // Otherwise, the gap means the current range is finished
            consolidatedRanges.push({
              startTime: currentRange.startTime.toFormat('HH:mm'),
              endTime: currentRange.endTime.toFormat('HH:mm'),
            });
            currentRange = { startTime: slot.startTime, endTime: slot.endTime };
          }
        }
        // Add the last processed range
        consolidatedRanges.push({
            startTime: currentRange.startTime.toFormat('HH:mm'),
            endTime: currentRange.endTime.toFormat('HH:mm'),
        });
      }

      return { date, timeRanges: consolidatedRanges };
    });


    res.status(200).json(finalResult);

  } catch (error) {
    console.error("Error getting all availability:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

export const getAllMeetings = async (req: Request, res: Response) => {
  const interviewerId = (req.user as Express.User).id;

  try {
    const now = DateTime.now().setZone(TIME_ZONE);
    const todayStart = now.startOf('day');

    const bookings = await prisma.booking.findMany({
      where: { interviewerId: interviewerId },
      orderBy: { startTime: 'desc' },
    });

    // Fix: Properly type the categorizedMeetings object
    const categorizedMeetings: {
      todays: FormattedMeeting[];
      upcoming: FormattedMeeting[];
      past: FormattedMeeting[];
    } = {
      todays: [],
      upcoming: [],
      past: [],
    };

    for (const booking of bookings) {
      const meetingTime = DateTime.fromJSDate(booking.startTime, { zone: TIME_ZONE });

      const formattedMeeting: FormattedMeeting = {
        student_name: booking.studentName,
        student_email: booking.studentEmail,
        student_phone: booking.studentPhone,
        scheduled_date: meetingTime.toFormat('yyyy-MM-dd'),
        scheduled_time: meetingTime.toFormat('hh:mm a'),
        meeting_link: booking.meetingLink,
      };

      if (meetingTime >= todayStart && meetingTime < todayStart.plus({ days: 1 })) {
        categorizedMeetings.todays.push(formattedMeeting);
      } else if (meetingTime > todayStart) {
        categorizedMeetings.upcoming.push(formattedMeeting);
      } else {
        categorizedMeetings.past.push(formattedMeeting);
      }
    }

    res.status(200).json(categorizedMeetings);

  } catch (error) {
    console.error("Error fetching meetings:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};