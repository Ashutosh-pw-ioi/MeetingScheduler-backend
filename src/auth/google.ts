import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile, VerifyCallback } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { PrismaClient, User } from '@prisma/client';
import { encrypt } from '../utils/encryption.js';

dotenv.config();
const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: 'http://localhost:8000/auth/google/callback',
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: GoogleProfile,
      done: VerifyCallback
    ) => {
      try {
        if (!refreshToken) {
          console.warn(`No refresh token received for ${profile.emails?.[0]?.value}`);
        }

        const encryptedAccess = encrypt(accessToken);
        const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

        const userData: Omit<User, 'id' | 'googleId' | 'createdAt' | 'updatedAt'> = {
          name: profile.displayName,
          email: profile.emails?.[0]?.value || '',
          avatarUrl: profile.photos?.[0]?.value || null,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          calendarConnected: !!encryptedRefresh,
          lastLogin: new Date(),
        };

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: userData,
          create: {
            googleId: profile.id,
            ...userData,
          },
        });

        return done(null, user);
      } catch (err) {
        console.error('Google Strategy Error:', err);
        return done(err as Error, undefined);
      }
    }
  )
);

export const googleAuth = passport.authenticate('google', {
  scope: [
    'profile',
    'email',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  accessType: 'offline',
  prompt: 'consent',
});

export const googleAuthCallback = passport.authenticate('google', {
  failureRedirect: '/login?error=google_auth_failed',
  session: true,
});


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
