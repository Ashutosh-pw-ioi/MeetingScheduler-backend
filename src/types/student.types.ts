import { Department } from '@prisma/client';

export interface StudentInput {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  department: Department; 
}

export interface BookingStatusCount {
  totalStudents: number;
  bookedCount: number;
  notBookedCount: number;
}

export interface ApiResponse<T = any> { // Made generic with default type
  success: boolean;
  data: T;
  message: string;
}

export interface ErrorResponse {
  success: boolean;
  message: string;
  error?: string;
}