import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from '../utils/encryption.js';

const prisma = new PrismaClient();

export class GoogleCalendarService {
    private oauth2Client;
    private interviewerId: string;

    constructor(interviewerId: string) {
        this.interviewerId = interviewerId;
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID!,
            process.env.GOOGLE_CLIENT_SECRET!,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8000/auth/google/callback'
        );
    }

    private async authorize() {
        const interviewer = await prisma.user.findUnique({
            where: { id: this.interviewerId },
            select: {
                refreshToken: true,
                accessToken: true,
                calendarConnected: true
            }
        });

        if (!interviewer || !interviewer.refreshToken || !interviewer.calendarConnected) {
            throw new Error(`Cannot create event: Interviewer ${this.interviewerId} has not connected their calendar or granted offline access.`);
        }

        const refreshToken = decrypt(interviewer.refreshToken);
        const accessToken = interviewer.accessToken ? decrypt(interviewer.accessToken) : null;

        this.oauth2Client.setCredentials({
            refresh_token: refreshToken,
            access_token: accessToken
        });

        this.oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                const encryptedAccessToken = encrypt(tokens.access_token);
                await prisma.user.update({
                    where: { id: this.interviewerId },
                    data: { accessToken: encryptedAccessToken }
                });
            }
        });
    }

    async createEvent(eventDetails: {
        startTime: Date;
        endTime: Date;
        studentName: string;
        studentEmail: string;
        department: string;         // <-- department included here
        studentPhone?: string;
        interviewerEmail: string;
        interviewerName: string;
    }) {
        try {
            await this.authorize();

            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

            const eventDescription = `
30-minute interview session.
Interviewer: ${eventDetails.interviewerName} (${eventDetails.interviewerEmail})
Student: ${eventDetails.studentName} (${eventDetails.studentEmail})
Student Phone: ${eventDetails.studentPhone || 'Not provided'}

Join five minutes before the scheduled time and wait for 10 minutes, otherwise, absence will be marked.
            `.trim();

            const attendees = [
                {
                    email: eventDetails.interviewerEmail,
                    responseStatus: 'accepted'
                },
                {
                    email: eventDetails.studentEmail,
                    responseStatus: 'needsAction'
                },
                // {
                //     email: 'admissions@pwioi.com', // Presumably your internal support account
                //     responseStatus: 'accepted'
                // }
            ];

            // Use department in the summary to clearly identify interview type
            const event = {
                summary: `CEE_Interview_${eventDetails.studentName}_${eventDetails.studentPhone || 'NoPhone'}_${eventDetails.department}`,
                description: eventDescription,
                start: {
                    dateTime: eventDetails.startTime.toISOString(),
                    timeZone: 'Asia/Kolkata',
                },
                end: {
                    dateTime: eventDetails.endTime.toISOString(),
                    timeZone: 'Asia/Kolkata',
                },
                attendees: attendees,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours
                        { method: 'email', minutes: 60 },      // 1 hour
                        { method: 'popup', minutes: 10 }       // 10 minutes
                    ],
                },
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        conferenceSolutionKey: {
                            type: "hangoutsMeet"
                        }
                    }
                },
                guestsCanModify: false,
                guestsCanInviteOthers: false,
                guestsCanSeeOtherGuests: true
            };

            const createdEvent = await calendar.events.insert({
                calendarId: 'primary',
                conferenceDataVersion: 1,
                sendUpdates: 'all',
                requestBody: event,
            });

            return createdEvent.data;

        } catch (error: any) {
            console.error('Calendar Service Error:', error);

            if (error.code === 401 || (error.message && error.message.includes('invalid_grant'))) {
                throw new Error(`Calendar authorization expired. Interviewer ${this.interviewerId} needs to reconnect their calendar.`);
            }

            if (error.code === 403) {
                throw new Error(`Calendar access denied. Interviewer ${this.interviewerId} has not granted sufficient calendar permissions.`);
            }

            throw new Error(`Failed to create calendar event: ${error.message}`);
        }
    }

    async testConnection() {
        try {
            await this.authorize();
            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

            await calendar.calendarList.list({
                maxResults: 1
            });

            return true;
        } catch (error) {
            return false;
        }
    }
}
