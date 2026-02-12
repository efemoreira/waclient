import { google } from 'googleapis';
import { logger } from './logger';
import { randomUUID } from 'crypto';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
const SHEET_NAME = process.env.GOOGLE_INSCRITOS_SHEET_NAME || 'Inscritos';
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

/**
 * Verificar se um número de celular já está inscrito
 */
export async function verificarInscrito(celular: string): Promise<{
  inscrito: boolean;
  uid?: string;
  nome?: string;
  erro?: string;
}> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inscritos', 'Credenciais não configuradas');
    return { inscrito: false, erro: 'Credenciais não configuradas' };
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Ler coluna D (Celular)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!D:D`,
      majorDimension: 'COLUMNS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const colunaD = result.data?.values?.[0] || [];
    const celularNormalizado = celular.replace(/\D/g, '');

    for (let i = 1; i < colunaD.length; i++) { // Começar do índice 1 (pular header)
      const cel = String(colunaD[i] || '').replace(/\D/g, '');
      if (cel === celularNormalizado) {
        // Encontrado! Ler UID (coluna A) e Nome (coluna C) da mesma linha
        const rangeResult = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A${i + 1}:C${i + 1}`,
          valueRenderOption: 'FORMATTED_VALUE',
        });
        const row = rangeResult.data?.values?.[0] || [];
        const uid = row[0] || '';
        const nome = row[2] || '';
        
        logger.info('Inscritos', `✅ Celular ${celular} encontrado: ${nome} (${uid})`);
        return { inscrito: true, uid, nome };
      }
    }

    logger.info('Inscritos', `⚠️  Celular ${celular} não encontrado nos inscritos`);
    return { inscrito: false };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao verificar inscrito: ${erro?.message || erro}`);
    return { inscrito: false, erro: erro?.message };
  }
}

/**
 * Adicionar novo inscrito com nome
 */
export async function adicionarInscrito(nome: string, celular: string): Promise<{
  ok: boolean;
  uid?: string;
  idImovel?: string;
  erro?: string;
}> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inscritos', 'Credenciais não configuradas');
    return { ok: false, erro: 'Credenciais não configuradas' };
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Encontrar última linha não vazia
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

    // Gerar UID e ID_Imovel
    const uid = randomUUID();
    const idImovel = `IMV${Date.now()}`;
    const datainscricao = new Date().toLocaleDateString('pt-BR');
    const celularFormatado = celular.replace(/\D/g, '');

    logger.info('Inscritos', `Adicionando novo inscrito: ${nome} (${celularFormatado})`);

    // Adicionar dados nas colunas: A=UID, B=ID_Imovel, C=Nome, D=Celular, F=Data_Inscricao
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEET_NAME}!A${targetRow}`, values: [[uid]] },
          { range: `${SHEET_NAME}!B${targetRow}`, values: [[idImovel]] },
          { range: `${SHEET_NAME}!C${targetRow}`, values: [[nome]] },
          { range: `${SHEET_NAME}!D${targetRow}`, values: [[celularFormatado]] },
          { range: `${SHEET_NAME}!F${targetRow}`, values: [[datainscricao]] },
        ],
      },
    });

    logger.info('Inscritos', `✅ Novo inscrito adicionado: ${nome} (UID: ${uid})`);
    return { ok: true, uid, idImovel };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao adicionar inscrito: ${erro?.message || erro}`);
    return { ok: false, erro: erro?.message };
  }
}
