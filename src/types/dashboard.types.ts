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

export interface DashboardResponse {
  metrics: MetricData[];
  pieCharts: PieChartData[];
  barChartData: BarChartDataPoint[];
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