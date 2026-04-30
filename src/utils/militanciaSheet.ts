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
const SHEET_TITULOS = process.env.GOOGLE_TITULOS_SHEET_NAME || 'Títulos';

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
// D (3): cidade
// E (4): bairro
// F (5): nivel
// G (6): pontos
// H (7): ultima_interacao
// I (8): missoes_concluidas      [gamification]
// J (9): streak_atual            [gamification]
// K (10): ultima_missao_data     [gamification]
// L (11): titulos                [gamification]
// M (12): denuncias_enviadas     [gamification]
// N (13): conteudos_compartilhados [gamification]
// O (14): militantes_recrutados  [gamification]
// P (15): data_cadastro
// Q (16): origem                  [quem convidou ou qual rede social]

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
    cidade: String(row[3] || ''),
    bairro: String(row[4] || ''),
    nivel: Number(row[5] || 1),
    pontos: Number(row[6] || 0),
    dataUltimaInteracao: String(row[7] || ''),
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
      cidade,      // D: cidade
      bairro,      // E: bairro
      1,           // F: nivel
      0,           // G: pontos
      dataAtual(), // H: ultima_interacao
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
      '',          // D: cidade (empty)
      '',          // E: bairro (empty)
      1,           // F: nivel
      0,           // G: pontos
      dataAtual(), // H: ultima_interacao
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
 * Returns the count of militants who have a name filled in (i.e. completed at
 * least the first registration step). Used for social-proof messaging.
 */
export async function contarMilitantes(): Promise<number> {
  try {
    const rows = await getRows(SHEET_MILITANTES, 'A:B');
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const nome = String(rows[i]?.[1] || '').trim(); // B(1) = nome
      if (nome) count++;
    }
    return count || 1;
  } catch {
    return 1;
  }
}

/**
 * Updates registration fields (nome, bairro, cidade) for an existing row
 * in the Militantes sheet. Used to increment registration step-by-step
 * without creating a second row.
 *
 * Column mapping:
 *  B (1) – nome
 *  D (3) – cidade
 *  E (4) – bairro
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
      const rowBairro = String(row[4] || '').trim();
      const rowCidade = String(row[3] || '').trim();
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
    if (campos.cidade !== undefined) data.push({ range: `${SHEET_MILITANTES}!D${rowNum}`, values: [[campos.cidade]] });
    if (campos.bairro !== undefined) data.push({ range: `${SHEET_MILITANTES}!E${rowNum}`, values: [[campos.bairro]] });

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
 * Returns the points awarded for completing a mission based on current streak.
 * Longer streaks earn bonus points as a multiplier reward:
 *   streak  1–6  → 10 pts (base)
 *   streak  7–29 → 15 pts (+5 streak bonus)
 *   streak  30+  → 20 pts (+10 streak bonus)
 */
export function calcularPontosMissao(streak: number): number {
  if (streak >= 30) return 20;
  if (streak >= 7) return 15;
  return 10;
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
    const rows = await getRows(SHEET_MILITANTES, 'A:H');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel === cel) {
        const targetRow = i + 1;
        const pontosAtual = Number(row[6] || 0);  // G(6) = pontos
        const novosPontos = pontosAtual + pontos;

        // Only update pontos (col G). Level is now mission-based and managed
        // by atualizarMissoesStreakNivel.
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_MILITANTES}!G${targetRow}`,
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
    const rows = await getRows(SHEET_MILITANTES, 'A:H');
    const cel = celular.replace(/\D/g, '');
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowCel = String(row[2] || '').replace(/\D/g, '');
      if (rowCel === cel) {
        const targetRow = i + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_MILITANTES}!H${targetRow}`,
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

/**
 * Registers the referral source for a newly registered militant.
 * - If `origem` looks like a Brazilian phone number (10–13 digits), normalizes it,
 *   increments the recruiter's militantes_recrutados counter (col O) and awards +15 pts.
 * - Otherwise saves the text as-is (e.g. 'Instagram', 'Facebook').
 * Always stores the result in column Q of the militant's row.
 */
