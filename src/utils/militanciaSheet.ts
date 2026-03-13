/**
 * Google Sheets utilities for the political mobilization bot
 * Handles all data operations for: Militantes, Missões, Conteúdos, Eventos, Liderança, Denúncias
 */

import { google } from 'googleapis';
import { logger } from './logger';
import { normalizarTexto } from './text-normalizer';

/**
 * Normalize status strings for comparison.
 * Strips diacritics so 'concluído' and 'concluido' both match 'concluido'.
 */
function isConcluido(status: string): boolean {
  return normalizarTexto(status).trim() === 'concluido';
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';

// Sheet tab names (configurable via environment)
const SHEET_MILITANTES = process.env.GOOGLE_MILITANTES_SHEET_NAME || 'Militantes';
const SHEET_MISSOES = process.env.GOOGLE_MISSOES_SHEET_NAME || 'Missões';
const SHEET_CONTEUDOS = process.env.GOOGLE_CONTEUDOS_SHEET_NAME || 'Conteúdos';
const SHEET_EVENTOS = process.env.GOOGLE_EVENTOS_SHEET_NAME || 'Eventos';
const SHEET_LIDERANCA = process.env.GOOGLE_LIDERANCA_SHEET_NAME || 'Liderança';
const SHEET_DENUNCIAS = process.env.GOOGLE_DENUNCIAS_SHEET_NAME || 'Denúncias';

/**
 * Normalizes Google service account private key
 */
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
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;
  return new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: normalizarPrivateKey(PRIVATE_KEY),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function dataAtual(): string {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function appendRow(sheetName: string, values: (string | number)[]): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('MilitanciaSheet', 'Credenciais não configuradas');
    return;
  }
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function getRows(sheetName: string, range: string): Promise<string[][]> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('MilitanciaSheet', 'Credenciais não configuradas');
    return [];
  }
  const sheets = google.sheets({ version: 'v4', auth });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${range}`,
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (result.data?.values || []) as string[][];
}

// ---- Militantes tab (columns: data, nome, telefone, bairro, nivel, pontos, data_ultima_interacao) ----

export type MilitanteInfo = {
  dataInscricao: string;
  nome: string;
  celular: string;
  bairro: string;
  nivel: number;
  pontos: number;
  dataUltimaInteracao: string;
};

export async function buscarMilitante(celular: string): Promise<MilitanteInfo | null> {
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:G');
    const cel = celular.replace(/\D/g, '');
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel === cel) {
        return {
          dataInscricao: String(row[0] || ''),
          nome: String(row[1] || ''),
          celular: String(row[2] || ''),
          bairro: String(row[3] || ''),
          nivel: Number(row[4] || 1),
          pontos: Number(row[5] || 0),
          dataUltimaInteracao: String(row[6] || ''),
        };
      }
    }
    return null;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao buscar militante: ${err?.message}`);
    return null;
  }
}

export async function registrarMilitante(nome: string, celular: string, bairro: string): Promise<boolean> {
  try {
    await appendRow(SHEET_MILITANTES, [dataAtual(), nome, celular.replace(/\D/g, ''), bairro, 1, 0, dataAtual()]);
    logger.info('MilitanciaSheet', `✅ Militante registrado: ${nome} (${celular})`);
    return true;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar militante: ${err?.message}`);
    return false;
  }
}

export function calcularNivel(pontos: number): number {
  if (pontos >= 500) return 6;
  if (pontos >= 200) return 5;
  if (pontos >= 100) return 4;
  if (pontos >= 50) return 3;
  if (pontos >= 20) return 2;
  return 1;
}

export function nomeDoNivel(nivel: number): string {
  const niveis: Record<number, string> = {
    1: 'Simpatizante',
    2: 'Militante',
    3: 'Militante Ativo',
    4: 'Mobilizador',
    5: 'Líder de Bairro',
    6: 'Coordenador Regional',
  };
  return niveis[nivel] || 'Simpatizante';
}

export async function atualizarPontosENivel(celular: string, pontos: number): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:G');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel === cel) {
        const targetRow = i + 1;
        const pontosAtual = Number(row[5] || 0);
        const novosPontos = pontosAtual + pontos;
        const novoNivel = calcularNivel(novosPontos);

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${SHEET_MILITANTES}!E${targetRow}`, values: [[novoNivel]] },
              { range: `${SHEET_MILITANTES}!F${targetRow}`, values: [[novosPontos]] },
              { range: `${SHEET_MILITANTES}!G${targetRow}`, values: [[dataAtual()]] },
            ],
          },
        });
        logger.info('MilitanciaSheet', `✅ Pontos atualizados: ${celular} -> ${novosPontos} pts (nível ${novoNivel})`);
        return;
      }
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar pontos: ${err?.message}`);
  }
}

export async function atualizarUltimaInteracao(celular: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:G');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel === cel) {
        const targetRow = i + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_MILITANTES}!G${targetRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[dataAtual()]] },
        });
        return;
      }
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar última interação: ${err?.message}`);
  }
}

// ---- Missões tab (columns: data, telefone, missao_do_dia, status, pontos_gerados) ----

