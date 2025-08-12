import express from 'express';
import { checkStudents, createManyStudentsFromExcel } from '../controller/student.controller.js';
import { uploadExcel } from '../middleware/uploadExcel.js';
const studentRoutes = express.Router()

studentRoutes.post("/uploadStudents", uploadExcel.single("file"), createManyStudentsFromExcel);
studentRoutes.post('/checkStudents', checkStudents)

export default studentRoutes;