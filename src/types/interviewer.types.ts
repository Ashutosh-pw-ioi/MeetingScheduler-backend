// types/interviewer.types.ts
export interface Meeting {
  intervieweeName: string;
  intervieweeEmail: string;
  date: string;
  time: string;
  meetingLink: string;
}

export interface InterviewerResponse {
  id: string;
  name: string;
  email: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  meetings: Meeting[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface ErrorResponse {
  success: boolean;
  message: string;
  error?: string;
}

export type UserWithRelations = {
  id: string;
  name: string;
  email: string;
  availabilities: {
    id: string;
    isBooked: boolean;
  }[];
  interviewerBookings: {
    id: string;
    studentName: string;
    studentEmail: string;
    startTime: Date;
    meetingLink: string | null;
  }[];
};
