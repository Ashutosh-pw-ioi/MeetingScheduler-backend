import { PrismaClient, Department, Booking, User } from '@prisma/client';
import { Request, Response } from 'express';
import { DateTime } from 'luxon';
// Import your real GoogleCalendarService here
import { GoogleCalendarService } from '../services/GoogleCalendarService.js';

const prisma = new PrismaClient();
const TIME_ZONE = 'Asia/Kolkata';

export const getPublicAvailability = async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required in URL parameter." });
    }

    // Find the student to get their department
    const student = await prisma.student.findUnique({
      where: { phone },
      select: { department: true }
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found with the provided phone number." });
    }

    // Check if there are interviewers in the student's department at all
    const interviewerCount = await prisma.user.count({
      where: { department: student.department }
    });

    if (interviewerCount === 0) {
      return res.status(404).json({
        message: `No interviewers found in student's department (${student.department}). Cannot show availability.`
      });
    }

    const now = new Date();
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(now.getDate() + 15);

    // Find availability slots from interviewers in student's department
    const availableSlots = await prisma.availability.findMany({
      where: {
        isBooked: false,
        startTime: {
          gte: now,
          lte: fifteenDaysFromNow,
        },
        interviewer: {
          department: student.department,
        }
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' }
    });

    if (availableSlots.length === 0) {
      return res.status(404).json({
        message: `No available slots found for department (${student.department}) in the next 15 days.`
      });
    }

    // Group slots by date formatted in IST
    const groupedByDate = availableSlots.reduce((acc, slot) => {
      const startTimeIST = DateTime.fromJSDate(slot.startTime).setZone(TIME_ZONE);
      const endTimeIST = DateTime.fromJSDate(slot.endTime).setZone(TIME_ZONE);

      const date = startTimeIST.toFormat('yyyy-MM-dd');
      if (!acc[date]) acc[date] = [];

      acc[date].push({
        id: slot.id,
        startTime: startTimeIST.toFormat('HH:mm'),
        endTime: endTimeIST.toFormat('HH:mm'),
        startTimeISO: slot.startTime.toISOString(),
        endTimeISO: slot.endTime.toISOString(),
        displayTime: `${startTimeIST.toFormat('HH:mm')} - ${endTimeIST.toFormat('HH:mm')} IST`
      });

      return acc;
    }, {} as Record<string, any[]>);

    return res.status(200).json({
      availability: groupedByDate,
      timezone: TIME_ZONE,
      note: "Display times are in Indian Standard Time (IST). Use startTimeISO for booking."
    });

  } catch (error) {
    console.error("Error fetching public availability:", error);
    return res.status(500).json({ message: "Failed to fetch availability." });
  }
};


