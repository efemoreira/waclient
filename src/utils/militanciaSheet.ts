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
    throw new Error('Credenciais não configuradas');
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

// ---- Militantes tab columns ----
// A (0): data_inscricao
// B (1): nome
// C (2): telefone
// D (3): bairro
// E (4): nivel
// F (5): pontos
// G (6): ultima_interacao
// H (7): cidade
// I (8): missoes_concluidas      [gamification]
// J (9): streak_atual            [gamification]
// K (10): ultima_missao_data     [gamification]
// L (11): titulos                [gamification]
// M (12): denuncias_enviadas     [gamification]
// N (13): conteudos_compartilhados [gamification]
// O (14): militantes_recrutados  [gamification]

export type MilitanteInfo = {
  dataInscricao: string;
  nome: string;
  celular: string;
  bairro: string;
  cidade: string;
  nivel: number;
  pontos: number;
  dataUltimaInteracao: string;
  missoesConcluidasTotal: number;
  streakAtual: number;
  ultimaMissaoData: string;
  titulos: string;
  denunciasEnviadas: number;
  conteudosCompartilhados: number;
  militantesRecrutados: number;
};

function normalizarTelefone(celular: string): string {
  return celular.replace(/\D/g, '');
}

function telefonesIguais(a: string, b: string): boolean {
  const aa = normalizarTelefone(a);
  const bb = normalizarTelefone(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  // Accept both with and without country code 55
  if (aa.startsWith('55') && aa.slice(2) === bb) return true;
  if (bb.startsWith('55') && bb.slice(2) === aa) return true;
  return false;
}

function parseMilitanteRow(row: string[]): MilitanteInfo {
  return {
    dataInscricao: String(row[0] || ''),
    nome: String(row[1] || ''),
    celular: String(row[2] || ''),
    bairro: String(row[3] || ''),
    nivel: Number(row[4] || 1),
    pontos: Number(row[5] || 0),
    dataUltimaInteracao: String(row[6] || ''),
    cidade: String(row[7] || ''),
    missoesConcluidasTotal: Number(row[8] || 0),
    streakAtual: Number(row[9] || 0),
    ultimaMissaoData: String(row[10] || ''),
    titulos: String(row[11] || ''),
    denunciasEnviadas: Number(row[12] || 0),
    conteudosCompartilhados: Number(row[13] || 0),
    militantesRecrutados: Number(row[14] || 0),
  };
}

function scoreMilitante(row: string[]): number {
  const militante = parseMilitanteRow(row);
  let score = 0;
  if (militante.nome.trim()) score += 10;
  if (militante.bairro.trim()) score += 10;
  if (militante.cidade.trim()) score += 10;
  if (isCadastroCompleto(militante)) score += 100;
  return score;
}

/**
 * Returns true when the militant has all minimum required fields filled:
 * nome, bairro and cidade.
 */
export function isCadastroCompleto(militante: MilitanteInfo): boolean {
  return !!(militante.nome?.trim() && militante.bairro?.trim() && militante.cidade?.trim());
}

export async function buscarMilitante(celular: string): Promise<MilitanteInfo | null> {
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:O');
    let bestRow: string[] | null = null;
    let bestScore = -1;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '');
      if (telefonesIguais(rowCel, celular)) {
        const score = scoreMilitante(row);
        if (score > bestScore) {
          bestRow = row;
          bestScore = score;
        }
      }
    }
    return bestRow ? parseMilitanteRow(bestRow) : null;
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
      dataAtual(), // A: data_inscricao
      nome,        // B: nome
      celular.replace(/\D/g, ''), // C: telefone
      bairro,      // D: bairro
      1,           // E: nivel
      0,           // F: pontos
      dataAtual(), // G: ultima_interacao
      cidade,      // H: cidade
      0,           // I: missoes_concluidas
      0,           // J: streak_atual
      '',          // K: ultima_missao_data
      '',          // L: titulos
      0,           // M: denuncias_enviadas
      0,           // N: conteudos_compartilhados
      0,           // O: militantes_recrutados
    ]);
    logger.info('MilitanciaSheet', `✅ Militante registrado: ${nome} (${celular})`);
    return true;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar militante: ${err?.message}`);
    return false;
  }
}

/**
 * Registers only the phone number on first contact.
 * Leaves nome, bairro and cidade empty so isCadastroCompleto returns false.
 * This ensures the contact is tracked even if the user never completes registration.
 */
export async function registrarContato(celular: string): Promise<boolean> {
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:C');
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (telefonesIguais(String(row[2] || ''), celular)) {
        logger.info('MilitanciaSheet', `ℹ️ Contato já existente: ${celular}`);
        return true;
      }
    }

    await appendRow(SHEET_MILITANTES, [
      dataAtual(), // A: data_inscricao
      '',          // B: nome (empty – not yet registered)
      normalizarTelefone(celular), // C: telefone
      '',          // D: bairro (empty)
      1,           // E: nivel
      0,           // F: pontos
      dataAtual(), // G: ultima_interacao
      '',          // H: cidade (empty)
      0,           // I: missoes_concluidas
      0,           // J: streak_atual
      '',          // K: ultima_missao_data
      '',          // L: titulos
      0,           // M: denuncias_enviadas
      0,           // N: conteudos_compartilhados
      0,           // O: militantes_recrutados
    ]);
    logger.info('MilitanciaSheet', `📞 Contato registrado: ${celular}`);
    return true;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar contato: ${err?.message}`);
    return false;
  }
}

