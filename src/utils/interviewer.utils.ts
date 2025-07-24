// utils/interviewer.utils.ts
import { UserWithRelations, InterviewerResponse, Meeting } from '../types/interviewer.types.js';

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

export const generateDefaultMeetingLink = (bookingId: string): string => {
  return `https://meet.example.com/default-${bookingId}`;
};

export const getTodayDateString = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

export const isTodayDate = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export const filterTodaysMeetings = (bookings: UserWithRelations['interviewerBookings']): Meeting[] => {
  if (!bookings || bookings.length === 0) return [];
  
  return bookings
    .filter(booking => isTodayDate(booking.startTime))
    .map((booking): Meeting => ({
      intervieweeName: booking.studentName,
      intervieweeEmail: booking.studentEmail,
      date: formatDateToYMD(booking.startTime),
      time: formatTimeToAmPm(booking.startTime),
      meetingLink: booking.meetingLink || generateDefaultMeetingLink(booking.id)
    }));
};

export const transformUserToInterviewer = (user: UserWithRelations): InterviewerResponse => {
  const totalSlots: number = user.availabilities?.length || 0;
  const bookedSlots: number = user.availabilities?.filter(slot => slot.isBooked).length || 0;
  const availableSlots: number = totalSlots - bookedSlots;

  const todaysMeetings: Meeting[] = filterTodaysMeetings(user.interviewerBookings);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    totalSlots,
    bookedSlots,
    availableSlots,
    meetings: todaysMeetings
  };
};
