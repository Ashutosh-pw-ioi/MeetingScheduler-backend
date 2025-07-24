// utils/interviewee.utils.ts
import { IntervieweeResponse, IntervieweeDetails, BookingWithRelations } from '../types/interviewee.types.js';

export const formatTimeToAmPm = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
};

export const formatDateToYMD = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const generateDefaultMeetingLink = (interviewerName: string, studentName: string): string => {
  const formattedInterviewer = interviewerName.toLowerCase().replace(/\s+/g, '-');
  const formattedStudent = studentName.toLowerCase().replace(/\s+/g, '-');
  return `https://meet.example.com/${formattedInterviewer}-${formattedStudent}`;
};

export const transformBookingToDetails = (booking: BookingWithRelations): IntervieweeDetails => {
  return {
    interviewerName: booking.interviewer.name,
    date: formatDateToYMD(booking.startTime),
    time: formatTimeToAmPm(booking.startTime),
    meetingLink: booking.meetingLink || generateDefaultMeetingLink(booking.interviewer.name, booking.studentName)
  };
};

export const transformToIntervieweeResponse = (
  studentName: string,
  studentEmail: string,
  studentPhone: string | null,
  booking?: BookingWithRelations
): IntervieweeResponse => {
  const interviewee: IntervieweeResponse = {
    name: studentName,
    email: studentEmail,
    phone: studentPhone,
    slotBooked: !!booking
  };

  if (booking) {
    interviewee.details = transformBookingToDetails(booking);
  }

  return interviewee;
};