/**
 * Updates registration fields (nome, bairro, cidade) for an existing row
 * in the Militantes sheet. Used to increment registration step-by-step
 * without creating a second row.
 *
 * Column mapping:
 *  B (1) – nome
 *  D (3) – bairro
 *  H (7) – cidade
 */
export async function atualizarCamposMilitante(
  celular: string,
  campos: Partial<{ nome: string; bairro: string; cidade: string }>
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const rows = await getRows(SHEET_MILITANTES, 'A:O');
    let rowIndexToUpdate = -1;
    let fallbackIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '');
      if (!telefonesIguais(rowCel, celular)) continue;

      if (fallbackIndex === -1) fallbackIndex = i;

      // Prefer updating an incomplete row when duplicates exist.
      const rowNome = String(row[1] || '').trim();
      const rowBairro = String(row[3] || '').trim();
      const rowCidade = String(row[7] || '').trim();
      if (!rowNome || !rowBairro || !rowCidade) {
        rowIndexToUpdate = i;
        break;
      }
    }

    const chosen = rowIndexToUpdate !== -1 ? rowIndexToUpdate : fallbackIndex;
    if (chosen === -1) return false;

    const rowNum = chosen + 1; // sheet rows are 1-based (+1 for header)
    const data: Array<{ range: string; values: string[][] }> = [];
    if (campos.nome !== undefined) data.push({ range: `${SHEET_MILITANTES}!B${rowNum}`, values: [[campos.nome]] });
    if (campos.bairro !== undefined) data.push({ range: `${SHEET_MILITANTES}!D${rowNum}`, values: [[campos.bairro]] });
    if (campos.cidade !== undefined) data.push({ range: `${SHEET_MILITANTES}!H${rowNum}`, values: [[campos.cidade]] });

    if (data.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data },
      });
    }
    logger.info('MilitanciaSheet', `✅ Campos atualizados: ${celular}`);
    return true;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar campos do militante: ${err?.message}`);
    return false;
  }
}

export function calcularNivel(missoesConcluidasTotal: number): number {
  if (missoesConcluidasTotal >= 150) return 6;
  if (missoesConcluidasTotal >= 80) return 5;
  if (missoesConcluidasTotal >= 40) return 4;
  if (missoesConcluidasTotal >= 15) return 3;
  if (missoesConcluidasTotal >= 5) return 2;
  return 1;
}

export function nomeDoNivel(nivel: number): string {
  const niveis: Record<number, string> = {
    1: 'Simpatizante',
    2: 'Militante',
    3: 'Militante Ativo',
    4: 'Mobilizador',
    5: 'Líder de Bairro',
    6: 'Coordenador',
  };
  return niveis[nivel] || 'Simpatizante';
}

/**
 * Returns the collective level of a neighborhood based on total missions.
 * Level 0 means the neighborhood hasn't reached the first threshold yet.
 */
export function calcularNivelBairro(missoesTotais: number): number {
  if (missoesTotais >= 400) return 4;
  if (missoesTotais >= 250) return 3;
  if (missoesTotais >= 120) return 2;
  if (missoesTotais >= 50) return 1;
  return 0;
}

/**
 * Checks if a date string (dd/mm/yyyy, Brazilian format) represents yesterday
 * in the America/Sao_Paulo timezone.
 */
function isOntem(dataStr: string): boolean {
  if (!dataStr) return false;
  const partes = dataStr.trim().split('/');
  if (partes.length !== 3) return false;
  const [diaStr, mesStr, anoStr] = partes;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(ano)) return false;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2000) return false;
  const stored = new Date(ano, mes - 1, dia);
  const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const ontem = new Date(agoraSP);
  ontem.setDate(ontem.getDate() - 1);
  return (
    stored.getFullYear() === ontem.getFullYear() &&
    stored.getMonth() === ontem.getMonth() &&
    stored.getDate() === ontem.getDate()
  );
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

        // Only update pontos (col F). Level is now mission-based and managed
        // by atualizarMissoesStreakNivel.
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_MILITANTES}!F${targetRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[novosPontos]] },
        });
        logger.info('MilitanciaSheet', `✅ Pontos atualizados: ${celular} -> ${novosPontos} pts`);
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

/**
 * Persists registration completion date for a militant.
 * Convention used here:
 * - A (data_inscricao) stores first contact date.
 * - P (data_cadastro) stores the date when nome+bairro+cidade were completed.
 */
export async function atualizarDataCadastro(celular: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:P');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '');
      if (!telefonesIguais(rowCel, celular)) continue;

      const targetRow = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_MILITANTES}!P${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[dataAtual()]] },
      });
      return;
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar data de cadastro: ${err?.message}`);
  }
}

