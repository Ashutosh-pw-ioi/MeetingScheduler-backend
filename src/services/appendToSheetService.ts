import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { DateTime } from 'luxon';

export interface BookingRow {
  applicationId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  department: string;
  startTime: string; 
  endTime: string;  
  timezone: string;
  interviewerName: string;
  interviewerEmail: string;
  meetingLink: string;
}

function getAuth(): GoogleAuth {
  const credsBase64 = process.env.GOOGLE_SHEETS_CREDS_B64;
  
  if (!credsBase64) {
    throw new Error('GOOGLE_SHEETS_CREDS_B64 environment variable is not set');
  }

  try {
    const credentials = JSON.parse(Buffer.from(credsBase64, 'base64').toString('utf-8'));
    
    // Log the service account email for debugging (remove in production)
    console.log('Using service account:', credentials.client_email);
    
    // Ensure the private key has proper formatting
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (error) {
    console.error('Error parsing Google Sheets credentials:', error);
    throw new Error('Invalid Google Sheets credentials format');
  }
}

export async function appendBookingToSheet(rowData: BookingRow): Promise<sheets_v4.Schema$AppendValuesResponse> {
  try {
    console.log('Attempting to append booking to Google Sheets...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    console.log('Spreadsheet ID:', spreadsheetId);

    // Convert UTC timestamps to IST format
    const startTimeIST = DateTime.fromISO(rowData.startTime).setZone('Asia/Kolkata').toFormat('dd MMM yyyy, HH:mm');
    const endTimeIST = DateTime.fromISO(rowData.endTime).setZone('Asia/Kolkata').toFormat('dd MMM yyyy, HH:mm');

    // Prepare the row data
    const values = [[
      rowData.applicationId,
      rowData.studentName,
      rowData.studentEmail,
      rowData.studentPhone || '', // Handle null values
      rowData.department,
      startTimeIST, // IST formatted time
      endTimeIST,   // IST formatted time
      rowData.timezone,
      rowData.interviewerName,
      rowData.interviewerEmail,
      rowData.meetingLink,
    ]];

    console.log('Data to append:', values);

    // Test connection first by trying to read sheet metadata
    try {
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title'
      });
      console.log('Sheet access confirmed. Title:', sheetInfo.data.properties?.title);
    } catch (testError) {
      console.error('Cannot access sheet for reading:', testError);
      throw new Error(`Sheet access denied. Please check sharing permissions for service account.`);
    }

    // Append the data
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:K', 
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    console.log(' Successfully appended booking to sheet:', response.data.updates);
    return response.data;

  } catch (error: any) {
    console.error(' Failed to append booking to Google Sheets:', error);
    
    // More detailed error logging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code === 403 || error.status === 403) {
      throw new Error('Permission denied: Service account does not have access to the Google Sheet. Please check sharing permissions.');
    }
    
    throw error;
  }
}

// Test function to verify sheet access
export async function testSheetAccess(): Promise<boolean> {
  try {
    console.log('Testing Google Sheets access...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      console.error('GOOGLE_SHEET_ID not set');
      return false;
    }

    // Test 1: Read sheet properties
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties'
    });
    
    console.log('Sheet access successful!');
    console.log('Sheet title:', sheetInfo.data.properties?.title);
    console.log('Available sheets:', sheetInfo.data.sheets?.map(s => s.properties?.title).join(', '));

    // Test 2: Read some values
    try {
      const valuesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!A1:J1'
      });
      console.log('Read access confirmed');
      console.log('Header row:', valuesResponse.data.values);
    } catch (readError) {
      console.log('Read access limited, but sheet is accessible');
    }

    return true;
  } catch (error: any) {
    console.error('Sheet access test failed:', error);
    
    if (error.code === 403 || error.status === 403) {
      console.error('Permission denied. Please ensure the service account has Editor access to the sheet.');
    }
    
    return false;
  }
}