import { google } from 'googleapis';
import { logger } from './logger';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1gWmeKdve801yhFST_O0grBefYW_fDLyCr8nwND_98EQ';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Base';
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';

// Colunas da planilha (LOG apenas, sem fórmulas):
// A=Data, B=Id, C=Tipo, D=Leitura_Atual, E=Leitura_Anterior, F=Consumo,
// G=Dias, H=Media_Dia, I=Semana_Ano, J=Mes, K=Ano

interface LeituraRow {
  data: Date;
  dataStr: string;
  id: string;
  tipo: string;
  leituraAtual: number;
}

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
 * Parsear data no formato brasileiro dd/mm/yyyy para Date (meia-noite local BRT)
 */
function parseDateBR(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calcular o número da semana do ano (semana começa no domingo, semana 1 = semana do 1º domingo do ano)
 */
export function getWeekOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const startDay = start.getDay(); // dia da semana do 1º de janeiro
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return Math.floor((dayOfYear + startDay) / 7) + 1;
}

/**
 * Obter o domingo que inicia a semana atual (00:00)
 */
export function domingoAtual(agora: Date): Date {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  d.setDate(d.getDate() - d.getDay()); // retroceder até o domingo
  return d;
}

/**
 * Obter o primeiro dia do mês atual (00:00)
 */
export function primeiroDiaMes(agora: Date): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

/**
 * Detectar se hoje é início de nova semana (domingo)
 */
export function detectarViradaSemana(agora: Date): boolean {
  return agora.getDay() === 0;
}

/**
 * Detectar se hoje é início de novo mês
 */
export function detectarViradaMes(agora: Date): boolean {
  return agora.getDate() === 1;
}

/**
 * Buscar a última leitura de um Id+Tipo a partir dos dados lidos da planilha
 */
export function buscarUltimaLeitura(
  dados: LeituraRow[],
  id: string,
  tipo: string
): { leituraAtual: number; data: Date; dataStr: string } | null {
  const filtrados = dados
    .filter(r => r.id === id && r.tipo.toLowerCase() === tipo.toLowerCase())
    .sort((a, b) => b.data.getTime() - a.data.getTime());
  if (!filtrados.length) return null;
  return { leituraAtual: filtrados[0].leituraAtual, data: filtrados[0].data, dataStr: filtrados[0].dataStr };
}

/**
 * Calcular dias entre duas datas (diferença real)
 */
export function calcularDias(dataAtual: Date, dataAnterior: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((dataAtual.getTime() - dataAnterior.getTime()) / msPerDay);
}

/**
 * Calcular consumo individual: leituraAtual - leituraAnterior
 */
export function calcularConsumoIndividual(leituraAtual: number, leituraAnterior: number): number {
  return leituraAtual - leituraAnterior;
}

/**
 * Calcular média por dia: consumo / dias (0 se dias === 0)
 */
export function calcularMedia(consumo: number, dias: number): number {
  if (dias === 0) return 0;
  return consumo / dias;
}

/**
 * Calcular consumo e média da semana atual
 * consumo_semana = última leitura da semana - primeira leitura da semana
 * media_semana = consumo_semana / dias_passados_na_semana
 */
export function calcularPeriodoSemana(
  dados: LeituraRow[],
  id: string,
  tipo: string,
  agora: Date
): { consumoSemana: number; mediaSemana: number } {
  const inicio = domingoAtual(agora);
  const registrosSemana = dados
    .filter(r => r.id === id && r.tipo.toLowerCase() === tipo.toLowerCase() && r.data >= inicio)
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  if (registrosSemana.length < 2) {
    return { consumoSemana: 0, mediaSemana: 0 };
  }

  const consumoSemana = calcularConsumoIndividual(
    registrosSemana[registrosSemana.length - 1].leituraAtual,
    registrosSemana[0].leituraAtual
  );

  // dias passados na semana = diferença entre hoje e o domingo
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diasSemana = calcularDias(hoje, inicio) || 1;
  const mediaSemana = calcularMedia(consumoSemana, diasSemana);

  return { consumoSemana, mediaSemana };
}

/**
 * Calcular consumo e média do mês atual
 * consumo_mes = última leitura do mês - primeira leitura do mês
 * media_mes = consumo_mes / dias_passados_no_mes
 */
export function calcularPeriodoMes(
  dados: LeituraRow[],
  id: string,
  tipo: string,
  agora: Date
): { consumoMes: number; mediaMes: number } {
  const inicio = primeiroDiaMes(agora);
  const registrosMes = dados
    .filter(r => r.id === id && r.tipo.toLowerCase() === tipo.toLowerCase() && r.data >= inicio)
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  if (registrosMes.length < 2) {
    return { consumoMes: 0, mediaMes: 0 };
  }

  const consumoMes = calcularConsumoIndividual(
    registrosMes[registrosMes.length - 1].leituraAtual,
    registrosMes[0].leituraAtual
  );

  // dias passados no mês = dia atual (1-based)
  const diasMes = agora.getDate();
  const mediaMes = calcularMedia(consumoMes, diasMes);

  return { consumoMes, mediaMes };
}

/**
 * Ler todos os registros da planilha Base, retornando apenas as colunas relevantes
 */
