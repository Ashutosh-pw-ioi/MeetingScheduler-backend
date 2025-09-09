import { Request, Response } from 'express';
import { PrismaClient, Department } from '@prisma/client';
import { StudentService } from '../services/studentService.js';
import { parseStudentsExcel, RawStudentInput } from '../utils/parseStudentsExcel.utils.js';

const prisma = new PrismaClient();

interface StudentInput {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  department: Department; 
}

interface CreateStudentsRequest extends Request {
  body: {
    students: StudentInput[];
  };
}

interface ApiResponse<T = any> { 
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export const createManyStudentsFromExcel = async (
  req: Request,
  res: Response<ApiResponse<{ createdCount: number }>>
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload an Excel file with student data",
      });
    }

    const students: RawStudentInput[] = parseStudentsExcel(req.file.buffer);

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Uploaded Excel file contains no valid student rows",
      });
    }

    const validDepartments = Object.values(Department).map((d) => d.toString());

    const validatedStudents: StudentInput[] = [];
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      if (
        !student.applicationId ||
        !student.name ||
        !student.email ||
        !student.phone ||
        !student.department
      ) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 2}: Missing required fields (applicationId, name, email, phone, department)`,
        });
      }

      if (
        typeof student.applicationId !== "string" ||
        typeof student.name !== "string" ||
        typeof student.email !== "string" ||
        typeof student.phone !== "string" ||
        typeof student.department !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 2}: All fields must be strings`,
        });
      }

      const departmentNormalized = student.department.toUpperCase();
      if (!validDepartments.includes(departmentNormalized)) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 2}: Invalid department '${student.department}'. Allowed: ${validDepartments.join(", ")}`,
        });
      }

      validatedStudents.push({
        applicationId: student.applicationId,
        name: student.name,
        email: student.email,
        phone: student.phone,
        department: departmentNormalized as Department
      });
    }

    const result = await prisma.student.createMany({
      data: validatedStudents,
      skipDuplicates: true,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully created ${result.count} students`,
      data: { createdCount: result.count },
    });
  } catch (err: any) {
    console.error("Error creating students from Excel:", err);

    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Duplicate student email or phone number found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

export const checkStudents = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
      return;
    }

    const isAuthorized = await StudentService.isStudentAuthorized(phone);

    res.status(200).json({
      success: true,
      data: {
        authorized: isAuthorized,
        message: isAuthorized
          ? 'Student is authorized to book'
          : 'Student not found in database'
      },
      message: 'Authorization check completed'
    });

  } catch (error: unknown) {
    console.error('Error checking student authorization:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to check authorization',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};


interface UpdateStudentRequest extends Request {
  body: {
    applicationId?: string;
    name?: string;
    email?: string;
    phone?: string;
    department?: Department;
  };
  params: {
    id: string;
  };
}

export const getAllStudents = async (
  req: Request,
  res: Response<ApiResponse<any[]>>
): Promise<void> => {
  try {
    // Get all students with their booking status
    const students = await prisma.student.findMany({
      select: {
        id: true,
        applicationId: true,
        name: true,
        email: true,
        phone: true,
        department: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Check booking status for each student
    const studentsWithBookingStatus = await Promise.all(
      students.map(async (student) => {
        const booking = await prisma.booking.findFirst({
          where: {
            studentEmail: student.email
          }
        });

        return {
          ...student,
          status: booking ? 'booked' : 'not_booked'
        };
      })
    );

    res.status(200).json({
      success: true,
      message: `Found ${studentsWithBookingStatus.length} students`,
      data: studentsWithBookingStatus
    });

  } catch (error: unknown) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export const updateStudent = async (
  req: UpdateStudentRequest,
  res: Response<ApiResponse<any>>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { applicationId, name, email, phone, department } = req.body;

    // Check if student exists
    const existingStudent = await prisma.student.findUnique({
      where: { id }
    });

    if (!existingStudent) {
      res.status(404).json({
        success: false,
        message: 'Student not found'
      });
      return;
    }

    // Validate department if provided
    if (department) {
      const validDepartments = Object.values(Department);
      if (!validDepartments.includes(department)) {
        res.status(400).json({
          success: false,
          message: `Invalid department. Allowed: ${validDepartments.join(', ')}`
        });
        return;
      }
    }

    // Build update data object (only include provided fields)
    const updateData: any = {};
    if (applicationId !== undefined) updateData.applicationId = applicationId;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
      return;
    }

    // Update student
    const updatedStudent = await prisma.student.update({
      where: { id },
      data: updateData
    });

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: updatedStudent
    });

  } catch (error: any) {
    console.error('Error updating student:', error);

    // Handle unique constraint violations
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        message: `Student with this ${field} already exists`
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update student',
      error: error.message
    });
  }
};

export const deleteStudent = async (
  req: Request,
  res: Response<ApiResponse<{ deletedId: string }>>
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if student exists
    const existingStudent = await prisma.student.findUnique({
      where: { id }
    });

    if (!existingStudent) {
      res.status(404).json({
        success: false,
        message: 'Student not found'
      });
      return;
    }

    // Check if student has any bookings
    const hasBookings = await prisma.booking.findFirst({
      where: {
        studentEmail: existingStudent.email
      }
    });

    if (hasBookings) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete student with existing bookings. Please cancel bookings first.'
      });
      return;
    }

    // Delete student
    await prisma.student.delete({
      where: { id }
    });

    res.status(200).json({
      success: true,
      message: 'Student deleted successfully',
      data: { deletedId: id }
    });

  } catch (error: unknown) {
    console.error('Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete student',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};