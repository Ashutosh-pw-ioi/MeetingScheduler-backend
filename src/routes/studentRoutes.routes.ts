import express from 'express';
import { checkStudents, createManyStudents } from '../controller/student.controller.js';
const studentRoutes=express.Router()

studentRoutes.post('/createStudents',createManyStudents)
studentRoutes.post('/checkStudents',checkStudents)

export default studentRoutes;