export async function registrarOrigem(celular: string, origem: string): Promise<void> {
  try {
    const digits = origem.replace(/\D/g, '');
    const isPhone = digits.length >= 10 && digits.length <= 13;

    let origemParaSalvar = origem.trim();
    if (isPhone) {
      const phoneCompleto = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
      origemParaSalvar = phoneCompleto;
      // Credit recruiter (fire-and-forget)
      incrementarContador(phoneCompleto, 'O').catch(() => {});
      atualizarPontosENivel(phoneCompleto, 15).catch(() => {});
    }

    const auth = getAuth();
    if (!auth) return;
    const sheets = google.sheets({ version: 'v4', auth });
    const rows = await getRows(SHEET_MILITANTES, 'A:C');
    for (let i = 1; i < rows.length; i++) {
      if (telefonesIguais(String(rows[i]?.[2] || ''), celular)) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_MILITANTES}!Q${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[origemParaSalvar]] },
        });
        return;
      }
    }
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar origem: ${err?.message}`);
  }
}

// ---- Gamification: achievements, streak, mission-based level updates ----

// ---- Title (achievement) system ----
// Titles are identified by numeric string IDs. The display name and unlock
// criteria are defined here as defaults and can be overridden via the Títulos
// sheet (id | nome | criterio) without a code deploy.

export type TituloInfo = {
  id: string;
  nome: string;
  criterio: string;
};

export const TITULOS_PADRAO: Record<string, TituloInfo> = {
  // === MISSÕES ===
  '1':  { id: '1',  nome: 'Recruta',              criterio: 'Completar a 1ª missão' },
  '2':  { id: '2',  nome: 'Ativista',             criterio: 'Completar 7 missões' },
  '3':  { id: '3',  nome: 'Combatente',           criterio: 'Completar 30 missões' },
  '9':  { id: '9',  nome: 'Ativista Prata',       criterio: 'Completar 20 missões' },
  '10': { id: '10', nome: 'Ativista Ouro',        criterio: 'Completar 50 missões' },
  '11': { id: '11', nome: 'Combatente Prata',     criterio: 'Completar 80 missões' },
  '12': { id: '12', nome: 'Combatente Ouro',      criterio: 'Completar 120 missões' },
  '13': { id: '13', nome: 'Veterano da Causa',    criterio: 'Completar 180 missões' },
  // === STREAK ===
  '7':  { id: '7',  nome: 'Semana em Campo',      criterio: 'Streak de 7 dias consecutivos' },
  '14': { id: '14', nome: 'Semana em Campo Prata',criterio: 'Streak de 14 dias consecutivos' },
  '8':  { id: '8',  nome: 'Mês em Campo',         criterio: 'Streak de 30 dias consecutivos' },
  '15': { id: '15', nome: 'Mês em Campo Ouro',    criterio: 'Streak de 60 dias consecutivos' },
  '16': { id: '16', nome: 'Incansável',           criterio: 'Streak de 90 dias consecutivos' },
  // === CONTEÚDO ===
  '4':  { id: '4',  nome: 'Porta-Voz',           criterio: 'Compartilhar 20 conteúdos' },
  '17': { id: '17', nome: 'Porta-Voz Prata',     criterio: 'Compartilhar 40 conteúdos' },
  '18': { id: '18', nome: 'Porta-Voz Ouro',      criterio: 'Compartilhar 60 conteúdos' },
  // === RECRUTAMENTO ===
  '5':  { id: '5',  nome: 'Articulador',         criterio: 'Recrutar 3 membros' },
  '19': { id: '19', nome: 'Articulador Prata',   criterio: 'Recrutar 7 membros' },
  '20': { id: '20', nome: 'Articulador Ouro',    criterio: 'Recrutar 15 membros' },
  // === DENÚNCIAS ===
  '6':  { id: '6',  nome: 'Fiscal das Ruas',     criterio: 'Enviar 3 denúncias' },
  '21': { id: '21', nome: 'Fiscal Prata',        criterio: 'Enviar 7 denúncias' },
  '22': { id: '22', nome: 'Fiscal Ouro',         criterio: 'Enviar 15 denúncias' },
  // === PONTOS ===
  '23': { id: '23', nome: 'Força do Movimento',  criterio: 'Acumular 500 pontos' },
  '24': { id: '24', nome: 'Pilar da Causa',      criterio: 'Acumular 1000 pontos' },
};

/** Returns the display name for a title ID (falls back gracefully). */
export function resolverNomeTitulo(id: string): string {
  return TITULOS_PADRAO[id]?.nome || `Título #${id}`;
}

