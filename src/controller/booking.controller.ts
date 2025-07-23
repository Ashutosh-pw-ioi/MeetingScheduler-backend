import { PrismaClient, User, Booking } from '@prisma/client';
import { Request, Response } from 'express';
import { DateTime } from 'luxon'; 
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

        const groupedByDate = availableSlots.reduce((acc, slot) => {
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
                startTimeISO: slot.startTime.toISOString(), 
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


export const createBooking = async (req: Request, res: Response) => {
    const { startTime, studentName, studentEmail, studentPhone } = req.body;

    if (!startTime || !studentName || !studentEmail || !studentPhone) {
        return res.status(400).json({ 
            message: "startTime, studentName, studentEmail, and studentPhone are required." 
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(studentEmail)) {
        return res.status(400).json({ message: "Please provide a valid email address." });
    }

    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    if (!phoneRegex.test(studentPhone)) {
        return res.status(400).json({ message: "Please provide a valid phone number." });
    }

    const sanitizedData = {
        studentName: studentName.trim(),
        studentEmail: studentEmail.toLowerCase().trim(),
        studentPhone: studentPhone.trim()
    };

    const slotStartTime = new Date(startTime);
    if (isNaN(slotStartTime.getTime())) {
        return res.status(400).json({ message: "Invalid startTime format. Please provide a valid ISO date string." });
    }

    const now = DateTime.now().setZone(TIME_ZONE);
    const slotDateTime = DateTime.fromJSDate(slotStartTime).setZone(TIME_ZONE);
    
    if (slotDateTime < now) {
        return res.status(400).json({ message: "Cannot book a slot in the past. Please select a future time slot." });
    }

    let newBooking: Booking;
    let chosenInterviewer: User;
    let meetingLink = "https://meet.google.com/new"; // Default fallback

    try {
        const existingBooking = await prisma.booking.findFirst({
            where: {
                studentEmail: sanitizedData.studentEmail,
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
            
            return res.status(409).json({ 
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
            return res.status(404).json({ 
                message: "Sorry, this time slot is no longer available. Please select another time." 
            });
        }

        const randomIndex = Math.floor(Math.random() * availableInterviewers.length);
        const chosenAvailability = availableInterviewers[randomIndex];
        chosenInterviewer = chosenAvailability.interviewer;

        // Create booking in transaction
        newBooking = await prisma.$transaction(async (tx) => {
            const doubleCheckBooking = await tx.booking.findFirst({
                where: { studentEmail: sanitizedData.studentEmail }
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
                    studentName: sanitizedData.studentName,
                    studentEmail: sanitizedData.studentEmail,
                    studentPhone: sanitizedData.studentPhone,
                    interviewerId: chosenInterviewer.id,
                    availabilityId: chosenAvailability.id,
                    startTime: chosenAvailability.startTime,
                    endTime: chosenAvailability.endTime,
                },
            });
        });

        // Create Google Calendar event and save meeting link
        let calendarSuccess = false;
        let calendarErrorMessage = "";

        try {
            const calendarService = new GoogleCalendarService(chosenInterviewer.id);
            
            const connectionWorks = await calendarService.testConnection();
            if (!connectionWorks) {
                throw new Error(`Calendar connection failed for interviewer ${chosenInterviewer.name}`);
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

            // Extract the actual meeting link from the calendar event
            meetingLink = extractMeetingLink(calendarEvent);

            // **CRITICAL UPDATE:** Save both googleEventId AND meetingLink to the database
            await prisma.booking.update({
                where: { id: newBooking.id },
                data: { 
                    googleEventId: calendarEvent.id,
                    meetingLink: meetingLink // Save the meeting link to DB
                },
            });

            calendarSuccess = true;
            console.log(`✅ Calendar event created successfully for booking ${newBooking.id} with meeting link: ${meetingLink}`);

        } catch (calendarError: unknown) {
            calendarErrorMessage = calendarError instanceof Error ? calendarError.message : "Unknown calendar error";
            console.error(`CRITICAL: Booking ${newBooking.id} created, but failed to create Google Calendar event.`, calendarError);
            
            // Even if calendar fails, we still save the fallback meeting link
            try {
                await prisma.booking.update({
                    where: { id: newBooking.id },
                    data: { 
                        meetingLink: meetingLink // Save fallback meeting link
                    },
                });
                console.log(`📌 Fallback meeting link saved for booking ${newBooking.id}: ${meetingLink}`);
            } catch (dbError) {
                console.error(`Failed to save fallback meeting link to database:`, dbError);
            }
            
            calendarSuccess = false;
        }

        // Get the updated booking with the meeting link
        const updatedBooking = await prisma.booking.findUnique({
            where: { id: newBooking.id }
        });

        const bookingDateTime = DateTime.fromJSDate(newBooking.startTime).setZone(TIME_ZONE);
        
        let responseMessage = "Booking successful! This is your only allowed interview booking.";
        if (calendarSuccess) {
            responseMessage += " A calendar invitation has been sent.";
        } else {
            responseMessage += " However, there was an issue sending the calendar invitation.";
        }

        const response = {
            message: responseMessage,
            booking: {
                ...(updatedBooking || newBooking), // Use updated booking if available
                startTimeIST: bookingDateTime.toFormat('dd MMMM yyyy, HH:mm'),
                endTimeIST: DateTime.fromJSDate(newBooking.endTime).setZone(TIME_ZONE).toFormat('dd MMMM yyyy, HH:mm'),
                timezone: TIME_ZONE
            },
            interviewer: {
                name: chosenInterviewer.name,
                email: chosenInterviewer.email
            },
            meetingLink: meetingLink, // This will be the actual meeting link or fallback
            importantNote: "You cannot book another interview or modify this booking. Please ensure you attend at the scheduled time.",
            calendarError: !calendarSuccess,
            ...(calendarErrorMessage && { calendarErrorDetails: calendarErrorMessage })
        };

        const statusCode = calendarSuccess ? 201 : 206;
        res.status(statusCode).json(response);

    } catch (error: unknown) {
        console.error("Booking failed during database transaction:", error);
        
        if (error instanceof Error) {
            if (error.message.includes("slot was just booked")) {
                return res.status(409).json({ message: error.message });
            }
            if (error.message.includes("Only one booking per student")) {
                return res.status(409).json({ message: error.message });
            }
        }
        
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during booking.";
        res.status(500).json({ message: errorMessage });
    }
};

function extractMeetingLink(calendarEvent: any): string {
    if (calendarEvent.hangoutLink) {
        return calendarEvent.hangoutLink;
    }
    
    if (calendarEvent.conferenceData?.entryPoints) {
        const videoEntry = calendarEvent.conferenceData.entryPoints.find(
            (entry: any) => entry.entryPointType === 'video'
        );
        if (videoEntry?.uri) {
            return videoEntry.uri;
        }
    }
    
    if (calendarEvent.location && calendarEvent.location.includes('meet.google.com')) {
        return calendarEvent.location;
    }
    
    const roomId = Math.random().toString(36).substring(2, 15);
    return `https://meet.google.com/${roomId}`;
}
