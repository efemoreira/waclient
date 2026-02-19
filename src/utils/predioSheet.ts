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

export async function obterUltimaLeitura(idImovel: string): Promise<{ leitura?: string; data?: string; consumo?: string }> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inbox', 'Planilha: credenciais não configuradas');
    return {};
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const colB = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!B:B`,
      majorDimension: 'COLUMNS',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const colBValues = colB.data?.values?.[0] || [];
    
    // Procura a última leitura do idImovel (B) de trás para frente
    // Colunas: A=Data, B=Id, C=Tipo, D=Leitura Atual, E=Leitura Anterior, F=Consumo
    for (let i = colBValues.length - 1; i > 0; i--) {
      if (colBValues[i] === idImovel) {
        const rowNum = i + 1;
        const rangeRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A${rowNum}:F${rowNum}`,
          valueRenderOption: 'FORMATTED_VALUE',
        });
        const row = rangeRes.data?.values?.[0] || [];
        return {
          data: row[0] || '',
          leitura: row[3] || '',
          consumo: row[5] || '',
        };
      }
    }
    return {};
  } catch (erro: any) {
    logger.warn('Inbox', `Planilha: erro ao obter última leitura ${erro?.message || erro}`);
    return {};
  }
}

export async function appendPredioEntry(params: {
  predio: string;
  numero: string;
  tipo?: string;
  data?: string;
}): Promise<{ 
  ok: boolean; 
  consumo?: string; 
  anterior?: string; 
  data?: string;
  dias?: number; 
  media?: string;
  consumoSemana?: string;
  mediaSemana?: string;
  consumoMes?: string;
  mediaMes?: string;
  row?: number; 
  erro?: string 
}> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inbox', 'Planilha: credenciais não configuradas');
    return { ok: false, erro: 'Credenciais não configuradas' };
  }

  const data = params.data || new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const valores = [data, params.predio, params.tipo || '', params.numero];

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

  // Colunas: A=Data, B=Id, C=Tipo, D=Leitura Atual
  logger.info('Inbox', `Planilha: update A${targetRow},B${targetRow},C${targetRow},D${targetRow} ${JSON.stringify(valores)}`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_NAME}!A${targetRow}`, values: [[valores[0]]] },
        { range: `${SHEET_NAME}!B${targetRow}`, values: [[valores[1]]] },
        { range: `${SHEET_NAME}!C${targetRow}`, values: [[valores[2]]] },
        { range: `${SHEET_NAME}!D${targetRow}`, values: [[valores[3]]] },
      ],
    },
  });

  // Aguardar um pouco para que as fórmulas da planilha sejam calculadas
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Ler todos os dados calculados da linha inserida
  // Colunas: A=Data, B=Id, C=Tipo, D=Leitura_Atual, E=Leitura_Anterior, F=Consumo, G=Dias, H=Média_Dia, I=Consumo_Semana, J=Media_Semana, K=Consumo_Mes, L=Media_Mes
  try {
    const rowDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${targetRow}:L${targetRow}`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rowData = rowDataRes.data?.values?.[0] || [];
    
    const dataAtual = rowData[0] || data;
    const anterior = rowData[4] || ''; // Coluna E
    const consumo = rowData[5] || ''; // Coluna F
    const diasStr = rowData[6] || ''; // Coluna G
    const media = rowData[7] || ''; // Coluna H
    const consumoSemana = rowData[8] || ''; // Coluna I
    const mediaSemana = rowData[9] || ''; // Coluna J
    const consumoMes = rowData[10] || ''; // Coluna K
    const mediaMes = rowData[11] || ''; // Coluna L
    
    const dias = diasStr ? parseInt(String(diasStr), 10) : 0;
    
    return { 
      ok: true, 
      consumo: String(consumo), 
      anterior: String(anterior), 
      data: dataAtual,
      dias: dias || 0,
      media: String(media),
      consumoSemana: String(consumoSemana),
      mediaSemana: String(mediaSemana),
      consumoMes: String(consumoMes),
      mediaMes: String(mediaMes),
      row: targetRow 
    };
  } catch (erro: any) {
    logger.warn('Inbox', `Planilha: erro ao ler dados calculados ${erro?.message || erro}`);
    return { ok: true, row: targetRow };
  }
}
