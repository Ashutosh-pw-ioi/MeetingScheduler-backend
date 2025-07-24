// services/studentService.ts
import { PrismaClient } from '@prisma/client';
import { BookingStatusCount } from '../types/student.types.js';

const prisma = new PrismaClient();

export class StudentService {
  static async getBookingStatusCount(): Promise<BookingStatusCount> {
    try {
      // Get all students
      const allStudents = await prisma.student.findMany({
        select: {
          phone: true,
        },
      });

      // Get all bookings with student phone numbers
      const allBookings = await prisma.booking.findMany({
        select: {
          studentPhone: true,
        },
      });

      // Create a set of booked phone numbers for faster lookup
      const bookedPhoneNumbers = new Set(
        allBookings
          .filter(booking => booking.studentPhone !== null)
          .map(booking => booking.studentPhone as string)
      );

      // Count booking status
      let bookedCount = 0;
      
      allStudents.forEach(student => {
        if (bookedPhoneNumbers.has(student.phone)) {
          bookedCount++;
        }
      });

      const totalStudents = allStudents.length;
      const notBookedCount = totalStudents - bookedCount;

      return {
        totalStudents,
        bookedCount,
        notBookedCount,
      };

    } catch (error) {
      console.error('Error calculating booking status count:', error);
      throw error;
    }
  }

  static async isStudentAuthorized(phone: string): Promise<boolean> {
    try {
      const student = await prisma.student.findUnique({
        where: { phone },
      });

      return !!student;
    } catch (error) {
      console.error('Error checking student authorization:', error);
      return false;
    }
  }
}
