import express from 'express';
import { getAllInterviewees, getAllInterviewers, getTodaysDashboard } from '../controller/admin.controller.js';
const adminRoutes = express.Router();


adminRoutes.get('/allInterviewers',getAllInterviewers);
adminRoutes.get('/allInterviewees',getAllInterviewees);
adminRoutes.get('/dashboard', getTodaysDashboard);

export default adminRoutes;
