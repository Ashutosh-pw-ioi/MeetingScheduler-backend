import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/encryption.js';

dotenv.config();
const prisma = new PrismaClient();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const encryptedAccess = encrypt(accessToken);
        const encryptedRefresh = refreshToken ? encrypt(refreshToken) : undefined;

        const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: {
                accessToken: encryptedAccess,
                refreshToken: encryptedRefresh,
                name: profile.displayName,
                email: profile.emails?.[0]?.value || "",
                avatarUrl: profile.photos?.[0]?.value,
                lastLogin: new Date()
            },
            create: {
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails?.[0]?.value || "",
                avatarUrl: profile.photos?.[0]?.value,
                accessToken: encryptedAccess,
                refreshToken: encryptedRefresh,
                calendarConnected: true,
                lastLogin: new Date()
            }
        });

        return done(null, user);
    } catch (err) {
        console.error('Google auth error:', err);
        return done(err, undefined);
    }
}));

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { id } });
        done(null, user);
    } catch (err) {
        console.error('Google auth error:', err);
        return done(new Error('Authentication failed'), undefined); 
    }
});

export default passport;
