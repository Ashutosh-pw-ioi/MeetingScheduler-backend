import { Router } from 'express';
import passport from 'passport';
import { isAuthenticated } from '../middleware/auth.middleware.js';
import { checkUser, logoutUser, redirectUser, checkCalendarAccess } from '../controller/auth.controller.js';

const router = Router();

router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));


router.get('/google/calendar', passport.authenticate('google', {
  scope: [
    'profile', 
    'email',
    'https://www.googleapis.com/auth/calendar.readonly', 
    'https://www.googleapis.com/auth/calendar.events'    
  ],
  accessType: 'offline', 
  prompt: 'consent'      
}));

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=auth_failed',
    session: true,
  }),
  redirectUser
);

router.get('/logout', isAuthenticated, logoutUser);
router.get('/profile', isAuthenticated, checkUser);
router.get('/calendar-status', isAuthenticated, checkCalendarAccess);

export default router;