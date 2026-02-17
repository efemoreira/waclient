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
    
    const inscricoes = await listarInscricoesPorCelular(celular);
    if (inscricoes.length > 0) {
      logger.info('Inscritos', `✅ Celular ${celular} encontrado: ${inscricoes[0].nome} (${inscricoes[0].uid})`);
      return { inscrito: true, uid: inscricoes[0].uid, nome: inscricoes[0].nome };
    }

    logger.info('Inscritos', `⚠️  Celular ${celular} não encontrado nos inscritos`);
    return { inscrito: false };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao verificar inscrito: ${erro?.message || erro}`);
    return { inscrito: false, erro: erro?.message };
  }
}

export type InscricaoInfo = {
  uid: string;
  idImovel: string;
  nome: string;
  celular: string;
  bairro: string;
  monitorandoAgua: boolean;
  monitorandoEnergia: boolean;
  monitorandoGas: boolean;
};

export async function listarInscricoesPorCelular(celular: string): Promise<InscricaoInfo[]> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inscritos', 'Credenciais não configuradas');
    return [];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:T`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = result.data?.values || [];
    const celularNormalizado = celular.replace(/\D/g, '');
    const inscritos: InscricaoInfo[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const cel = String(row[3] || '').replace(/\D/g, '');
      if (cel !== celularNormalizado) continue;

      inscritos.push({
        uid: String(row[0] || ''),
        idImovel: String(row[1] || ''),
        nome: String(row[2] || ''),
        celular: String(row[3] || ''),
        bairro: String(row[6] || ''),
        monitorandoAgua: String(row[16] || '').toLowerCase() === 'true',
        monitorandoEnergia: String(row[17] || '').toLowerCase() === 'true',
        monitorandoGas: String(row[18] || '').toLowerCase() === 'true',
      });
    }

    return inscritos;
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao listar inscritos: ${erro?.message || erro}`);
    return [];
  }
}

/**
 * Adicionar novo inscrito com nome
 */
export async function adicionarInscrito(params: {
  nome: string;
  celular: string;
  bairro?: string;
  cep?: string;
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
          { range: `${SHEET_NAME}!H${targetRow}`, values: [[params.cep || '']] },
          { range: `${SHEET_NAME}!I${targetRow}`, values: [[params.tipo_imovel || '']] },
          { range: `${SHEET_NAME}!J${targetRow}`, values: [[params.pessoas || '']] },
          { range: `${SHEET_NAME}!K${targetRow}`, values: [['Simples']] },
          { range: `${SHEET_NAME}!L${targetRow}`, values: [['']] },
          { range: `${SHEET_NAME}!M${targetRow}`, values: [[proximoPagamento]] },
          { range: `${SHEET_NAME}!N${targetRow}`, values: [[params.uid_indicador || '']] },
          { range: `${SHEET_NAME}!O${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!P${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!Q${targetRow}`, values: [[true]] },
          { range: `${SHEET_NAME}!R${targetRow}`, values: [[false]] },
          { range: `${SHEET_NAME}!S${targetRow}`, values: [[false]] },
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
            range: `${SHEET_NAME}!O${indicadorRow}`,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          const creditosAtual = Number(String(creditosRes.data?.values?.[0]?.[0] || '0').replace(',', '.')) || 0;
          const novoCredito = creditosAtual + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!O${indicadorRow}`,
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

/**
 * Atualizar configuração de monitoramento de um imóvel
 */
export async function atualizarMonitoramento(params: {
  idImovel: string;
  monitorandoAgua?: boolean;
  monitorandoEnergia?: boolean;
  monitorandoGas?: boolean;
}): Promise<{
  ok: boolean;
  erro?: string;
}> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inscritos', 'Credenciais não configuradas');
    return { ok: false, erro: 'Credenciais não configuradas' };
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Buscar a linha do imóvel
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!B:S`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = result.data?.values || [];
    let targetRow = -1;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const idImovelRow = String(row[0] || ''); // Coluna B (índice 0)
      if (idImovelRow === params.idImovel) {
        targetRow = i + 1; // +1 porque o índice começa em 1 no Sheets
        break;
      }
    }

    if (targetRow === -1) {
      logger.warn('Inscritos', `Imóvel não encontrado: ${params.idImovel}`);
      return { ok: false, erro: 'Imóvel não encontrado' };
    }

    // Atualizar os valores de monitoramento
    const updates = [];
    if (params.monitorandoAgua !== undefined) {
      updates.push({
        range: `${SHEET_NAME}!Q${targetRow}`,
        values: [[params.monitorandoAgua]]
      });
    }
    if (params.monitorandoEnergia !== undefined) {
      updates.push({
        range: `${SHEET_NAME}!R${targetRow}`,
        values: [[params.monitorandoEnergia]]
      });
    }
    if (params.monitorandoGas !== undefined) {
      updates.push({
        range: `${SHEET_NAME}!S${targetRow}`,
        values: [[params.monitorandoGas]]
      });
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      });
    }

    logger.info('Inscritos', `✅ Monitoramento atualizado para ${params.idImovel}`);
    return { ok: true };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao atualizar monitoramento: ${erro?.message || erro}`);
    return { ok: false, erro: erro?.message };
  }
}