/**
 * Reads the Títulos sheet and returns all defined titles.
 * Sheet structure: [id, nome, criterio]
 * Falls back to TITULOS_PADRAO if the sheet is absent or empty.
 */
export async function obterTitulosSheet(): Promise<TituloInfo[]> {
  try {
    const rows = await getRows(SHEET_TITULOS, 'A:C');
    const result: TituloInfo[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const id = String(row[0] || '').trim();
      const nome = String(row[1] || '').trim();
      if (id && nome) {
        result.push({ id, nome, criterio: String(row[2] || '').trim() });
      }
    }
    return result.length ? result : Object.values(TITULOS_PADRAO);
  } catch {
    return Object.values(TITULOS_PADRAO);
  }
}

/**
 * Checks streak-based milestone titles (IDs 7 and 8).
 * Called separately from verificarConquistas so it can use the post-update streak.
 */
function verificarStreakMilestones(titulosAtuais: string, novoStreak: number): string[] {
  const conquistasAtivas = new Set(
    titulosAtuais.split(',').map((s) => s.trim()).filter(Boolean)
  );
  const novas: string[] = [];
  const milestones: Array<{ streak: number; id: string }> = [
    { streak: 7,  id: '7'  },
    { streak: 14, id: '14' },
    { streak: 30, id: '8'  },
    { streak: 60, id: '15' },
    { streak: 90, id: '16' },
  ];
  for (const { streak, id } of milestones) {
    if (novoStreak >= streak && !conquistasAtivas.has(id)) novas.push(id);
  }
  return novas;
}

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
  pontos: number;       // total pontos after this mission
  pontosGanhos: number; // delta awarded for this mission (10, 15 or 20)
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
  if (m >= 1   && !conquistasAtivas.has('1'))  novas.push('1');
  if (m >= 7   && !conquistasAtivas.has('2'))  novas.push('2');
  if (m >= 20  && !conquistasAtivas.has('9'))  novas.push('9');
  if (m >= 30  && !conquistasAtivas.has('3'))  novas.push('3');
  if (m >= 50  && !conquistasAtivas.has('10')) novas.push('10');
  if (m >= 80  && !conquistasAtivas.has('11')) novas.push('11');
  if (m >= 120 && !conquistasAtivas.has('12')) novas.push('12');
  if (m >= 180 && !conquistasAtivas.has('13')) novas.push('13');

  const c = militante.conteudosCompartilhados || 0;
  if (c >= 20 && !conquistasAtivas.has('4'))  novas.push('4');
  if (c >= 40 && !conquistasAtivas.has('17')) novas.push('17');
  if (c >= 60 && !conquistasAtivas.has('18')) novas.push('18');

  const r = militante.militantesRecrutados || 0;
  if (r >= 3  && !conquistasAtivas.has('5'))  novas.push('5');
  if (r >= 7  && !conquistasAtivas.has('19')) novas.push('19');
  if (r >= 15 && !conquistasAtivas.has('20')) novas.push('20');

  const d = militante.denunciasEnviadas || 0;
  if (d >= 3  && !conquistasAtivas.has('6'))  novas.push('6');
  if (d >= 7  && !conquistasAtivas.has('21')) novas.push('21');
  if (d >= 15 && !conquistasAtivas.has('22')) novas.push('22');

  const p = militante.pontos || 0;
  if (p >= 500  && !conquistasAtivas.has('23')) novas.push('23');
  if (p >= 1000 && !conquistasAtivas.has('24')) novas.push('24');

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
 * recalculates level (col F), awards streak-aware points (col G),
 * and records the latest interaction (col H).
 * Returns the updated gamification state.
 */
