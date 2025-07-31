import { Request, Response } from 'express';
import { PrismaClient, Department } from '@prisma/client';
import { StudentService } from '../services/studentService.js';

const prisma = new PrismaClient();

interface StudentInput {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
}

interface CreateStudentsRequest extends Request {
  body: {
    students: StudentInput[];
  };
}

interface ApiResponse {
  success: boolean;
  message: string;
  data?: {
    createdCount: number;
  };
  error?: string;
}

export const createManyStudents = async (
  req: CreateStudentsRequest,
  res: Response<ApiResponse>
): Promise<Response<ApiResponse>> => {
  try {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of students in the request body"
      });
    }

    const validDepartments = Object.values(Department).map(d => d.toString()); 
    // ['SOT', 'SOM', 'GENERAL']

    // Validate all students
    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      // Validate required fields presence
      if (
        !student.applicationId ||
        !student.name ||
        !student.email ||
        !student.phone ||
        !student.department
      ) {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} is missing required fields (applicationId, name, email, phone, department)`
        });
      }

      // Validate field types
      if (
        typeof student.applicationId !== 'string' ||
        typeof student.name !== 'string' ||
        typeof student.email !== 'string' ||
        typeof student.phone !== 'string' ||
        typeof student.department !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} has invalid field types. All fields must be strings`
        });
      }

      // Normalize department to uppercase and validate
      const departmentNormalized = student.department.toUpperCase();
      if (!validDepartments.includes(departmentNormalized)) {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} has invalid department '${student.department}'. Allowed values: ${validDepartments.join(', ')}.`
        });
      }

      // Replace with normalized value
      student.department = departmentNormalized;
    }

    // All validated: now createMany with normalized department values
    const result = await prisma.student.createMany({
      data: students as any, // Type casting here since students now conform to Prisma types
      skipDuplicates: true
    });

    return res.status(201).json({
      success: true,
      message: `Successfully created ${result.count} students`,
      data: {
        createdCount: result.count
      }
    });

  } catch (error: any) {
    console.error('Error creating students:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: "One or more students have duplicate email or phone numbers",
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while creating students",
      error: error.message
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