export const createBooking = async (req: Request, res: Response) => {
  const { startTime, studentName, studentEmail, studentPhone } = req.body;

  if (!startTime || !studentName || !studentEmail || !studentPhone) {
    return res.status(400).json({
      message: "startTime, studentName, studentEmail, and studentPhone are required."
    });
  }

  // Basic validations
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

  try {
    // Fetch student and their department
    const student = await prisma.student.findUnique({
      where: { phone: sanitizedData.studentPhone },
      select: { department: true }
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found by phone number provided." });
    }

    // Check that department has interviewers
    const interviewerCount = await prisma.user.count({
      where: { department: student.department }
    });

    if (interviewerCount === 0) {
      return res.status(409).json({
        message: `No interviewers available in student's department (${student.department}). Cannot proceed with booking.`
      });
    }

    // Check if student already has a booking (conflict)
    const existingBooking = await prisma.booking.findFirst({
      where: {
        studentEmail: sanitizedData.studentEmail,
      },
      include: {
        interviewer: { select: { name: true } }
      },
      orderBy: { startTime: 'desc' }
    });

    if (existingBooking) {
      const bookingDateTime = DateTime.fromJSDate(existingBooking.startTime).setZone(TIME_ZONE);
      const isPastBooking = bookingDateTime < now;
      const isFutureBooking = bookingDateTime > now;

      let statusMessage = isPastBooking
        ? `You have already completed an interview on ${bookingDateTime.toFormat('dd MMMM yyyy, HH:mm')} IST`
        : (isFutureBooking
          ? `You have an upcoming interview scheduled on ${bookingDateTime.toFormat('dd MMMM yyyy, HH:mm')} IST`
          : `You have an interview scheduled for today at ${bookingDateTime.toFormat('HH:mm')} IST`);

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

    // Find available slots for that exact start time and student's department
    const availableSlots = await prisma.availability.findMany({
      where: {
        startTime: slotStartTime,
        isBooked: false,
        interviewer: { department: student.department }
      },
      include: { interviewer: true }
    });

    if (availableSlots.length === 0) {
      return res.status(404).json({
        message: `Sorry, no available interview slots at this time for your department (${student.department}). Please select another time.`
      });
    }

    // Pick a random slot
    const randomIndex = Math.floor(Math.random() * availableSlots.length);
    const chosenAvailability = availableSlots[randomIndex];
    const chosenInterviewer = chosenAvailability.interviewer;

    // Transaction to prevent race conditions
    const newBooking = await prisma.$transaction(async (tx) => {
      // Check again if student booked meanwhile
      const doubleCheckBooking = await tx.booking.findFirst({ where: { studentEmail: sanitizedData.studentEmail } });
      if (doubleCheckBooking) {
        throw new Error("Another booking was created for this student during processing. Only one booking per student is allowed.");
      }

      // Lock the chosen availability slot
      const lockedAvailability = await tx.availability.findUnique({ where: { id: chosenAvailability.id } });
      if (!lockedAvailability || lockedAvailability.isBooked) {
        throw new Error("This time slot was just booked by another user. Please try again.");
      }

      await tx.availability.update({
        where: { id: chosenAvailability.id },
        data: { isBooked: true }
      });

      // Create booking record
      return tx.booking.create({
        data: {
          studentName: sanitizedData.studentName,
          studentEmail: sanitizedData.studentEmail,
          studentPhone: sanitizedData.studentPhone,
          interviewerId: chosenInterviewer.id,
          availabilityId: chosenAvailability.id,
          startTime: chosenAvailability.startTime,
          endTime: chosenAvailability.endTime,
        }
      });
    });

    // Google Calendar integration (with fallback)

    let meetingLink = "https://meet.google.com/new"; // default fallback link
    let calendarSuccess = false;
    let calendarErrorMessage = "";

    try {
      const calendarService = new GoogleCalendarService(chosenInterviewer.id);

      const connectionWorks = await calendarService.testConnection();
      if (!connectionWorks) throw new Error(`Calendar connection failed for interviewer ${chosenInterviewer.name}`);

      const calendarEvent = await calendarService.createEvent({
        startTime: newBooking.startTime,
        endTime: newBooking.endTime,
        studentName: newBooking.studentName,
        studentEmail: newBooking.studentEmail,
        studentPhone: newBooking.studentPhone || undefined,
        interviewerEmail: chosenInterviewer.email,
        interviewerName: chosenInterviewer.name,
        department: chosenInterviewer.department,
      });

      // Extract meeting link helper
      meetingLink = extractMeetingLink(calendarEvent);

      // Save googleEventId and meetingLink
      await prisma.booking.update({
        where: { id: newBooking.id },
        data: {
          googleEventId: calendarEvent.id,
          meetingLink
        }
      });

      calendarSuccess = true;
      console.log(`✅ Calendar event created for booking ${newBooking.id} with link: ${meetingLink}`);

    } catch (calendarErr) {
      calendarErrorMessage = calendarErr instanceof Error ? calendarErr.message : "Unknown calendar error";
      console.error(`Calendar event creation failed for booking ${newBooking.id}:`, calendarErr);

      // Save fallback meeting link anyway
      try {
        await prisma.booking.update({
          where: { id: newBooking.id },
          data: { meetingLink }
        });
        console.log(`📌 Fallback meeting link saved for booking ${newBooking.id}.`);
      } catch (dbErr) {
        console.error(`Failed to save fallback meeting link for booking ${newBooking.id}:`, dbErr);
      }
    }

    const bookingDateTime = DateTime.fromJSDate(newBooking.startTime).setZone(TIME_ZONE);

    return res.status(calendarSuccess ? 201 : 206).json({
      message: `Booking successful! You cannot book another interview.${calendarSuccess ? " A calendar invite has been sent." : " However, calendar invite creation failed."}`,
      booking: {
        ...newBooking,
        startTimeIST: bookingDateTime.toFormat('dd MMMM yyyy, HH:mm'),
        endTimeIST: DateTime.fromJSDate(newBooking.endTime).setZone(TIME_ZONE).toFormat('dd MMMM yyyy, HH:mm'),
        timezone: TIME_ZONE,
      },
      interviewer: {
        name: chosenInterviewer.name,
        email: chosenInterviewer.email,
      },
      meetingLink,
      importantNote: "Please attend the interview at the scheduled time. No modifications allowed.",
      calendarError: !calendarSuccess,
      ...(calendarErrorMessage && { calendarErrorDetails: calendarErrorMessage }),
    });

  } catch (error) {
    console.error("Booking process failed:", error);

    if (error instanceof Error) {
      if (error.message.includes("slot was just booked") || error.message.includes("Only one booking per student")) {
        return res.status(409).json({ message: error.message });
      }
    }

    return res.status(500).json({ message: "An unexpected error occurred during booking." });
  }
};

// Helper to extract meeting link from Google Calendar event object
function extractMeetingLink(calendarEvent: any): string {
  if (calendarEvent.hangoutLink) return calendarEvent.hangoutLink;

  if (calendarEvent.conferenceData?.entryPoints) {
    const videoEntry = calendarEvent.conferenceData.entryPoints.find(
      (entry: any) => entry.entryPointType === 'video'
    );
    if (videoEntry?.uri) return videoEntry.uri;
  }

  if (calendarEvent.location && calendarEvent.location.includes('meet.google.com')) {
    return calendarEvent.location;
  }

  // Fallback random meeting link identifier
  const roomId = Math.random().toString(36).substring(2, 15);
  return `https://meet.google.com/${roomId}`;
}