async function atualizarMissoesStreakNivel(celular: string): Promise<{
  nivelAnterior: number;
  novoNivel: number;
  levelUp: boolean;
  streakAtual: number;
  missoesConcluidasTotal: number;
  pontos: number;
  pontosMissao: number;
  militante: MilitanteInfo | null;
}> {
  const fallback = {
    nivelAnterior: 1,
    novoNivel: 1,
    levelUp: false,
    streakAtual: 1,
    missoesConcluidasTotal: 1,
    pontos: 0,
    pontosMissao: 10,
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
      const nivelAnterior = Number(row[5] || 1);  // F(5) = nivel
      const missoesPrev = Number(row[8] || 0);
      const streakPrev = Number(row[9] || 0);
      const ultimaMissaoData = String(row[10] || '').trim();

      const novasMissoes = missoesPrev + 1;
      const novoStreak = isOntem(ultimaMissaoData) ? streakPrev + 1 : 1;
      const novoNivel = calcularNivel(novasMissoes);
      const levelUp = novoNivel > nivelAnterior;
      const hoje = dataAtual();

      // Streak-aware dynamic points
      const pontosMissao = calcularPontosMissao(novoStreak);
      const pontosAtual = Number(row[6] || 0);  // G(6) = pontos
      const novosPontos = pontosAtual + pontosMissao;

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${SHEET_MILITANTES}!F${targetRow}`, values: [[novoNivel]] },     // F = nivel
            { range: `${SHEET_MILITANTES}!G${targetRow}`, values: [[novosPontos]] },   // G = pontos
            { range: `${SHEET_MILITANTES}!H${targetRow}`, values: [[hoje]] },          // H = ultima_interacao
            { range: `${SHEET_MILITANTES}!I${targetRow}`, values: [[novasMissoes]] },  // I = missoes_concluidas
            { range: `${SHEET_MILITANTES}!J${targetRow}`, values: [[novoStreak]] },    // J = streak_atual
            { range: `${SHEET_MILITANTES}!K${targetRow}`, values: [[hoje]] },          // K = ultima_missao_data
          ],
        },
      });

      const militante: MilitanteInfo = {
        dataInscricao: String(row[0] || ''),
        nome: String(row[1] || ''),
        celular: String(row[2] || ''),
        cidade: String(row[3] || ''),              // D(3) = cidade
        bairro: String(row[4] || ''),              // E(4) = bairro
        nivel: novoNivel,
        pontos: novosPontos,
        dataUltimaInteracao: hoje,
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
        `✅ Missão: ${celular} – missões: ${novasMissoes}, streak: ${novoStreak}, nível: ${novoNivel}, pontos: +${pontosMissao} (total: ${novosPontos})`
      );
      return { nivelAnterior, novoNivel, levelUp, streakAtual: novoStreak, missoesConcluidasTotal: novasMissoes, pontos: novosPontos, pontosMissao, militante };
    }

    return fallback;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao atualizar missões: ${err?.message}`);
    return fallback;
  }
}

// ---- Missões tab (columns: data, missao, concluiram) ----
// One row per daily mission. 'concluiram' stores a comma-separated list
// of phone numbers of militants who confirmed completion.

