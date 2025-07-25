import express from 'express';
import { checkStudents } from '../controller/student.controller.js';
const studentRoutes=express.Router()

studentRoutes.post('/checkStudents',checkStudents)

export default studentRoutes;