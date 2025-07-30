import { Request, Response } from 'express';

const checkUser = (req: Request, res: Response) => {
  if (req.user) {
    const user = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      calendarConnected: req.user.calendarConnected || false,
      department: req.user.department, 
    };
    res.status(200).json(user);
  } else {
    res.status(401).json({ error: 'User not authenticated' });
  }
};

const checkCalendarAccess = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const hasCalendarAccess = !!(req.user.refreshToken && req.user.calendarConnected);
  
  // Test the connection if user claims to have calendar access
  if (hasCalendarAccess) {
    try {
      const { GoogleCalendarService } = await import('../services/GoogleCalendarService.js');
      const calendarService = new GoogleCalendarService(req.user.id);
      const connectionWorks = await calendarService.testConnection();
      
      if (!connectionWorks) {
        return res.json({
          hasCalendarAccess: false,
          needsCalendarPermission: true,
          calendarAuthUrl: '/auth/google/calendar',
          error: 'Calendar connection test failed. Please reconnect.'
        });
      }
    } catch (error) {
      console.error('Calendar test failed:', error);
      return res.json({
        hasCalendarAccess: false,
        needsCalendarPermission: true,
        calendarAuthUrl: '/auth/google/calendar',
        error: 'Calendar connection test failed. Please reconnect.'
      });
    }
  }
  
  res.json({
    hasCalendarAccess,
    needsCalendarPermission: !hasCalendarAccess,
    calendarAuthUrl: hasCalendarAccess ? null : '/auth/google/calendar'
  });
};

const logoutUser = (req: Request, res: Response) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destroy failed' });
      }
      res.clearCookie('connect.sid'); 
      res.redirect(`${process.env.ORIGIN}`);
    });
  });
};

// Updated redirect function - this is the key change
const redirectUser = (req: Request, res: Response) => {
  const user = req.user as any;
  const hasCalendarAccess = !!(user?.refreshToken && user?.calendarConnected);
  
  if (hasCalendarAccess) {
    // Redirect to interviewer overview page instead of dashboard
    res.redirect(`${process.env.ORIGIN}/interviewer-D9C75C81F03C9AA4?setup=complete`);
  } else {
    // Redirect to interviewer overview page - calendar prompt will show there
    res.redirect(`${process.env.ORIGIN}/interviewer-D9C75C81F03C9AA4?calendar=setup`);
  }
};

export { checkUser, logoutUser, redirectUser, checkCalendarAccess };