export async function registrarRespostaMissao(
  celular: string,
  missaoDia: string
): Promise<MissaoResultado> {
  const defaultResult: MissaoResultado = {
    levelUp: false,
    nivelAnterior: 1,
    novoNivel: 1,
    novasConquistas: [],
    streakAtual: 1,
    missoesConcluidasTotal: 0,
    pontos: 0,
    pontosGanhos: 10,
  };
  try {
    const auth = getAuth();
    const cel = celular.replace(/\D/g, '');

    // Try to find an existing row for today's mission and append the phone to 'concluiram'
    if (auth) {
      const sheets = google.sheets({ version: 'v4', auth });
      const rows = await getRows(SHEET_MISSOES, 'A:C');
      const hoje = dataAtual();
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const rowData = String(row[0] || '').trim();
        const rowMissao = String(row[1] || '').trim();
        if (rowData === hoje && rowMissao === missaoDia) {
          const jaRegistrados = String(row[2] || '').trim();
          const lista = jaRegistrados ? jaRegistrados.split(',').map((t) => t.trim()) : [];
          if (!lista.includes(cel)) lista.push(cel);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_MISSOES}!C${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[lista.join(',')]] },
          });
          logger.info('MilitanciaSheet', `✅ Missão: ${cel} adicionado a concluiram`);
          break;
        }
      }
    } else {
      // No auth available — create a new row as fallback
      await appendRow(SHEET_MISSOES, [dataAtual(), missaoDia, cel]);
    }

    // Points are now computed inside atualizarMissoesStreakNivel with streak multiplier.
    // No separate atualizarPontosENivel call needed.

    const resultado = await atualizarMissoesStreakNivel(celular);
    let novasConquistas: string[] = [];
    if (resultado.militante) {
      novasConquistas = [
        ...verificarConquistas(resultado.militante),
        ...verificarStreakMilestones(resultado.militante.titulos, resultado.streakAtual),
      ];
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
      pontos: resultado.pontos,
      pontosGanhos: resultado.pontosMissao,
    };
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
    atualizarPontosENivel(celular, 3).catch((e) =>
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

// ---- Eventos tab (columns: nome, texto, data, hora, local, confirmacoes) ----
// One row per event. 'confirmacoes' stores a comma-separated list
// of phone numbers of militants who confirmed attendance.

export async function registrarConfirmacaoEvento(
  celular: string,
  nomeEvento: string,
  confirmado = false
): Promise<void> {
  try {
    const auth = getAuth();
    const cel = celular.replace(/\D/g, '');

    if (auth) {
      const sheets = google.sheets({ version: 'v4', auth });
      const rows = await getRows(SHEET_EVENTOS, 'A:F');
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const rowNome = String(row[0] || '').trim();
        if (rowNome === nomeEvento) {
          const jaRegistrados = String(row[5] || '').trim();
          const lista = jaRegistrados ? jaRegistrados.split(',').map((t) => t.trim()) : [];
          if (!lista.includes(cel)) lista.push(cel);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_EVENTOS}!F${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[lista.join(',')]] },
          });
          logger.info('MilitanciaSheet', `✅ Evento confirmado: ${cel} → ${nomeEvento}`);
          if (confirmado) {
            atualizarPontosENivel(celular, 5).catch((e) =>
              logger.warn('MilitanciaSheet', `Erro ao atualizar pontos (evento): ${e?.message}`)
            );
          }
          return;
        }
      }
      // Event row not found — create it
      await appendRow(SHEET_EVENTOS, [nomeEvento, '', '', '', '', cel]);
      if (confirmado) {
        atualizarPontosENivel(celular, 5).catch((e) =>
          logger.warn('MilitanciaSheet', `Erro ao atualizar pontos (evento): ${e?.message}`)
        );
      }
      logger.info('MilitanciaSheet', `✅ Evento criado e confirmado: ${cel} → ${nomeEvento}`);
    } else {
      await appendRow(SHEET_EVENTOS, [nomeEvento, '', '', '', '', cel]);
    }
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

// ---- Denúncias tab (columns: data, telefone, bairro, descricao) ----
// No media column — the bot does not process images.

