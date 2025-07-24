// types/dashboard.types.ts
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


// Extended Prisma types
export type DashboardBooking = {
  id: string;
  studentEmail: string;
  startTime: Date;
  interviewer: {
    id: string;
  };
};

export type DashboardUser = {
  id: string;
  availabilities: {
    id: string;
    isBooked: boolean;
  }[];
};