// ---- Gamification: achievements, streak, mission-based level updates ----

/**
 * Result returned after a mission is marked as completed.
 */
export type MissaoResultado = {
  levelUp: boolean;
  nivelAnterior: number;
  novoNivel: number;
  novasConquistas: string[];
  streakAtual: number;
  missoesConcluidasTotal: number;
};

/**
 * Checks which achievements (conquistas) are newly unlocked for a militant.
 * Compares current stats against what is already stored in the `titulos` column.
 * Returns only the newly unlocked achievement names.
 */
export function verificarConquistas(militante: MilitanteInfo): string[] {
  const conquistasAtivas = new Set(
    (militante.titulos || '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const novas: string[] = [];

  const m = militante.missoesConcluidasTotal;
  if (m >= 1 && !conquistasAtivas.has('Primeira missão')) novas.push('Primeira missão');
  if (m >= 7 && !conquistasAtivas.has('Militante ativo')) novas.push('Militante ativo');
  if (m >= 30 && !conquistasAtivas.has('Persistente')) novas.push('Persistente');
  if ((militante.conteudosCompartilhados || 0) >= 20 && !conquistasAtivas.has('Influenciador'))
    novas.push('Influenciador');
  if ((militante.militantesRecrutados || 0) >= 3 && !conquistasAtivas.has('Mobilizador'))
    novas.push('Mobilizador');
  if ((militante.denunciasEnviadas || 0) >= 3 && !conquistasAtivas.has('Observador da cidade'))
    novas.push('Observador da cidade');

  return novas;
}

/**
 * Appends newly unlocked achievements to the `titulos` column (L) for a militant.
 */
async function atualizarTitulos(celular: string, novosTitulos: string[]): Promise<void> {
  if (!novosTitulos.length) return;
  const auth = getAuth();
  if (!auth) return;
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:L');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel !== cel) continue;

      const targetRow = i + 1;
      const existentes = String(row[11] || '').trim();
      const todosTitulos = existentes
        ? `${existentes}, ${novosTitulos.join(', ')}`
        : novosTitulos.join(', ');

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_MILITANTES}!L${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[todosTitulos]] },
      });
      return;
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar títulos: ${err?.message}`);
  }
}

/**
 * Increments `missoes_concluidas` (col I), updates streak (col J + K),
 * recalculates level (col E) and records the latest interaction (col G).
 * Returns the updated gamification state.
 */
async function atualizarMissoesStreakNivel(celular: string): Promise<{
  nivelAnterior: number;
  novoNivel: number;
  levelUp: boolean;
  streakAtual: number;
  missoesConcluidasTotal: number;
  militante: MilitanteInfo | null;
}> {
  const fallback = {
    nivelAnterior: 1,
    novoNivel: 1,
    levelUp: false,
    streakAtual: 1,
    missoesConcluidasTotal: 1,
    militante: null,
  };
  const auth = getAuth();
  if (!auth) return fallback;

  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:O');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel !== cel) continue;

      const targetRow = i + 1;
      const nivelAnterior = Number(row[4] || 1);
      const missoesPrev = Number(row[8] || 0);
      const streakPrev = Number(row[9] || 0);
      const ultimaMissaoData = String(row[10] || '').trim();

      const novasMissoes = missoesPrev + 1;
      const novoStreak = isOntem(ultimaMissaoData) ? streakPrev + 1 : 1;
      const novoNivel = calcularNivel(novasMissoes);
      const levelUp = novoNivel > nivelAnterior;
      const hoje = dataAtual();

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${SHEET_MILITANTES}!E${targetRow}`, values: [[novoNivel]] },
            { range: `${SHEET_MILITANTES}!G${targetRow}`, values: [[hoje]] },
            { range: `${SHEET_MILITANTES}!I${targetRow}`, values: [[novasMissoes]] },
            { range: `${SHEET_MILITANTES}!J${targetRow}`, values: [[novoStreak]] },
            { range: `${SHEET_MILITANTES}!K${targetRow}`, values: [[hoje]] },
          ],
        },
      });

      const militante: MilitanteInfo = {
        dataInscricao: String(row[0] || ''),
        nome: String(row[1] || ''),
        celular: String(row[2] || ''),
        bairro: String(row[3] || ''),
        nivel: novoNivel,
        pontos: Number(row[5] || 0),
        dataUltimaInteracao: hoje,
        cidade: String(row[7] || ''),
        missoesConcluidasTotal: novasMissoes,
        streakAtual: novoStreak,
        ultimaMissaoData: hoje,
        titulos: String(row[11] || ''),
        denunciasEnviadas: Number(row[12] || 0),
        conteudosCompartilhados: Number(row[13] || 0),
        militantesRecrutados: Number(row[14] || 0),
      };

      logger.info(
        'MilitanciaSheet',
        `✅ Missão atualizada: ${celular} – missões: ${novasMissoes}, streak: ${novoStreak}, nível: ${novoNivel}`
      );
      return { nivelAnterior, novoNivel, levelUp, streakAtual: novoStreak, missoesConcluidasTotal: novasMissoes, militante };
    }

    return fallback;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar missões: ${err?.message}`);
    return fallback;
  }
}

// ---- Missões tab (columns: data, telefone, missao_do_dia, status, pontos_gerados) ----

export async function registrarRespostaMissao(
  celular: string,
  missaoDia: string,
  status: 'concluído' | 'pendente'
): Promise<MissaoResultado> {
  const defaultResult: MissaoResultado = {
    levelUp: false,
    nivelAnterior: 1,
    novoNivel: 1,
    novasConquistas: [],
    streakAtual: 1,
    missoesConcluidasTotal: 0,
  };
  const pontos = status === 'concluído' ? 10 : 0;
  try {
    await appendRow(SHEET_MISSOES, [dataAtual(), celular.replace(/\D/g, ''), missaoDia, status, pontos]);

    if (status === 'concluído') {
      // Update optional pontos (fire-and-forget; failures do not affect gamification flow)
      atualizarPontosENivel(celular, pontos).catch((e) =>
        logger.warn('MilitanciaSheet', `Erro ao atualizar pontos (non-critical): ${e?.message}`)
      );

      const resultado = await atualizarMissoesStreakNivel(celular);
      let novasConquistas: string[] = [];
      if (resultado.militante) {
        novasConquistas = verificarConquistas(resultado.militante);
        if (novasConquistas.length > 0) {
          await atualizarTitulos(celular, novasConquistas);
        }
      }

      return {
        levelUp: resultado.levelUp,
        nivelAnterior: resultado.nivelAnterior,
        novoNivel: resultado.novoNivel,
        novasConquistas,
        streakAtual: resultado.streakAtual,
        missoesConcluidasTotal: resultado.missoesConcluidasTotal,
      };
    }

    logger.info('MilitanciaSheet', `✅ Missão registrada: ${celular} - ${status}`);
    return defaultResult;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar missão: ${err?.message}`);
    return defaultResult;
  }
}

