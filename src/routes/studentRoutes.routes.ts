import express from 'express';
import { 
  checkStudents, 
  createManyStudentsFromExcel,
  getAllStudents,
  updateStudent,
  deleteStudent
} from '../controller/student.controller.js';
import { uploadExcel } from '../middleware/uploadExcel.js';

const studentRoutes = express.Router();

studentRoutes.post("/uploadStudents", uploadExcel.single("file"), createManyStudentsFromExcel);
studentRoutes.post('/checkStudents', checkStudents);
studentRoutes.get('/getAllStudents', getAllStudents);
studentRoutes.put('/updateStudent/:id', updateStudent);
studentRoutes.delete('/deleteStudent/:id', deleteStudent);

export default studentRoutes;
