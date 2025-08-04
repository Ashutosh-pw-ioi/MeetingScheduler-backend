  export interface MetricData {
    title: string;
    value: number | string;
    subtitle: string;
  }

  export interface PieChartDataPoint {
    name: string;
    value: number;
  }

  export interface PieChartData {
    title: string;
    data: PieChartDataPoint[];
  }

  export interface BarChartDataPoint {
    name: string;
    interviews: number;
  }

  // New interface for daily breakdown
  export interface DailyBreakdown {
    date: string;
    totalSlots: number;
    bookedSlots: number;
    availableSlots: number;
    bookingRate: string;
  }

  export interface DashboardResponse {
    metrics: MetricData[];
    pieCharts: PieChartData[];
    barChartData: BarChartDataPoint[];
    dailyBreakdown?: {
      today: DailyBreakdown;
      tomorrow: DailyBreakdown;
      dayAfterTomorrow: DailyBreakdown;
    };
  }

  // Keep the original DashboardBooking for other uses if needed
  export interface DashboardBooking {
    id: string;
    studentEmail: string;
    startTime: Date;
    interviewer: DashboardUser;
  }

  export interface DashboardUser {
    id: string;
    name: string;
    email: string;
  }

  // New interface specifically for weekly chart data
  export interface WeeklyBookingData {
    startTime: Date;
  }

  // API Response wrapper interfaces
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