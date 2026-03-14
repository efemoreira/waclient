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

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
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

// ---- Militantes tab (columns: data, nome, telefone, bairro, nivel, pontos, data_ultima_interacao, cidade) ----

export type MilitanteInfo = {
  dataInscricao: string;
  nome: string;
  celular: string;
  bairro: string;
  cidade: string;
  nivel: number;
  pontos: number;
  dataUltimaInteracao: string;
};

/**
 * Returns true when the militant has all minimum required fields filled:
 * nome, bairro and cidade.
 */
export function isCadastroCompleto(militante: MilitanteInfo): boolean {
  return !!(militante.nome?.trim() && militante.bairro?.trim() && militante.cidade?.trim());
}

export async function buscarMilitante(celular: string): Promise<MilitanteInfo | null> {
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:H');
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
          cidade: String(row[7] || ''),
        };
      }
    }
    return null;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao buscar militante: ${err?.message}`);
    return null;
  }
}

export async function registrarMilitante(
  nome: string,
  celular: string,
  bairro: string,
  cidade: string
): Promise<boolean> {
  try {
    await appendRow(SHEET_MILITANTES, [
      dataAtual(),
      nome,
      celular.replace(/\D/g, ''),
      bairro,
      1,
      0,
      dataAtual(),
      cidade,
    ]);
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
    // Gamification rule: show at least 3 militants to avoid early demotivation
    const militantesDisplay = militantesAtivos <= 2 ? 3 : militantesAtivos;
    return { bairro, militantesAtivos: militantesDisplay, missoesConcluidasSemana, nivelMedio, lider };
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

// ---- Personal dashboard ----

export type DashboardPessoal = {
  missoesConcluidasTotal: number;
  militantesNoBairro: number;
  posicaoNoBairro: number;
  posicaoGeral: number;
};

/**
 * Returns personal engagement dashboard data for a militant.
 * Applies the gamification rule: if neighborhood count is 1 or 2, display 3 instead.
 */
export async function obterDashboardPessoal(
  celular: string,
  bairro: string
): Promise<DashboardPessoal> {
  try {
    const cel = celular.replace(/\D/g, '');
    const bairroNorm = bairro.toLowerCase().trim();

    const [militantes, missoes] = await Promise.all([
      getRows(SHEET_MILITANTES, 'A:H'),
      getRows(SHEET_MISSOES, 'A:E'),
    ]);

    // Build cel -> bairro map and collect militants in the user's bairro
    const celBairroMap = new Map<string, string>();
    const celsBairro = new Set<string>();
    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      const rowBairro = String(row[3] || '').toLowerCase().trim();
      if (rowCel) celBairroMap.set(rowCel, rowBairro);
      if (rowBairro === bairroNorm) celsBairro.add(rowCel);
    }

    // Gamification rule: show at least 3 militants in the neighborhood
    const militantesNoBairro = celsBairro.size <= 2 ? 3 : celsBairro.size;

    // Count completed missions per militant
    const missoesPorCel = new Map<string, number>();
    for (let i = 1; i < missoes.length; i++) {
      const row = missoes[i] || [];
      const status = String(row[3] || '');
      if (isConcluido(status)) {
        const rowCel = String(row[1] || '').replace(/\D/g, '');
        missoesPorCel.set(rowCel, (missoesPorCel.get(rowCel) || 0) + 1);
      }
    }

    const missoesConcluidasTotal = missoesPorCel.get(cel) || 0;

    // Rank user within their neighborhood
    const bairroRanking = Array.from(celsBairro)
      .map((c) => ({ cel: c, missoes: missoesPorCel.get(c) || 0 }))
      .sort((a, b) => b.missoes - a.missoes);
    const idxBairro = bairroRanking.findIndex((m) => m.cel === cel);
    const posicaoNoBairro = idxBairro >= 0 ? idxBairro + 1 : bairroRanking.length + 1;

    // Global ranking
    const globalRanking = Array.from(celBairroMap.keys())
      .map((c) => ({ cel: c, missoes: missoesPorCel.get(c) || 0 }))
      .sort((a, b) => b.missoes - a.missoes);
    const idxGeral = globalRanking.findIndex((m) => m.cel === cel);
    const posicaoGeral = idxGeral >= 0 ? idxGeral + 1 : globalRanking.length + 1;

    return { missoesConcluidasTotal, militantesNoBairro, posicaoNoBairro, posicaoGeral };
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter dashboard: ${err?.message}`);
    // Return safe defaults; militantesNoBairro defaults to 3 per the gamification display rule
    return { missoesConcluidasTotal: 0, militantesNoBairro: 3, posicaoNoBairro: 1, posicaoGeral: 1 };
  }
}

// ---- Latest content and nearest event for non-registered users ----

export type ConteudoInfo = {
  titulo: string;
  link?: string;
  tipo?: string;
};

/**
 * Returns the most recently published content from the Conteúdos sheet.
 * The sheet has two kinds of rows:
 *   - Catalog rows (added by admins): column B (telefone) is empty.
 *     Format: [data, '', titulo, link?, tipo?]
 *   - Access-log rows (appended when a user views content): column B is a phone number.
 *     Format: [data, telefone, conteudo_acessado, tipo]
 * Catalog rows take priority; the function searches from the bottom for the most recent one.
 * Falls back to access-log rows if no catalog entries exist.
 */
export async function obterUltimoConteudo(): Promise<ConteudoInfo | null> {
  try {
    const rows = await getRows(SHEET_CONTEUDOS, 'A:E');
    // Search from the bottom for a catalog entry (row with empty telefone and non-empty conteudo)
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const telefone = String(row[1] || '').trim();
      const conteudo = String(row[2] || '').trim();
      if (!telefone && conteudo) {
        return {
          titulo: conteudo,
          link: String(row[3] || '').trim() || undefined,
          tipo: String(row[4] || '').trim() || undefined,
        };
      }
    }
    // Fall back to last access-log row with non-empty conteudo
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const conteudo = String(row[2] || '').trim();
      if (conteudo) {
        return { titulo: conteudo };
      }
    }
    return null;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter último conteúdo: ${err?.message}`);
    return null;
  }
}

export type EventoInfo = {
  nome: string;
  local?: string;
  data?: string;
};

/**
 * Returns the nearest upcoming event from the Eventos sheet.
 * The sheet has two kinds of rows:
 *   - Catalog rows (added by admins): column B (telefone) is empty.
 *     Format: [data_publicacao, '', nome_evento, local, data_evento]
 *   - Confirmation-log rows (appended when a user confirms attendance): column B is a phone number.
 *     Format: [data, telefone, evento, confirmacao]
 * Catalog rows take priority; the function searches from the bottom for the most recent one.
 * Falls back to last confirmation-log row if no catalog entries exist.
 */
export async function obterProximoEvento(): Promise<EventoInfo | null> {
  try {
    const rows = await getRows(SHEET_EVENTOS, 'A:E');
    // Search from the bottom for a catalog entry (empty telefone)
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const telefone = String(row[1] || '').trim();
      const nome = String(row[2] || '').trim();
      if (!telefone && nome) {
        return {
          nome,
          local: String(row[3] || '').trim() || undefined,
          data: String(row[4] || '').trim() || undefined,
        };
      }
    }
    // Fall back to last access-log row
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const evento = String(row[2] || '').trim();
      if (evento) {
        return { nome: evento };
      }
    }
    return null;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter próximo evento: ${err?.message}`);
    return null;
  }
}
