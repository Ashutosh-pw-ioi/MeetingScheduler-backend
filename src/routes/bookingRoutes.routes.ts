import express from 'express';
import { getPublicAvailability, createBooking } from '../controller/booking.controller.js'

const bookingRoutes = express.Router();

bookingRoutes.get('/availability/:phone', getPublicAvailability);
bookingRoutes.post('/book', createBooking);

export default bookingRoutes;
