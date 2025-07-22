import { PrismaClient, User, Booking } from '@prisma/client';
import { Request, Response } from 'express';
import { DateTime } from 'luxon'; // Add this import
import { GoogleCalendarService } from '../services/GoogleCalendarService.js';

const prisma = new PrismaClient();
const TIME_ZONE = 'Asia/Kolkata';

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
                id: true,
                startTime: true,
                endTime: true,
            },
            orderBy: {
                startTime: 'asc',
            },
        });

        // Convert UTC times back to IST for display
        const groupedByDate = availableSlots.reduce((acc, slot) => {
            // Convert to IST for grouping and display
            const startTimeIST = DateTime.fromJSDate(slot.startTime).setZone(TIME_ZONE);
            const endTimeIST = DateTime.fromJSDate(slot.endTime).setZone(TIME_ZONE);
            
            const date = startTimeIST.toFormat('yyyy-MM-dd');
            
            if (!acc[date]) {
                acc[date] = [];
            }
            
            acc[date].push({
                id: slot.id,
                startTime: startTimeIST.toFormat('HH:mm'),
                endTime: endTimeIST.toFormat('HH:mm'),
                startTimeISO: slot.startTime.toISOString(), // Keep original UTC time for booking
                endTimeISO: slot.endTime.toISOString(),
                displayTime: `${startTimeIST.toFormat('HH:mm')} - ${endTimeIST.toFormat('HH:mm')} IST`
            });
            
            return acc;
        }, {} as Record<string, any>);

        res.status(200).json({
            availability: groupedByDate,
            timezone: TIME_ZONE,
            note: 'Display times are in Indian Standard Time (IST). Use startTimeISO for booking.'
        });
        
    } catch (error) {
        console.error("Error fetching public availability:", error);
        res.status(500).json({ message: "Failed to fetch availability." });
    }
};

// Rest of your createBooking function remains the same
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
        // Check if student has ANY booking (past, present, or future)
        const existingBooking = await prisma.booking.findFirst({
            where: {
                studentEmail: studentEmail,
            },
            include: {
                interviewer: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                startTime: 'desc',
            },
        });

        if (existingBooking) {
            const bookingDateTime = DateTime.fromJSDate(existingBooking.startTime).setZone(TIME_ZONE);
            const isPastBooking = bookingDateTime < DateTime.now().setZone(TIME_ZONE);
            const isFutureBooking = bookingDateTime > DateTime.now().setZone(TIME_ZONE);
            
            let statusMessage;
            if (isPastBooking) {
                statusMessage = `You have already completed an interview on ${bookingDateTime.toFormat('dd MMMM yyyy, HH:mm')} IST`;
            } else if (isFutureBooking) {
                statusMessage = `You have an upcoming interview scheduled on ${bookingDateTime.toFormat('dd MMMM yyyy, HH:mm')} IST`;
            } else {
                statusMessage = `You have an interview scheduled for today at ${bookingDateTime.toFormat('HH:mm')} IST`;
            }
            
            return res.status(400).json({ 
                message: `Only one interview booking is allowed per student. ${statusMessage} with ${existingBooking.interviewer.name}.`,
                existingBooking: {
                    id: existingBooking.id,
                    startTime: bookingDateTime.toFormat('dd MMMM yyyy, HH:mm'),
                    timezone: TIME_ZONE,
                    interviewerName: existingBooking.interviewer.name,
                    status: isPastBooking ? 'completed' : 'scheduled'
                },
                canBook: false
            });
        }

        // Proceed with normal booking flow if no existing booking found
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
            // Double-check for existing booking within transaction
            const doubleCheckBooking = await tx.booking.findFirst({
                where: { studentEmail: studentEmail }
            });

            if (doubleCheckBooking) {
                throw new Error("Another booking was created for this student during processing. Only one booking per student is allowed.");
            }

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

        // Calendar event creation
        try {
            const calendarService = new GoogleCalendarService(chosenInterviewer.id);
            
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
                message: "Booking confirmed, but failed to send calendar invite. Please contact the interviewer. Reason: " + calendarError.message,
                booking: {
                    ...newBooking,
                    startTimeIST: DateTime.fromJSDate(newBooking.startTime).setZone(TIME_ZONE).toFormat('dd MMMM yyyy, HH:mm'),
                    timezone: TIME_ZONE
                },
                requiresInterviewerAction: true,
                calendarError: true
            });
        }

        const bookingDateTime = DateTime.fromJSDate(newBooking.startTime).setZone(TIME_ZONE);
        
        res.status(201).json({ 
            message: "Booking successful! This is your only allowed interview booking. A calendar invitation has been sent.", 
            booking: {
                ...newBooking,
                startTimeIST: bookingDateTime.toFormat('dd MMMM yyyy, HH:mm'),
                endTimeIST: DateTime.fromJSDate(newBooking.endTime).setZone(TIME_ZONE).toFormat('dd MMMM yyyy, HH:mm'),
                timezone: TIME_ZONE
            },
            interviewer: {
                name: chosenInterviewer.name,
                email: chosenInterviewer.email
            },
            importantNote: "You cannot book another interview or modify this booking. Please ensure you attend at the scheduled time."
        });

    } catch (error: any) {
        console.error("Booking failed during database transaction:", error);
        res.status(500).json({ message: error.message || "An unexpected error occurred during booking." });
    }
};
