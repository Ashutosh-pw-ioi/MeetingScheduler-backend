
import { Request, Response } from 'express';
import { StudentService } from '../services/studentService.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


interface StudentInput {
  name: string;
  email: string;
  phone: string;
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

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      if (!student.name || !student.email || !student.phone) {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} is missing required fields (name, email, phone)`
        });
      }

      if (typeof student.name !== 'string' || 
          typeof student.email !== 'string' || 
          typeof student.phone !== 'string') {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} has invalid field types. All fields must be strings`
        });
      }
    }

    const result = await prisma.student.createMany({
      data: students,
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
  res:Response
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