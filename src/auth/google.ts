import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile, VerifyCallback } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { PrismaClient, User, Department } from '@prisma/client';
import { encrypt } from '../utils/encryption.js';

dotenv.config();
const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8000/auth/google/callback',
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: GoogleProfile,
      done: VerifyCallback
    ) => {
      try {
        const hasCalendarAccess = !!refreshToken;

        if (!refreshToken) {
          console.warn(`No refresh token received for ${profile.emails?.[0]?.value}. User may have denied calendar permissions or already authorized this app.`);
        }

        const encryptedAccess = encrypt(accessToken);
        const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

        // Prepare user data without department, set department only on create
        const userData = {
          name: profile.displayName,
          email: profile.emails?.[0]?.value || '',
          avatarUrl: profile.photos?.[0]?.value || null,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          calendarConnected: hasCalendarAccess,
          lastLogin: new Date(),
        };

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        let user: User;

        if (existingUser) {
          // Update user data but DO NOT update 'department'
          user = await prisma.user.update({
            where: { googleId: profile.id },
            data: {
              ...userData,
            },
          });
        } else {
          // Create new user with default department GENERAL
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              department: Department.GENERAL,
              ...userData,
            },
          });
        }

        console.log(`User ${user.email} authenticated. Calendar connected: ${user.calendarConnected}`);
        return done(null, user);

      } catch (err) {
        console.error('Google Strategy Error:', err);
        return done(err as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return done(new Error('User not found'), null);
    return done(null, user);
  } catch (err) {
    return done(err as Error, null);
  }
});

export default passport;
