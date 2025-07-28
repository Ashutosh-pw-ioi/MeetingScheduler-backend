import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { StudentService } from '../services/studentService.js';
import { 
  InterviewerResponse, 
  ApiResponse, 
  ErrorResponse, 
} from '../types/interviewer.types.js';
import { transformUserToInterviewer, getTodayDateString } from '../utils/interviewer.utils.js';
import { 
  IntervieweeResponse, 
  BookingWithRelations
} from '../types/interviewee.types.js';
import { transformToIntervieweeResponse } from '../utils/interviewee.utils.js';
import { 
  DashboardResponse,
  MetricData,
  PieChartData,
} from '../types/dashboard.types.js';
import { 
  getTodayDateRange, 
  getWeekDateRange,
  formatBookingRate,
  generateWeeklyBarChartData,
  getTodayFormatted
} from '../utils/dashboard.utils.js';
const prisma = new PrismaClient();

export const getAllInterviewers = async (
  req: Request,
  res: Response<ApiResponse<InterviewerResponse[]> | ErrorResponse>
): Promise<void> => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Using only select for better performance
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        availabilities: {
          select: {
            id: true,
            isBooked: true
          }
        },
        interviewerBookings: {
          where: {
            startTime: {
              gte: startOfDay,
              lt: endOfDay
            }
          },
          select: {
            id: true,
            studentName: true,
            studentEmail: true,
            startTime: true,
            meetingLink: true
          }
        }
      }
    });

    const formattedInterviewers: InterviewerResponse[] = allUsers.map(transformUserToInterviewer);

    res.status(200).json({
      success: true,
      data: formattedInterviewers,
      message: `All users with today's meetings (${getTodayDateString()}) fetched successfully`
    });

  } catch (error: unknown) {
    console.error('Error fetching all users:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export const getAllInterviewees = async (
  req: Request,
  res: Response<ApiResponse<IntervieweeResponse[]> | ErrorResponse>
): Promise<void> => {
  try {
    // Fetch all bookings with interviewer details
    const bookings: BookingWithRelations[] = await prisma.booking.findMany({
      include: {
        interviewer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Create a map of students with their bookings
    const studentsMap = new Map<string, {
      name: string;
      email: string;
      phone: string | null;
      booking?: BookingWithRelations;
    }>();

    // Add students with bookings
    bookings.forEach(booking => {
      studentsMap.set(booking.studentEmail, {
        name: booking.studentName,
        email: booking.studentEmail,
        phone: booking.studentPhone,
        booking: booking
      });
    });

    // Note: If you have students without bookings in a separate table/collection,
    // you would fetch them here and add to the map
    // For now, we only have students who have made bookings based on your schema

    // Transform to response format
    const interviewees: IntervieweeResponse[] = Array.from(studentsMap.values()).map(student =>
      transformToIntervieweeResponse(
        student.name,
        student.email,
        student.phone,
        student.booking
      )
    );

    const response: ApiResponse<IntervieweeResponse[]> = {
      success: true,
      data: interviewees,
      message: 'All interviewees fetched successfully'
    };

    res.status(200).json(response);

  } catch (error: unknown) {
    console.error('Error fetching interviewees:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    const errorResponse: ErrorResponse = {
      success: false,
      message: 'Failed to fetch interviewees',
      error: errorMessage
    };

    res.status(500).json(errorResponse);
  }
};
export const getTodaysDashboard = async (
  req: Request,
  res: Response<ApiResponse<DashboardResponse> | ErrorResponse>
): Promise<void> => {
  try {
    const { startOfWeek, endOfWeek } = getWeekDateRange();

    // Get all required data in parallel
    const [
      interviewers,
      bookingStatusCount,
      totalSlots,
      bookedSlots,
      weeklyBookings
    ] = await Promise.all([
      // Count users with availability slots
      prisma.user.count({
        where: {
          availabilities: {
            some: {}
          }
        }
      }),

      // Get booking status count using our service
      StudentService.getBookingStatusCount(),

      // Total availability slots
      prisma.availability.count(),

      // Booked slots
      prisma.availability.count({
        where: { isBooked: true }
      }),

      // This week's bookings for bar chart
      prisma.booking.findMany({
        where: {
          startTime: {
            gte: startOfWeek,
            lt: endOfWeek
          }
        },
        select: {
          startTime: true
        }
      })
    ]);

    // Calculate metrics
    const availableSlots = totalSlots - bookedSlots;
    const bookingRate = formatBookingRate(bookedSlots, totalSlots);

    // Build response data
    const metrics: MetricData[] = [
      {
        title: "Total Interviewers",
        value: interviewers,
        subtitle: "Active interviewers"
      },
      {
        title: "Total Students",
        value: bookingStatusCount.totalStudents,
        subtitle: "Registered students"
      },
      {
        title: "Total Slots",
        value: totalSlots,
        subtitle: "Combined slot count"
      },
      {
        title: "Booking Rate",
        value: bookingRate,
        subtitle: "Utilization percentage"
      }
    ];

    const pieCharts: PieChartData[] = [
      {
        title: "Slot Utilization",
        data: [
          { name: "Booked", value: bookedSlots },
          { name: "Available", value: availableSlots }
        ]
      },
      {
        title: "Student Booking Status",
        data: [
          { name: "Booked", value: bookingStatusCount.bookedCount },
          { name: "Not Booked", value: bookingStatusCount.notBookedCount }
        ]
      }
    ];

    const barChartData = generateWeeklyBarChartData(weeklyBookings);

    const dashboardData: DashboardResponse = {
      metrics,
      pieCharts,
      barChartData
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data fetched successfully'
    });

  } catch (error: unknown) {
    console.error('Error fetching dashboard data:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};
export const getBookedInterviews = async (req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany();
    const result: {
      applicationId: string;
      phone:string;
      interviewer: string;
      interviewDate: Date;
    }[] = [];

    for (const student of students) {
      const bookings = await prisma.booking.findMany({
        where: {
          AND: [
            {
              OR: [
                { studentEmail: student.email },
                { studentPhone: student.phone }
              ]
            },
            {
              availability: {
                isBooked: true
              }
            }
          ]
        },
        include: {
          interviewer: {
            select: { name: true }
          }
        }
      });

      for (const booking of bookings) {
        result.push({
          applicationId: student.applicationId,
          phone:student.phone,
          interviewer: booking.interviewer.name,
          interviewDate: booking.startTime
        });
      }
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error('Error fetching interview bookings:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};