export async function registrarDenuncia(
  celular: string,
  bairro: string,
  descricao: string
): Promise<string> {
  // Generate a short protocol code: D + YYMMDD-HHMM
  const agora = new Date();
  const protocolo = `D${String(agora.getFullYear()).slice(-2)}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}-${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`;
  try {
    await appendRow(SHEET_DENUNCIAS, [
      dataAtual(),
      celular.replace(/\D/g, ''),
      bairro,
      descricao,
      protocolo,
    ]);
    // Increment denuncias_enviadas counter (col M) – fire-and-forget
    incrementarContador(celular, 'M').catch((e) =>
      logger.warn('MilitanciaSheet', `Erro ao incrementar denuncias_enviadas (non-critical): ${e?.message}`)
    );
    // Award +8 pts for civic reporting – fire-and-forget
    atualizarPontosENivel(celular, 8).catch((e) =>
      logger.warn('MilitanciaSheet', `Erro ao atualizar pontos (denúncia): ${e?.message}`)
    );
    logger.info('MilitanciaSheet', `✅ Denúncia registrada: ${celular} - ${bairro} (${protocolo})`);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao registrar denúncia: ${err?.message}`);
  }
  return protocolo;
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
  pontosTotais: number;  // sum of all members' pontos — main competitive metric
};

export async function obterPainelBairro(bairro: string): Promise<PainelBairro> {
  try {
    const bairroNorm = bairro.toLowerCase().trim();

    const militantes = await getRows(SHEET_MILITANTES, 'A:I');
    let militantesAtivos = 0;
    let somaNiveis = 0;
    let somaMissoes = 0;
    let somaPontos = 0;
    let lider: string | undefined;
    const celsBairro = new Set<string>();

    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowBairro = String(row[4] || '').toLowerCase().trim();  // E(4) = bairro
      if (rowBairro === bairroNorm) {
        militantesAtivos++;
        const nivel = Number(row[5] || 1);   // F(5) = nivel
        somaNiveis += nivel;
        somaPontos += Number(row[6] || 0);   // G(6) = pontos
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
    return { bairro, militantesAtivos: militantesDisplay, missoesConcluidasSemana, nivelMedio, lider, nivelBairro, missoesTotais: somaMissoes, pontosTotais: somaPontos };
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter painel: ${err?.message}`);
    return { bairro, militantesAtivos: 0, missoesConcluidasSemana: 0, nivelMedio: 0, nivelBairro: 0, missoesTotais: 0, pontosTotais: 0 };
  }
}

export type RankingBairro = {
  bairro: string;
  pontos: number;  // sum of all members' pontos
};

// In-memory cache for ranking — avoids re-reading all rows on every panel request.
// TTL = 5 minutes. Resets on each cold start, shared within a warm Vercel instance.
let _rankingCache: { data: RankingBairro[]; ts: number } | null = null;
const RANKING_TTL_MS = 5 * 60 * 1000;