export async function registrarRespostaMissao(
  celular: string,
  missaoDia: string,
  status: 'concluído' | 'pendente'
): Promise<void> {
  const pontos = status === 'concluído' ? 10 : 0;
  try {
    await appendRow(SHEET_MISSOES, [dataAtual(), celular.replace(/\D/g, ''), missaoDia, status, pontos]);
    if (pontos > 0) {
      await atualizarPontosENivel(celular, pontos);
    }
    logger.info('MilitanciaSheet', `✅ Missão registrada: ${celular} - ${status}`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar missão: ${err?.message}`);
  }
}

// ---- Conteúdos tab (columns: data, telefone, conteudo_acessado, tipo) ----

export async function registrarAcessoConteudo(
  celular: string,
  conteudo: string,
  tipo: string
): Promise<void> {
  try {
    await appendRow(SHEET_CONTEUDOS, [dataAtual(), celular.replace(/\D/g, ''), conteudo, tipo]);
    await atualizarPontosENivel(celular, 5);
    logger.info('MilitanciaSheet', `✅ Conteúdo acessado: ${celular} - ${conteudo}`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar conteúdo: ${err?.message}`);
  }
}

// ---- Eventos tab (columns: data, telefone, evento, confirmacao) ----

export async function registrarConfirmacaoEvento(
  celular: string,
  evento: string,
  confirmacao: 'sim' | 'talvez'
): Promise<void> {
  try {
    await appendRow(SHEET_EVENTOS, [dataAtual(), celular.replace(/\D/g, ''), evento, confirmacao]);
    logger.info('MilitanciaSheet', `✅ Evento confirmado: ${celular} - ${evento} (${confirmacao})`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar evento: ${err?.message}`);
  }
}

// ---- Liderança tab (columns: data, nome, telefone, bairro, area_interesse, disponibilidade) ----

export async function registrarInteresseLideranca(
  nome: string,
  celular: string,
  bairro: string,
  areaInteresse: string,
  disponibilidade: string
): Promise<void> {
  try {
    await appendRow(SHEET_LIDERANCA, [
      dataAtual(),
      nome,
      celular.replace(/\D/g, ''),
      bairro,
      areaInteresse,
      disponibilidade,
    ]);
    logger.info('MilitanciaSheet', `✅ Liderança registrada: ${nome} (${celular})`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar liderança: ${err?.message}`);
  }
}

// ---- Denúncias tab (columns: data, telefone, bairro, descricao, link_midia, status_analise) ----

export async function registrarDenuncia(
  celular: string,
  bairro: string,
  descricao: string,
  linkMidia?: string
): Promise<void> {
  try {
    await appendRow(SHEET_DENUNCIAS, [
      dataAtual(),
      celular.replace(/\D/g, ''),
      bairro,
      descricao,
      linkMidia || '',
      'pendente',
    ]);
    logger.info('MilitanciaSheet', `✅ Denúncia registrada: ${celular} - ${bairro}`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar denúncia: ${err?.message}`);
  }
}

// ---- Neighborhood panel and ranking ----

export type PainelBairro = {
  bairro: string;
  militantesAtivos: number;
  missoesConcluidasSemana: number;
  nivelMedio: number;
  lider?: string;
};

export async function obterPainelBairro(bairro: string): Promise<PainelBairro> {
  try {
    const bairroNorm = bairro.toLowerCase().trim();

    const militantes = await getRows(SHEET_MILITANTES, 'A:G');
    let militantesAtivos = 0;
    let somaNiveis = 0;
    let lider: string | undefined;
    const celsBairro = new Set<string>();

    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowBairro = String(row[3] || '').toLowerCase().trim();
      if (rowBairro === bairroNorm) {
        militantesAtivos++;
        const nivel = Number(row[4] || 1);
        somaNiveis += nivel;
        const cel = String(row[2] || '').replace(/\D/g, '');
        celsBairro.add(cel);
        if (nivel >= 5 && !lider) lider = String(row[1] || '');
      }
    }

    const missoes = await getRows(SHEET_MISSOES, 'A:E');
    let missoesConcluidasSemana = 0;

    for (let i = 1; i < missoes.length; i++) {
      const row = missoes[i] || [];
      const status = String(row[3] || '');
      if (isConcluido(status)) {
        const celMissao = String(row[1] || '').replace(/\D/g, '');
        if (celsBairro.has(celMissao)) {
          missoesConcluidasSemana++;
        }
      }
    }

    const nivelMedio = militantesAtivos > 0 ? Math.round(somaNiveis / militantesAtivos) : 0;
    return { bairro, militantesAtivos, missoesConcluidasSemana, nivelMedio, lider };
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter painel: ${err?.message}`);
    return { bairro, militantesAtivos: 0, missoesConcluidasSemana: 0, nivelMedio: 0 };
  }
}

export type RankingBairro = {
  bairro: string;
  missoes: number;
};

export async function obterRankingBairros(): Promise<RankingBairro[]> {
  try {
    const militantes = await getRows(SHEET_MILITANTES, 'A:G');
    const missoes = await getRows(SHEET_MISSOES, 'A:E');

    const celBairroMap = new Map<string, string>();
    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const cel = String(row[2] || '').replace(/\D/g, '');
      const b = String(row[3] || '');
      if (cel && b) celBairroMap.set(cel, b);
    }

    const bairroMissoes = new Map<string, number>();
    for (let i = 1; i < missoes.length; i++) {
      const row = missoes[i] || [];
      const status = String(row[3] || '');
      if (isConcluido(status)) {
        const cel = String(row[1] || '').replace(/\D/g, '');
        const b = celBairroMap.get(cel);
        if (b) {
          bairroMissoes.set(b, (bairroMissoes.get(b) || 0) + 1);
        }
      }
    }

    return Array.from(bairroMissoes.entries())
      .map(([b, m]) => ({ bairro: b, missoes: m }))
      .sort((a, b) => b.missoes - a.missoes)
      .slice(0, 10);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter ranking: ${err?.message}`);
    return [];
  }
}
