// types/interviewee.types.ts
export interface IntervieweeDetails {
  interviewerName: string;
  date: string;
  time: string;
  meetingLink: string;
}

export interface IntervieweeResponse {
  name: string;
  email: string;
  phone: string | null;
  slotBooked: boolean;
  details?: IntervieweeDetails;
}


// Prisma types based on your schema
export type BookingWithRelations = {
  id: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  startTime: Date;
  endTime: Date;
  meetingLink: string | null;
  interviewer: {
    id: string;
    name: string;
    email: string;
  };
};

export type IntervieweeWithBooking = {
  studentEmail: string;
  studentName: string;
  studentPhone: string | null;
  booking?: BookingWithRelations;
};
