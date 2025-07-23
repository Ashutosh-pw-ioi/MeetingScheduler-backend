import express from 'express';
import { isAuthenticated } from '../middleware/auth.middleware.js';
import { 
    setAvailabilityForMultipleDays,
    updateOrSetAvailabilityForDay, 
    deleteAvailabilityByRange, 
    getAllAvailability,
    getAllMeetings
} from '../controller/availability.controller.js';

const availabilityRoutes = express.Router();


availabilityRoutes.post('/batch-set', isAuthenticated, setAvailabilityForMultipleDays);
availabilityRoutes.post('/day', isAuthenticated, updateOrSetAvailabilityForDay);
availabilityRoutes.delete('/range', isAuthenticated, deleteAvailabilityByRange);
availabilityRoutes.get('/all', isAuthenticated, getAllAvailability); 
availabilityRoutes.get('/allMeetings', isAuthenticated, getAllMeetings);


export default availabilityRoutes;