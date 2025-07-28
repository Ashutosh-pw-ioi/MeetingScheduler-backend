import express from 'express';
import { getAllInterviewees, getAllInterviewers, getBookedInterviews, getTodaysDashboard } from '../controller/admin.controller.js';
const adminRoutes = express.Router();


adminRoutes.get('/allInterviewers',getAllInterviewers);
adminRoutes.get('/allInterviewees',getAllInterviewees);
adminRoutes.get('/dashboard', getTodaysDashboard);
adminRoutes.get('/getapplicationid',getBookedInterviews  )
export default adminRoutes;
