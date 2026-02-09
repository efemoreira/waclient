import { google } from 'googleapis';
import { logger } from './logger';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Base';
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';

function normalizarPrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  if (key.startsWith('base64:')) {
    const b64 = key.replace(/^base64:/, '');
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return key.replace(/\\n/g, '\n');
}

function getAuth() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    return null;
  }

  const key = normalizarPrivateKey(PRIVATE_KEY);
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
}): Promise<{ ok: boolean; consumo?: string; row?: number; erro?: string }> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inbox', 'Planilha: credenciais não configuradas');
    return { ok: false, erro: 'Credenciais não configuradas' };
  }

  const data = params.data || new Date().toLocaleDateString('pt-BR');
  const values = [[data, params.predio, '', params.numero]];

  const sheets = google.sheets({ version: 'v4', auth });
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:A`,
    majorDimension: 'COLUMNS',
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const colAValues = colA.data?.values?.[0] || [];
  let lastRow = colAValues.length;
  while (lastRow > 0 && !colAValues[lastRow - 1]) {
    lastRow -= 1;
  }
  const targetRow = lastRow + 1;

  if (lastRow > 0) {
    const formulasRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!C${lastRow}:F${lastRow}`,
      valueRenderOption: 'FORMULA',
    });
    const formulasRow = formulasRes.data?.values?.[0] || [];
    const formulaC = formulasRow[0];
    const formulaE = formulasRow[2];
    const formulaF = formulasRow[3];

    const formulaUpdates: Array<{ range: string; values: string[][] }> = [];
    if (formulaC) formulaUpdates.push({ range: `${SHEET_NAME}!C${targetRow}`, values: [[String(formulaC)]] });
    if (formulaE) formulaUpdates.push({ range: `${SHEET_NAME}!E${targetRow}`, values: [[String(formulaE)]] });
    if (formulaF) formulaUpdates.push({ range: `${SHEET_NAME}!F${targetRow}`, values: [[String(formulaF)]] });

    if (formulaUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: formulaUpdates,
        },
      });
    }
  }

  logger.info('Inbox', `Planilha: update A${targetRow},B${targetRow},D${targetRow} ${JSON.stringify(values[0])}`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_NAME}!A${targetRow}`, values: [[values[0][0]]] },
        { range: `${SHEET_NAME}!B${targetRow}`, values: [[values[0][1]]] },
        { range: `${SHEET_NAME}!D${targetRow}`, values: [[values[0][3]]] },
      ],
    },
  });

  if (!lastRow) {
    return { ok: true };
  }

  try {
    const consumoRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!E${targetRow}`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const consumo = consumoRes.data?.values?.[0]?.[0] ?? '';
    return { ok: true, consumo: String(consumo), row: targetRow };
  } catch (erro: any) {
    logger.warn('Inbox', `Planilha: erro ao ler consumo (E${targetRow}) ${erro?.message || erro}`);
    return { ok: true, row: targetRow };
  }
}
