import express from 'express';
import { isAuthenticated } from '../middleware/auth.middleware.js';
import { createFutureAvailability, createTodayAvailability } from '../controller/availability.controller.js';

const availabilityRoutes = express.Router();

availabilityRoutes.post('/today',isAuthenticated,createTodayAvailability); 
availabilityRoutes.post('/future', isAuthenticated, createFutureAvailability);

export default availabilityRoutes;