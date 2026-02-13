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
export async function adicionarInscrito(params: {
  nome: string;
  celular: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  tipo_imovel?: string;
  pessoas?: string;
  uid_indicador?: string;
}): Promise<{
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
    const dataProximoPagamento = new Date();
    dataProximoPagamento.setDate(dataProximoPagamento.getDate() + 30);
    const proximoPagamento = dataProximoPagamento.toLocaleDateString('pt-BR');
    const celularFormatado = params.celular.replace(/\D/g, '');

    logger.info('Inscritos', `Adicionando novo inscrito: ${params.nome} (${celularFormatado})`);

    // Adicionar dados nas colunas conforme cabeçalho
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEET_NAME}!A${targetRow}`, values: [[uid]] },
          { range: `${SHEET_NAME}!B${targetRow}`, values: [[idImovel]] },
          { range: `${SHEET_NAME}!C${targetRow}`, values: [[params.nome]] },
          { range: `${SHEET_NAME}!D${targetRow}`, values: [[celularFormatado]] },
          { range: `${SHEET_NAME}!E${targetRow}`, values: [['']] },
          { range: `${SHEET_NAME}!F${targetRow}`, values: [[datainscricao]] },
          { range: `${SHEET_NAME}!G${targetRow}`, values: [[params.bairro || '']] },
          { range: `${SHEET_NAME}!H${targetRow}`, values: [[params.cidade || '']] },
          { range: `${SHEET_NAME}!I${targetRow}`, values: [[params.estado || '']] },
          { range: `${SHEET_NAME}!J${targetRow}`, values: [[params.tipo_imovel || '']] },
          { range: `${SHEET_NAME}!K${targetRow}`, values: [[params.pessoas || '']] },
          { range: `${SHEET_NAME}!L${targetRow}`, values: [['Simples']] },
          { range: `${SHEET_NAME}!M${targetRow}`, values: [[5]] },
          { range: `${SHEET_NAME}!N${targetRow}`, values: [['']] },
          { range: `${SHEET_NAME}!O${targetRow}`, values: [[proximoPagamento]] },
          { range: `${SHEET_NAME}!P${targetRow}`, values: [[params.uid_indicador || '']] },
          { range: `${SHEET_NAME}!Q${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!R${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!S${targetRow}`, values: [[0]] },
        ],
      },
    });

    // Se tiver UID do indicador, somar +1 nos créditos de indicação dele
    const uidIndicador = (params.uid_indicador || '').trim();
    if (uidIndicador && uidIndicador.toLowerCase() !== 'não' && uidIndicador.toLowerCase() !== 'nao') {
      try {
        const colA = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A:A`,
          majorDimension: 'COLUMNS',
          valueRenderOption: 'FORMATTED_VALUE',
        });
        const colAValues = colA.data?.values?.[0] || [];
        let indicadorRow = -1;
        for (let i = 1; i < colAValues.length; i++) {
          if (String(colAValues[i]).trim() === uidIndicador) {
            indicadorRow = i + 1;
            break;
          }
        }
        if (indicadorRow > 0) {
          const creditosRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!Q${indicadorRow}`,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          const creditosAtual = Number(String(creditosRes.data?.values?.[0]?.[0] || '0').replace(',', '.')) || 0;
          const novoCredito = creditosAtual + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!Q${indicadorRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[novoCredito]] },
          });
          logger.info('Inscritos', `Crédito de indicação atualizado para UID ${uidIndicador}: ${novoCredito}`);
        } else {
          logger.warn('Inscritos', `UID indicador não encontrado: ${uidIndicador}`);
        }
      } catch (erro: any) {
        logger.warn('Inscritos', `Erro ao atualizar crédito do indicador: ${erro?.message || erro}`);
      }
    }

    logger.info('Inscritos', `✅ Novo inscrito adicionado: ${params.nome} (UID: ${uid})`);
    return { ok: true, uid, idImovel };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao adicionar inscrito: ${erro?.message || erro}`);
    return { ok: false, erro: erro?.message };
  }
}
