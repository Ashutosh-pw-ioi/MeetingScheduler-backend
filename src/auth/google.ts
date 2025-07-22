import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile, VerifyCallback } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/encryption.js';

dotenv.config();

const prisma = new PrismaClient();

class CustomGoogleStrategy extends GoogleStrategy {
  authorizationParams(options: any) {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }
}

passport.use(
  new CustomGoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: 'http://localhost:8000/auth/google/callback',
      scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: GoogleProfile,
      done: VerifyCallback
    ) => {
      try {
        const encryptedAccess = encrypt(accessToken);
        const encryptedRefresh = refreshToken ? encrypt(refreshToken) : undefined;

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            accessToken: encryptedAccess,
            refreshToken: encryptedRefresh,
            name: profile.displayName,
            email: profile.emails?.[0]?.value || '',
            avatarUrl: profile.photos?.[0]?.value,
            calendarConnected: true,
            lastLogin: new Date(),
          },
          create: {
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails?.[0]?.value || '',
            avatarUrl: profile.photos?.[0]?.value,
            accessToken: encryptedAccess,
            refreshToken: encryptedRefresh,
            calendarConnected: true,
            lastLogin: new Date(),
          },
        });

        return done(null, user);
      } catch (err) {
        console.error('Google auth error:', err);
        return done(err as Error, undefined);
      }
    }
  )
);

// Serialize user
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return done(new Error('User not found'), undefined);
    done(null, user);
  } catch (err) {
    return done(new Error('Authentication failed'), undefined);
  }
});

export default passport;
