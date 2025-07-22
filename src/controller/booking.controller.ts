import { PrismaClient, User, Booking } from '@prisma/client';
import { Request, Response } from 'express';
import { GoogleCalendarService } from '../services/GoogleCalendarService.js'; // Adjust path as needed

const prisma = new PrismaClient();

// Your getPublicAvailability function remains the same...
export const getPublicAvailability = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const fifteenDaysFromNow = new Date();
        fifteenDaysFromNow.setDate(now.getDate() + 15);

        const availableSlots = await prisma.availability.findMany({
            where: {
                isBooked: false,
                startTime: {
                    gte: now,
                    lte: fifteenDaysFromNow,
                },
            },
            select: {
                startTime: true,
                endTime: true,
            },
            orderBy: {
                startTime: 'asc',
            },
        });

        const groupedByDate = availableSlots.reduce((acc, slot) => {
            const date = slot.startTime.toISOString().split('T')[0];
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(slot);
            return acc;
        }, {} as Record<string, typeof availableSlots>);

        res.status(200).json(groupedByDate);
    } catch (error) {
        console.error("Error fetching public availability:", error);
        res.status(500).json({ message: "Failed to fetch availability." });
    }
};


export const createBooking = async (req: Request, res: Response) => {
    const { startTime, studentName, studentEmail, studentPhone } = req.body;

    if (!startTime || !studentName || !studentEmail) {
        return res.status(400).json({ message: "startTime, studentName, and studentEmail are required." });
    }

    const slotStartTime = new Date(startTime);
    if (isNaN(slotStartTime.getTime())) {
        return res.status(400).json({ message: "Invalid startTime format." });
    }

    let newBooking: Booking;
    let chosenInterviewer: User;

    try {
        const availableInterviewers = await prisma.availability.findMany({
            where: {
                startTime: slotStartTime,
                isBooked: false,
            },
            include: {
                interviewer: true,
            },
        });

        if (availableInterviewers.length === 0) {
            return res.status(404).json({ message: "Sorry, this time slot is no longer available. Please select another time." });
        }

        const randomIndex = Math.floor(Math.random() * availableInterviewers.length);
        const chosenAvailability = availableInterviewers[randomIndex];
        chosenInterviewer = chosenAvailability.interviewer;

        newBooking = await prisma.$transaction(async (tx) => {
            const lockedAvailability = await tx.availability.findUnique({
                where: { id: chosenAvailability.id },
            });

            if (!lockedAvailability || lockedAvailability.isBooked) {
                throw new Error("This slot was just booked by another user. Please try again.");
            }

            await tx.availability.update({
                where: { id: chosenAvailability.id },
                data: { isBooked: true },
            });

            return tx.booking.create({
                data: {
                    studentName,
                    studentEmail,
                    studentPhone,
                    interviewerId: chosenInterviewer.id,
                    availabilityId: chosenAvailability.id,
                    startTime: chosenAvailability.startTime,
                    endTime: chosenAvailability.endTime,
                },
            });
        });


        try {
            const calendarService = new GoogleCalendarService(chosenInterviewer.id);

            // Test connection first
            const connectionWorks = await calendarService.testConnection();
            if (!connectionWorks) {
                throw new Error(`Calendar connection failed. Interviewer ${chosenInterviewer.id} needs to reconnect their calendar.`);
            }

            const calendarEvent = await calendarService.createEvent({
                startTime: newBooking.startTime,
                endTime: newBooking.endTime,
                studentName: newBooking.studentName,
                studentEmail: newBooking.studentEmail,
                studentPhone: newBooking.studentPhone || undefined,
                interviewerEmail: chosenInterviewer.email,
                interviewerName: chosenInterviewer.name,
            });

            await prisma.booking.update({
                where: { id: newBooking.id },
                data: { googleEventId: calendarEvent.id },
            });

            console.log(`✅ Calendar event created successfully for booking ${newBooking.id}`);

        } catch (calendarError: any) {
            console.error(`CRITICAL: Booking ${newBooking.id} created, but failed to create Google Calendar event.`, calendarError);

            return res.status(500).json({
                message: "Booking confirmed, but failed to send calendar invite. Please contact the interviewer to reconnect their calendar. Reason: " + calendarError.message,
                booking: newBooking,
                requiresInterviewerAction: true,
                calendarError: true
            });
        }
        res.status(201).json({ message: "Booking successful! A calendar invitation has been sent.", booking: newBooking });

    } catch (error: any) {
        console.error("Booking failed during database transaction:", error);
        res.status(500).json({ message: error.message || "An unexpected error occurred during booking." });
    }
};