export async function obterRankingBairros(): Promise<RankingBairro[]> {
  if (_rankingCache && Date.now() - _rankingCache.ts < RANKING_TTL_MS) {
    return _rankingCache.data;
  }
  try {
    // Read only E:G (bairro, nivel, pontos) — 3 columns instead of 7
    const militantes = await getRows(SHEET_MILITANTES, 'E:G');
    const bairroPontos = new Map<string, number>();
    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const b = String(row[0] || '').trim();  // E = row[0] in E:G range
      const pts = Number(row[2] || 0);        // G = row[2] in E:G range
      if (b) {
        bairroPontos.set(b, (bairroPontos.get(b) || 0) + pts);
      }
    }

    const result = Array.from(bairroPontos.entries())
      .map(([b, p]) => ({ bairro: b, pontos: p }))
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 10);

    _rankingCache = { data: result, ts: Date.now() };
    return result;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter ranking: ${err?.message}`);
    return [];
  }
}

// ---- Personal dashboard ----

export type DashboardPessoal = {
  missoesConcluidasTotal: number;
  militantesNoBairro: number;
  posicaoNoBairro: number;  // ranked by pontos
  posicaoGeral: number;     // ranked by pontos
};

/**
 * Returns personal engagement dashboard data for a militant.
 * Position rankings use pontos (col G) so all engagement types count,
 * not just missions.
 * Applies the gamification rule: if neighborhood count is 1 or 2, display 3 instead.
 */
export async function obterDashboardPessoal(
  celular: string,
  bairro: string
): Promise<DashboardPessoal> {
  try {
    const cel = celular.replace(/\D/g, '');
    const bairroNorm = bairro.toLowerCase().trim();

    const militantes = await getRows(SHEET_MILITANTES, 'C:I');

    const celBairroMap = new Map<string, string>();
    const celPontosMap = new Map<string, number>();
    const celMissoesMap = new Map<string, number>();
    const celsBairro = new Set<string>();

    for (let i = 1; i < militantes.length; i++) {
      const row = militantes[i] || [];
      const rowCel = String(row[0] || '').replace(/\D/g, '');  // C(0 in C:I) = telefone
      const rowBairro = String(row[2] || '').toLowerCase().trim();  // E(2 in C:I) = bairro
      const rowPontos = Number(row[4] || 0);   // G(4 in C:I) = pontos
      const rowMissoes = Number(row[6] || 0);  // I(6 in C:I) = missoes_concluidas
      if (rowCel) {
        celBairroMap.set(rowCel, rowBairro);
        celPontosMap.set(rowCel, rowPontos);
        celMissoesMap.set(rowCel, rowMissoes);
      }
      if (rowBairro === bairroNorm) celsBairro.add(rowCel);
    }

    // Gamification rule: show at least 3 militants in the neighborhood
    const militantesNoBairro = celsBairro.size <= 2 ? 3 : celsBairro.size;
    const missoesConcluidasTotal = celMissoesMap.get(cel) || 0;

    // Rank by pontos within the neighborhood
    const bairroRanking = Array.from(celsBairro)
      .map((c) => ({ cel: c, pontos: celPontosMap.get(c) || 0 }))
      .sort((a, b) => b.pontos - a.pontos);
    const idxBairro = bairroRanking.findIndex((m) => m.cel === cel);
    const posicaoNoBairro = idxBairro >= 0 ? idxBairro + 1 : bairroRanking.length + 1;

    // Global rank by pontos
    const globalRanking = Array.from(celBairroMap.keys())
      .map((c) => ({ cel: c, pontos: celPontosMap.get(c) || 0 }))
      .sort((a, b) => b.pontos - a.pontos);
    const idxGeral = globalRanking.findIndex((m) => m.cel === cel);
    const posicaoGeral = idxGeral >= 0 ? idxGeral + 1 : globalRanking.length + 1;

    return { missoesConcluidasTotal, militantesNoBairro, posicaoNoBairro, posicaoGeral };
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter dashboard: ${err?.message}`);
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
export async function obterUltimoConteudo(filtroTipo?: string): Promise<ConteudoInfo | null> {
  try {
    const rows = await getRows(SHEET_CONTEUDOS, 'A:E');
    // Search from the bottom for a catalog entry (row with empty telefone and non-empty conteudo)
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const telefone = String(row[1] || '').trim();
      const conteudo = String(row[2] || '').trim();
      const tipo = String(row[4] || '').trim();
      if (!telefone && conteudo) {
        if (filtroTipo && tipo.toLowerCase() !== filtroTipo.toLowerCase()) continue;
        return {
          titulo: conteudo,
          link: String(row[3] || '').trim() || undefined,
          tipo: tipo || undefined,
        };
      }
    }
    // When filtering by tipo, do not fall back to access-log rows
    if (filtroTipo) return null;
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
  texto?: string;
  data?: string;
  hora?: string;
  local?: string;
};

