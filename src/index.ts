import express from 'express';
import session from 'express-session';
import passport from 'passport';
import './auth/google.js';
import authRoutes from './routes/auth.route.js';
import dotenv from 'dotenv';
import cors from 'cors';
import availabilityRoutes from './routes/availability.route.js';
import bookingRoutes from './routes/bookingRoutes.routes.js';
import adminRoutes from './routes/adminRoutes.routes.js';

dotenv.config();

const app = express();

app.use(cors({
    origin: process.env.ORIGIN ,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || "your_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", 
        maxAge: 24 * 60 * 60 * 1000,
    }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use('/api/availability', availabilityRoutes); 
app.use('/api/booking', bookingRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
