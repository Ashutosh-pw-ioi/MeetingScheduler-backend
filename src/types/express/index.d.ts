declare namespace Express {
  export interface User {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    calendarConnected?: boolean;
    accessToken?: string | null;     
    refreshToken?: string | null;    
    googleId?: string;
    lastLogin?: Date;
    department: string;
  }

  
}
