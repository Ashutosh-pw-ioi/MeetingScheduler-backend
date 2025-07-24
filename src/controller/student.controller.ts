
import { Request, Response } from 'express';
import { StudentService } from '../services/studentService.js';


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