// ---- Conteúdos tab (columns: data, telefone, conteudo_acessado, tipo) ----

/**
 * Increments a numeric counter column (e.g. 'M' for denuncias_enviadas) in the Militantes sheet.
 */
async function incrementarContador(celular: string, coluna: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const colIdx = coluna.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, ...
    const rows = await getRows(SHEET_MILITANTES, `A:${coluna.toUpperCase()}`);
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel !== cel) continue;

      const targetRow = i + 1;
      const valorAtual = Number(row[colIdx] || 0);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_MILITANTES}!${coluna.toUpperCase()}${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[valorAtual + 1]] },
      });
      return;
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao incrementar ${coluna}: ${err?.message}`);
  }
}

export async function registrarAcessoConteudo(
  celular: string,
  conteudo: string,
  tipo: string
): Promise<void> {
  try {
    await appendRow(SHEET_CONTEUDOS, [dataAtual(), celular.replace(/\D/g, ''), conteudo, tipo]);
    // Update optional pontos and increment conteudos_compartilhados counter (col N)
    // Both are fire-and-forget; failures do not block content access registration
    atualizarPontosENivel(celular, 5).catch((e) =>
      logger.warn('MilitanciaSheet', `Erro ao atualizar pontos de conteúdo (non-critical): ${e?.message}`)
    );
    incrementarContador(celular, 'N').catch((e) =>
      logger.warn('MilitanciaSheet', `Erro ao incrementar conteudos_compartilhados (non-critical): ${e?.message}`)
    );
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
    // Increment denuncias_enviadas counter (col M) – fire-and-forget
    incrementarContador(celular, 'M').catch((e) =>
      logger.warn('MilitanciaSheet', `Erro ao incrementar denuncias_enviadas (non-critical): ${e?.message}`)
    );
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
  nivelBairro: number;
  missoesTotais: number;
};

export async function obterPainelBairro(bairro: string): Promise<PainelBairro> {
  try {
    const bairroNorm = bairro.toLowerCase().trim();

    const militantes = await getRows(SHEET_MILITANTES, 'A:I');
    let militantesAtivos = 0;
    let somaNiveis = 0;
    let somaMissoes = 0;
    let lider: string | undefined;
    const celsBairro = new Set<string>();

    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowBairro = String(row[3] || '').toLowerCase().trim();
      if (rowBairro === bairroNorm) {
        militantesAtivos++;
        const nivel = Number(row[4] || 1);
        somaNiveis += nivel;
        // col I (index 8): missoes_concluidas
        somaMissoes += Number(row[8] || 0);
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
    const nivelBairro = calcularNivelBairro(somaMissoes);
    // Gamification rule: show at least 3 militants to avoid early demotivation
    const militantesDisplay = militantesAtivos <= 2 ? 3 : militantesAtivos;
    return { bairro, militantesAtivos: militantesDisplay, missoesConcluidasSemana, nivelMedio, lider, nivelBairro, missoesTotais: somaMissoes };
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter painel: ${err?.message}`);
    return { bairro, militantesAtivos: 0, missoesConcluidasSemana: 0, nivelMedio: 0, nivelBairro: 0, missoesTotais: 0 };
  }
}

