import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/encryption.js';
import { Credentials } from 'google-auth-library';

const prisma = new PrismaClient();

export class GoogleCalendarService {
    private oauth2Client;
    private interviewerId: string;

    constructor(interviewerId: string) {
        this.interviewerId = interviewerId;
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID!,
            process.env.GOOGLE_CLIENT_SECRET!
        );
    }

    private async authorize() {
        const interviewer = await prisma.user.findUnique({
            where: { id: this.interviewerId },
            select: { refreshToken: true }
        });

        if (!interviewer || !interviewer.refreshToken) {
            throw new Error(`Cannot create event: Interviewer ${this.interviewerId} has not connected their calendar or granted offline access.`);
        }

        const refreshToken = decrypt(interviewer.refreshToken);
        this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    }

    async createEvent(eventDetails: {
        startTime: Date;
        endTime: Date;
        studentName: string;
        studentEmail: string;
        studentPhone?: string;
        interviewerEmail: string;
        interviewerName: string;
    }) {
        await this.authorize();

        const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

        const eventDescription = `
            30-minute interview session.
            Interviewer: ${eventDetails.interviewerName} (${eventDetails.interviewerEmail})
            Student: ${eventDetails.studentName} (${eventDetails.studentEmail})
            Student Phone: ${eventDetails.studentPhone || 'Not provided'}
        `;

        const event = {
            summary: `Interview: ${eventDetails.interviewerName} and ${eventDetails.studentName}`,
            description: eventDescription,
            start: {
                dateTime: eventDetails.startTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            end: {
                dateTime: eventDetails.endTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            attendees: [
                { email: eventDetails.interviewerEmail },
                { email: eventDetails.studentEmail }
            ],
            reminders: {
                useDefault: false,
                overrides: [{ method: 'email', minutes: 10 }],
            },
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: "hangoutsMeet"
                    }
                }
            },
        };

        const createdEvent = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            sendUpdates: 'all',
            requestBody: event,
        });

        return createdEvent.data;
    }
}
