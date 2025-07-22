import { Request, Response, NextFunction } from "express";

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not Authenticated" });
};

const requireCalendarAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = req.user as any;
  if (!user.accessToken || !user.calendarConnected) {
    return res.status(403).json({ 
      error: "Calendar access required",
      redirectUrl: "/auth/google/calendar"
    });
  }

  next();
};
export { isAuthenticated, requireCalendarAccess };