// utils/dashboard.utils.ts
import { BarChartDataPoint, DashboardBooking } from '../types/dashboard.types.js';

export const getTodayDateRange = (): { startOfDay: Date; endOfDay: Date } => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  
  return { startOfDay, endOfDay };
};

export const getWeekDateRange = (): { startOfWeek: Date; endOfWeek: Date } => {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  
  // Calculate start of week (Monday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Calculate end of week (Sunday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  
  return { startOfWeek, endOfWeek };
};

export const formatBookingRate = (booked: number, total: number): string => {
  if (total === 0) return "0%";
  return `${Math.round((booked / total) * 100)}%`;
};

export const getDayName = (date: Date): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
};

export const generateWeeklyBarChartData = (bookings: DashboardBooking[]): BarChartDataPoint[] => {
  const { startOfWeek } = getWeekDateRange();
  
  // Initialize data for each day of the week
  const weekData: BarChartDataPoint[] = [];
  
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(startOfWeek);
    currentDate.setDate(startOfWeek.getDate() + i);
    
    weekData.push({
      name: getDayName(currentDate),
      interviews: 0
    });
  }
  
  // Count interviews for each day
  bookings.forEach(booking => {
    const bookingDate = new Date(booking.startTime);
    const dayIndex = (bookingDate.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0 format
    
    if (dayIndex >= 0 && dayIndex < 7) {
      weekData[dayIndex].interviews++;
    }
  });
  
  return weekData;
};

export const getTodayFormatted = (): string => {
  return new Date().toISOString().split('T')[0];
};