/**
 * Adicionar novo imóvel para um usuário existente
 */
export async function adicionarImovel(params: {
  celular: string;
  bairro?: string;
  cep?: string;
  tipo_imovel?: string;
  pessoas?: string;
  monitorandoAgua?: boolean;
  monitorandoEnergia?: boolean;
  monitorandoGas?: boolean;
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

    // Buscar dados do usuário existente
    const inscricoes = await listarInscricoesPorCelular(params.celular);
    if (inscricoes.length === 0) {
      return { ok: false, erro: 'Usuário não encontrado' };
    }

    // Usar dados da primeira inscrição como referência
    const inscricaoRef = inscricoes[0];

    // Buscar todos os dados do usuário para pegar o nome completo
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:T`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = result.data?.values || [];
    const celularNormalizado = params.celular.replace(/\D/g, '');
    let nomeCompleto = inscricaoRef.nome;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const cel = String(row[3] || '').replace(/\D/g, '');
      if (cel === celularNormalizado) {
        nomeCompleto = String(row[2] || '');
        break;
      }
    }

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

    // Gerar novo UID e ID_Imovel
    const uid = randomUUID();
    const idImovel = `IMV${Date.now()}`;
    const datainscricao = new Date().toLocaleDateString('pt-BR');
    const dataProximoPagamento = new Date();
    dataProximoPagamento.setDate(dataProximoPagamento.getDate() + 30);
    const proximoPagamento = dataProximoPagamento.toLocaleDateString('pt-BR');

    logger.info('Inscritos', `Adicionando novo imóvel para: ${nomeCompleto} (${celularNormalizado})`);

    // Adicionar dados nas colunas conforme cabeçalho
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEET_NAME}!A${targetRow}`, values: [[uid]] },
          { range: `${SHEET_NAME}!B${targetRow}`, values: [[idImovel]] },
          { range: `${SHEET_NAME}!C${targetRow}`, values: [[nomeCompleto]] },
          { range: `${SHEET_NAME}!D${targetRow}`, values: [[celularNormalizado]] },
          { range: `${SHEET_NAME}!E${targetRow}`, values: [['']] },
          { range: `${SHEET_NAME}!F${targetRow}`, values: [[datainscricao]] },
          { range: `${SHEET_NAME}!G${targetRow}`, values: [[params.bairro || '']] },
          { range: `${SHEET_NAME}!H${targetRow}`, values: [[params.cep || '']] },
          { range: `${SHEET_NAME}!I${targetRow}`, values: [[params.tipo_imovel || '']] },
          { range: `${SHEET_NAME}!J${targetRow}`, values: [[params.pessoas || '']] },
          { range: `${SHEET_NAME}!K${targetRow}`, values: [['Simples']] },
          { range: `${SHEET_NAME}!L${targetRow}`, values: [['']] },
          { range: `${SHEET_NAME}!M${targetRow}`, values: [[proximoPagamento]] },
          { range: `${SHEET_NAME}!N${targetRow}`, values: [['']] }, // Sem indicador para imóveis adicionais
          { range: `${SHEET_NAME}!O${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!P${targetRow}`, values: [[0]] },
          { range: `${SHEET_NAME}!Q${targetRow}`, values: [[params.monitorandoAgua ?? true]] }, // defaults to true
          { range: `${SHEET_NAME}!R${targetRow}`, values: [[params.monitorandoEnergia ?? false]] },
          { range: `${SHEET_NAME}!S${targetRow}`, values: [[params.monitorandoGas ?? false]] },
        ],
      },
    });

    logger.info('Inscritos', `✅ Novo imóvel adicionado: ${idImovel} (UID: ${uid})`);
    return { ok: true, uid, idImovel };
  } catch (erro: any) {
    logger.warn('Inscritos', `Erro ao adicionar imóvel: ${erro?.message || erro}`);
    return { ok: false, erro: erro?.message };
  }
}