async function lerTodosOsDados(sheets: ReturnType<typeof google.sheets>): Promise<{ rows: LeituraRow[]; totalLinhas: number }> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:D`,
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const rawRows = res.data?.values || [];
  const rows: LeituraRow[] = [];

  // Linha 0 é cabeçalho; começa do 1
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const dataStr = String(row[0] || '').trim();
    const id = String(row[1] || '').trim();
    const tipo = String(row[2] || '').trim();
    const leituraAtual = parseFloat(String(row[3] || '0').replace(',', '.')) || 0;

    if (!dataStr || !id) continue;

    const data = parseDateBR(dataStr);
    if (!data) continue;

    rows.push({ data, dataStr, id, tipo, leituraAtual });
  }

  return { rows, totalLinhas: rawRows.length };
}

export async function obterUltimaLeitura(idImovel: string): Promise<{ leitura?: string; data?: string; consumo?: string }> {
  const auth = getAuth();
  if (!auth) {
    logger.warn('Inbox', 'Planilha: credenciais não configuradas');
    return {};
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const { rows } = await lerTodosOsDados(sheets);

    const filtrados = rows
      .filter(r => r.id === idImovel)
      .sort((a, b) => b.data.getTime() - a.data.getTime());

    if (!filtrados.length) return {};

    const ultima = filtrados[0];
    // Calcular consumo em relação à leitura imediatamente anterior (qualquer tipo)
    const anterior = filtrados[1];
    const consumo = anterior
      ? String(calcularConsumoIndividual(ultima.leituraAtual, anterior.leituraAtual))
      : '';

    return {
      data: ultima.dataStr,
      leitura: String(ultima.leituraAtual),
      consumo,
    };
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

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dataStr = params.data || agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const tipo = (params.tipo || '').toLowerCase();
  const leituraAtual = parseFloat(params.numero.replace(',', '.')) || 0;

  const sheets = google.sheets({ version: 'v4', auth });

  // Ler todos os dados da planilha uma única vez
  const { rows, totalLinhas } = await lerTodosOsDados(sheets);

  // Determinar linha alvo (próxima linha vazia após o cabeçalho)
  const targetRow = totalLinhas + 1;

  // --- Cálculos em memória ---

  // 1) Buscar última leitura anterior (mesmo Id + Tipo)
  const ultimaAnterior = buscarUltimaLeitura(rows, params.predio, tipo);

  // 2) Leitura anterior e dias
  const leituraAnterior = ultimaAnterior ? ultimaAnterior.leituraAtual : 0;
  const dataAtual = parseDateBR(dataStr) || agora;
  const dias = ultimaAnterior ? calcularDias(dataAtual, ultimaAnterior.data) : 0;

  // 3) Consumo individual
  const consumo = ultimaAnterior ? calcularConsumoIndividual(leituraAtual, leituraAnterior) : 0;

  // 4) Média por dia
  const media = calcularMedia(consumo, dias);

  // 5) Semana / Mês / Ano
  const semanaAno = getWeekOfYear(dataAtual);
  const mes = dataAtual.getMonth() + 1;
  const ano = dataAtual.getFullYear();

  // 6) Consumo e média da semana (inclui a leitura atual simulada)
  const rowsComAtual: LeituraRow[] = [
    ...rows,
    { data: dataAtual, dataStr, id: params.predio, tipo, leituraAtual },
  ];
  const { consumoSemana, mediaSemana } = calcularPeriodoSemana(rowsComAtual, params.predio, tipo, agora);
  const { consumoMes, mediaMes } = calcularPeriodoMes(rowsComAtual, params.predio, tipo, agora);

  // --- Formatar valores para escrita ---
  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');

  logger.info('Inbox', `Planilha: gravando linha ${targetRow} [${params.predio} / ${tipo}] leitura=${leituraAtual} consumo=${consumo} dias=${dias}`);

  // Gravar todos os 11 campos calculados de uma só vez
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_NAME}!A${targetRow}`, values: [[dataStr]] },
        { range: `${SHEET_NAME}!B${targetRow}`, values: [[params.predio]] },
        { range: `${SHEET_NAME}!C${targetRow}`, values: [[tipo]] },
        { range: `${SHEET_NAME}!D${targetRow}`, values: [[leituraAtual]] },
        { range: `${SHEET_NAME}!E${targetRow}`, values: [[leituraAnterior]] },
        { range: `${SHEET_NAME}!F${targetRow}`, values: [[consumo]] },
        { range: `${SHEET_NAME}!G${targetRow}`, values: [[dias]] },
        { range: `${SHEET_NAME}!H${targetRow}`, values: [[fmt(media)]] },
        { range: `${SHEET_NAME}!I${targetRow}`, values: [[semanaAno]] },
        { range: `${SHEET_NAME}!J${targetRow}`, values: [[mes]] },
        { range: `${SHEET_NAME}!K${targetRow}`, values: [[ano]] },
      ],
    },
  });

  return {
    ok: true,
    consumo: fmt(consumo),
    anterior: leituraAnterior > 0 || ultimaAnterior ? String(leituraAnterior) : '',
    data: dataStr,
    dias,
    media: fmt(media),
    consumoSemana: fmt(consumoSemana),
    mediaSemana: fmt(mediaSemana),
    consumoMes: fmt(consumoMes),
    mediaMes: fmt(mediaMes),
    row: targetRow,
  };
}
