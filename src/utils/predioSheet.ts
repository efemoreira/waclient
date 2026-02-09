import { google } from 'googleapis';
import { logger } from './logger';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Base';
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';

function getAuth() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    return null;
  }

  const key = PRIVATE_KEY.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email: CLIENT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function appendPredioEntry(params: {
  predio: string;
  numero: string;
  data?: string;
}): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inbox', 'Planilha: credenciais não configuradas');
    return;
  }

  const data = params.data || new Date().toISOString();
  const values = [[data, params.predio, '', params.numero]];

  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${SHEET_NAME}!A:D`;

  logger.info('Inbox', `Planilha: append ${JSON.stringify(values[0])}`);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}
