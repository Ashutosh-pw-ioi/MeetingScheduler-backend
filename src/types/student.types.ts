

export interface BookingStatusCount {
  totalStudents: number;
  bookedCount: number;
  notBookedCount: number;
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