export type RankingBairro = {
  bairro: string;
  missoes: number;
};

export async function obterRankingBairros(): Promise<RankingBairro[]> {
  try {
    // Use missoes_concluidas (col I, index 8) directly from the Militantes sheet
    const militantes = await getRows(SHEET_MILITANTES, 'A:I');

    const bairroMissoes = new Map<string, number>();
    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const b = String(row[3] || '').trim();
      const missoes = Number(row[8] || 0);
      if (b) {
        bairroMissoes.set(b, (bairroMissoes.get(b) || 0) + missoes);
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
 * Uses the `missoes_concluidas` column (I) stored in the Militantes sheet.
 * Applies the gamification rule: if neighborhood count is 1 or 2, display 3 instead.
 */
export async function obterDashboardPessoal(
  celular: string,
  bairro: string
): Promise<DashboardPessoal> {
  try {
    const cel = celular.replace(/\D/g, '');
    const bairroNorm = bairro.toLowerCase().trim();

    const militantes = await getRows(SHEET_MILITANTES, 'A:I');

    // Build ranking maps using missoes_concluidas from the Militantes sheet
    const celBairroMap = new Map<string, string>();
    const celMissoesMap = new Map<string, number>();
    const celsBairro = new Set<string>();

    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      const rowBairro = String(row[3] || '').toLowerCase().trim();
      const rowMissoes = Number(row[8] || 0); // col I: missoes_concluidas
      if (rowCel) {
        celBairroMap.set(rowCel, rowBairro);
        celMissoesMap.set(rowCel, rowMissoes);
      }
      if (rowBairro === bairroNorm) celsBairro.add(rowCel);
    }

    // Gamification rule: show at least 3 militants in the neighborhood
    const militantesNoBairro = celsBairro.size <= 2 ? 3 : celsBairro.size;
    const missoesConcluidasTotal = celMissoesMap.get(cel) || 0;

    // Rank user within their neighborhood
    const bairroRanking = Array.from(celsBairro)
      .map((c) => ({ cel: c, missoes: celMissoesMap.get(c) || 0 }))
      .sort((a, b) => b.missoes - a.missoes);
    const idxBairro = bairroRanking.findIndex((m) => m.cel === cel);
    const posicaoNoBairro = idxBairro >= 0 ? idxBairro + 1 : bairroRanking.length + 1;

    // Global ranking
    const globalRanking = Array.from(celBairroMap.keys())
      .map((c) => ({ cel: c, missoes: celMissoesMap.get(c) || 0 }))
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
