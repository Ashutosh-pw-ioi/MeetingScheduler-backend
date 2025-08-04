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
  BarChartDataPoint
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
export const getThreeDaysDashboard = async (
  req: Request,
  res: Response<ApiResponse<DashboardResponse> | ErrorResponse>
): Promise<void> => {
  try {
    // Get date ranges for today, tomorrow, and day after tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);

    // Set time boundaries (start and end of each day)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayStart.getDate() + 1);

    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowStart.getDate() + 1);

    const dayAfterTomorrowStart = new Date(dayAfterTomorrow.getFullYear(), dayAfterTomorrow.getMonth(), dayAfterTomorrow.getDate());
    const dayAfterTomorrowEnd = new Date(dayAfterTomorrowStart);
    dayAfterTomorrowEnd.setDate(dayAfterTomorrowStart.getDate() + 1);

    // Get all required data in parallel
    const [
      interviewers,
      bookingStatusCount,
      
      // Today's data
      todayTotalSlots,
      todayBookedSlots,
      todayBookings,

      // Tomorrow's data
      tomorrowTotalSlots,
      tomorrowBookedSlots,
      tomorrowBookings,

      // Day after tomorrow's data
      dayAfterTomorrowTotalSlots,
      dayAfterTomorrowBookedSlots,
      dayAfterTomorrowBookings
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

      // TODAY'S DATA
      // Today's total availability slots
      prisma.availability.count({
        where: {
          startTime: {
            gte: todayStart,
            lt: todayEnd
          }
        }
      }),
      // Today's booked slots
      prisma.availability.count({
        where: {
          startTime: {
            gte: todayStart,
            lt: todayEnd
          },
          isBooked: true
        }
      }),
      // Today's bookings
      prisma.booking.findMany({
        where: {
          startTime: {
            gte: todayStart,
            lt: todayEnd
          }
        },
        select: {
          startTime: true
        }
      }),

      // TOMORROW'S DATA
      // Tomorrow's total availability slots
      prisma.availability.count({
        where: {
          startTime: {
            gte: tomorrowStart,
            lt: tomorrowEnd
          }
        }
      }),
      // Tomorrow's booked slots
      prisma.availability.count({
        where: {
          startTime: {
            gte: tomorrowStart,
            lt: tomorrowEnd
          },
          isBooked: true
        }
      }),
      // Tomorrow's bookings
      prisma.booking.findMany({
        where: {
          startTime: {
            gte: tomorrowStart,
            lt: tomorrowEnd
          }
        },
        select: {
          startTime: true
        }
      }),

      // DAY AFTER TOMORROW'S DATA
      // Day after tomorrow's total availability slots
      prisma.availability.count({
        where: {
          startTime: {
            gte: dayAfterTomorrowStart,
            lt: dayAfterTomorrowEnd
          }
        }
      }),
      // Day after tomorrow's booked slots
      prisma.availability.count({
        where: {
          startTime: {
        gte: dayAfterTomorrowStart,
        lt: dayAfterTomorrowEnd
          },
          isBooked: true
        }
      }),
      // Day after tomorrow's bookings
      prisma.booking.findMany({
        where: {
          startTime: {
            gte: dayAfterTomorrowStart,
            lt: dayAfterTomorrowEnd
          }
        },
        select: {
          startTime: true
        }
      })
    ]);

    // Calculate metrics for each day
    const todayAvailableSlots = todayTotalSlots - todayBookedSlots;
    const todayBookingRate = formatBookingRate(todayBookedSlots, todayTotalSlots);

    const tomorrowAvailableSlots = tomorrowTotalSlots - tomorrowBookedSlots;
    const tomorrowBookingRate = formatBookingRate(tomorrowBookedSlots, tomorrowTotalSlots);

    const dayAfterTomorrowAvailableSlots = dayAfterTomorrowTotalSlots - dayAfterTomorrowBookedSlots;
    const dayAfterTomorrowBookingRate = formatBookingRate(dayAfterTomorrowBookedSlots, dayAfterTomorrowTotalSlots);

    // Total metrics across 3 days
    const totalSlots = todayTotalSlots + tomorrowTotalSlots + dayAfterTomorrowTotalSlots;
    const totalBookedSlots = todayBookedSlots + tomorrowBookedSlots + dayAfterTomorrowBookedSlots;
    const overallBookingRate = formatBookingRate(totalBookedSlots, totalSlots);

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
        title: "Total Slots (3 Days)",
        value: totalSlots,
        subtitle: "Combined slot count"
      },
      {
        title: "Overall Booking Rate",
        value: overallBookingRate,
        subtitle: "3-day utilization percentage"
      }
    ];

    const pieCharts: PieChartData[] = [
      {
        title: "Overall Slot Utilization (3 Days)",
        data: [
          { name: "Booked", value: totalBookedSlots },
          { name: "Available", value: totalSlots - totalBookedSlots }
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

    // Generate bar chart data for 3 days (matching BarChartDataPoint interface)
    const barChartData: BarChartDataPoint[] = [
      {
        name: "Today",
        interviews: todayBookings.length
      },
      {
        name: "Tomorrow", 
        interviews: tomorrowBookings.length
      },
      {
        name: "Day After Tomorrow",
        interviews: dayAfterTomorrowBookings.length
      }
    ];

    const dashboardData: DashboardResponse = {
      metrics,
      pieCharts,
      barChartData,
      // Additional daily breakdown
      dailyBreakdown: {
        today: {
          date: todayStart.toLocaleDateString(),
          totalSlots: todayTotalSlots,
          bookedSlots: todayBookedSlots,
          availableSlots: todayAvailableSlots,
          bookingRate: todayBookingRate
        },
        tomorrow: {
          date: tomorrowStart.toLocaleDateString(),
          totalSlots: tomorrowTotalSlots,
          bookedSlots: tomorrowBookedSlots,
          availableSlots: tomorrowAvailableSlots,
          bookingRate: tomorrowBookingRate
        },
        dayAfterTomorrow: {
          date: dayAfterTomorrowStart.toLocaleDateString(),
          totalSlots: dayAfterTomorrowTotalSlots,
          bookedSlots: dayAfterTomorrowBookedSlots,
          availableSlots: dayAfterTomorrowAvailableSlots,
          bookingRate: dayAfterTomorrowBookingRate
        }
      }
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data for next 3 days fetched successfully'
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
      interviewee:string
      phone: string;
      interviewer: string;
      interviewDate: Date;
      meetingLink: string | null;
    }[] = [];

    for (const student of students) {
      const bookings = await prisma.booking.findMany({
        where: {
          AND: [
            {
              OR: [
                { studentEmail: student.email },
                { studentPhone: student.phone },
              ]
            },
            {
              availability: {
                isBooked: true
              }
            }
          ]
        },
        select: {
          studentName:true,
          startTime: true,
          meetingLink: true,
          interviewer: {
            select: {
              name: true
            }
          }
        }
      });

      for (const booking of bookings) {
        result.push({
          applicationId: student.applicationId,
          interviewee:student.name,
          phone: student.phone,
          interviewer: booking.interviewer.name,
          interviewDate: booking.startTime,
          meetingLink: booking.meetingLink ?? null
        });
      }
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error('Error fetching interview bookings:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