/** Parses a Brazilian date string 'dd/mm/yyyy' into a Date (midnight local time). */
function parseDateBR(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

/**
 * Returns the mission text for today from the Missões sheet.
 * Looks for a row where col A matches today's date (dd/mm/yyyy) and returns
 * the mission text from col B. Returns null if not found — callers should
 * fall back to the MISSAO_DO_DIA env var.
 */
export async function obterMissaoDia(): Promise<string | null> {
  try {
    const rows = await getRows(SHEET_MISSOES, 'A:B');
    const hoje = dataAtual();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const data = String(row[0] || '').trim();
      const missao = String(row[1] || '').trim();
      if (data === hoje && missao) return missao;
    }
    return null;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter missão do dia: ${err?.message}`);
    return null;
  }
}

/**
 * Returns the next upcoming event from the Eventos sheet.
 * Sheet structure: [nome, texto, data, hora, local, confirmacoes]
 * Filters out past events and returns the soonest future event.
 * Events without a date are included as last resort (no date = always future).
 */
export async function obterProximoEvento(): Promise<EventoInfo | null> {
  try {
    const rows = await getRows(SHEET_EVENTOS, 'A:E');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming: Array<{ evento: EventoInfo; date: Date | null }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const nome = String(row[0] || '').trim();
      if (!nome) continue;

      const texto = String(row[1] || '').trim() || undefined;
      const dataStr = String(row[2] || '').trim();
      const hora = String(row[3] || '').trim() || undefined;
      const local = String(row[4] || '').trim() || undefined;

      // Skip events that have already passed
      if (dataStr) {
        const eventDate = parseDateBR(dataStr);
        if (eventDate && eventDate < today) continue;
      }

      upcoming.push({
        evento: { nome, texto, data: dataStr || undefined, hora, local },
        date: dataStr ? parseDateBR(dataStr) : null,
      });
    }

    if (!upcoming.length) return null;

    // Sort ascending by date; events without a date go to the end
    upcoming.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });

    return upcoming[0].evento;
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter próximo evento: ${err?.message}`);
    return null;
  }
}

/**
 * Returns up to `limite` upcoming events sorted from nearest to farthest.
 * Same filtering logic as obterProximoEvento (past events excluded).
 */
export async function obterProximosEventos(limite: number = 3): Promise<EventoInfo[]> {
  try {
    const rows = await getRows(SHEET_EVENTOS, 'A:E');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming: Array<{ evento: EventoInfo; date: Date | null }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const nome = String(row[0] || '').trim();
      if (!nome) continue;

      const texto = String(row[1] || '').trim() || undefined;
      const dataStr = String(row[2] || '').trim();
      const hora = String(row[3] || '').trim() || undefined;
      const local = String(row[4] || '').trim() || undefined;

      if (dataStr) {
        const eventDate = parseDateBR(dataStr);
        if (eventDate && eventDate < today) continue;
      }

      upcoming.push({
        evento: { nome, texto, data: dataStr || undefined, hora, local },
        date: dataStr ? parseDateBR(dataStr) : null,
      });
    }

    upcoming.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });

    return upcoming.slice(0, limite).map((u) => u.evento);
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter próximos eventos: ${err?.message}`);
    return [];
  }
}

/**
 * Returns the most recent catalog entry for each unique tipo from the Conteúdos sheet.
 * Useful for registered users who want to see the latest content of every type.
 */
export async function obterUltimosConteudosPorTipo(): Promise<ConteudoInfo[]> {
  try {
    const rows = await getRows(SHEET_CONTEUDOS, 'A:E');
    const vistoPorTipo = new Map<string, ConteudoInfo>();
    const semTipo: ConteudoInfo[] = [];

    // Iterate bottom-to-top so first match per tipo = most recent
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const telefone = String(row[1] || '').trim();
      const conteudo = String(row[2] || '').trim();
      if (telefone || !conteudo) continue; // skip access-log rows and empty rows

      const tipo = String(row[4] || '').trim().toLowerCase();
      const info: ConteudoInfo = {
        titulo: conteudo,
        link: String(row[3] || '').trim() || undefined,
        tipo: tipo || undefined,
      };

      if (tipo) {
        if (!vistoPorTipo.has(tipo)) vistoPorTipo.set(tipo, info);
      } else {
        if (semTipo.length === 0) semTipo.push(info);
      }
    }

    return [...vistoPorTipo.values(), ...semTipo];
  } catch (err: any) {
    logger.warn('MilitanciaSheet', `Erro ao obter conteúdos por tipo: ${err?.message}`);
    return [];
  }
}
