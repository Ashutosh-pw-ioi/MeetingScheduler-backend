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