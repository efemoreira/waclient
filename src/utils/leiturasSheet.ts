import { google } from 'googleapis';
import { logger } from './logger';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
const SHEET_NAME = process.env.GOOGLE_LEITURAS_SHEET_NAME || 'Base';
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

export async function registrarLeitura(params: {
  idImovel: string;
  tipo: 'agua' | 'energia' | 'gas';
  leitura: string;
  data?: string;
}): Promise<{
  ok: boolean;
  consumo?: string;
  anterior?: string;
  dataAnterior?: string;
  dias?: number;
  erro?: string;
}> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Leituras', 'Credenciais não configuradas');
    return { ok: false, erro: 'Credenciais não configuradas' };
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const data = params.data || new Date().toLocaleDateString('pt-BR');

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

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEET_NAME}!A${targetRow}`, values: [[data]] },
          { range: `${SHEET_NAME}!B${targetRow}`, values: [[params.idImovel]] },
          { range: `${SHEET_NAME}!C${targetRow}`, values: [[params.leitura]] },
        ],
      },
    });

    // Encontrar leitura anterior do mesmo imóvel
    let anterior = '';
    let dataAnterior = '';
    let dias = 0;
    try {
      const colB = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!B:B`,
        majorDimension: 'COLUMNS',
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const colBValues = colB.data?.values?.[0] || [];
      for (let i = colBValues.length - 1; i >= 0; i--) {
        if (colBValues[i] === params.idImovel && i + 1 !== targetRow) {
          const rowAnterior = i + 1;
          const rangeRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A${rowAnterior}:C${rowAnterior}`,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          const row = rangeRes.data?.values?.[0] || [];
          dataAnterior = row[0] || '';
          anterior = row[2] || '';

          if (dataAnterior && data) {
            try {
              const [dAnterior, mAnterior, aAnterior] = dataAnterior.split('/').map(Number);
              const [dAtual, mAtual, aAtual] = data.split('/').map(Number);
              const dateAnterior = new Date(aAnterior, mAnterior - 1, dAnterior);
              const dateAtual = new Date(aAtual, mAtual - 1, dAtual);
              dias = Math.floor((dateAtual.getTime() - dateAnterior.getTime()) / (1000 * 60 * 60 * 24));
            } catch (e) {
              logger.warn('Leituras', `Erro ao calcular dias: ${e}`);
            }
          }
          break;
        }
      }
    } catch (erro: any) {
      logger.warn('Leituras', `Erro ao ler anterior: ${erro?.message || erro}`);
    }

    if (!lastRow) {
      return { ok: true, anterior, dataAnterior, dias };
    }

    try {
      const consumoRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!E${targetRow}`,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const consumo = consumoRes.data?.values?.[0]?.[0] ?? '';
      return { ok: true, consumo: String(consumo), anterior, dataAnterior, dias };
    } catch (erro: any) {
      logger.warn('Leituras', `Erro ao ler consumo (E${targetRow}): ${erro?.message || erro}`);
      return { ok: true, anterior, dataAnterior, dias };
    }
  } catch (erro: any) {
    logger.warn('Leituras', `Erro ao registrar leitura: ${erro?.message || erro}`);
    return { ok: false, erro: erro?.message };
  }
}

export async function obterUltimaLeitura(params: {
  idImovel: string;
  tipo: 'agua' | 'energia' | 'gas';
}): Promise<{ leitura?: string; data?: string }> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Leituras', 'Credenciais não configuradas');
    return {};
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:C`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = result.data?.values || [];
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const idImovel = String(row[1] || '').trim();
      if (idImovel === params.idImovel) {
        return { data: String(row[0] || ''), leitura: String(row[2] || '') };
      }
    }

    return {};
  } catch (erro: any) {
    logger.warn('Leituras', `Erro ao obter última leitura: ${erro?.message || erro}`);
    return {};
  }
}
