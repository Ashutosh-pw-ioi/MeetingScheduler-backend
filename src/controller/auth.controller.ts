import { Request, Response } from 'express';

const checkUser = (req: Request, res: Response) => {
  if (req.user) {
    const user = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      calendarConnected: req.user.calendarConnected || false
    };
    res.status(200).json(user);
  } else {
    res.status(401).json({ error: 'User not authenticated' });
  }
};

const checkCalendarAccess = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const hasCalendarAccess = !!(req.user.accessToken && req.user.calendarConnected);
  
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

const redirectUser = (req: Request, res: Response) => {
  // Check if user has calendar access
  const user = req.user as any;
  const hasCalendarAccess = !!(user?.accessToken && user?.calendarConnected);
  
  if (hasCalendarAccess) {
    res.redirect(`${process.env.ORIGIN}/dashboard?setup=complete`);
  } else {
    res.redirect(`${process.env.ORIGIN}/setup/calendar`);
  }
};

export { checkUser, logoutUser, redirectUser, checkCalendarAccess };