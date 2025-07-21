import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from '../utils/encryption.js';

const prisma = new PrismaClient();

export class GoogleCalendarService {
    private oauth2Client;
    private userId: string;

    constructor(userId: string) {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID!,
            process.env.GOOGLE_CLIENT_SECRET!,
            "/auth/google/callback"
        );
        this.userId = userId;
    }

    async authorize() {
        const user = await prisma.user.findUnique({ where: { id: this.userId } });
        if (!user || !user.accessToken || !user.refreshToken) {
            throw new Error("User authentication required");
        }

        const accessToken = decrypt(user.accessToken);
        const refreshToken = decrypt(user.refreshToken);

        this.oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        try {
            await this.oauth2Client.getTokenInfo(accessToken);
        } catch (error) {
            await this.oauth2Client.getAccessToken();
        }
    }

    async getCalendars() {
        await this.authorize();
        const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
        const res = await calendar.calendarList.list();
        return res.data.items;
    }

    async createEvent(calendarId: string, eventDetails: any) {
        await this.authorize();
        const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
        const res = await calendar.events.insert({
            calendarId,
            requestBody: eventDetails,
        });
        return res.data;
    }

}
