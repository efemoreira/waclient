/**
 * Mock completo de militanciaSheet.ts
 * Todos os dados vivem em memória. Os testes manipulam `mockDB` diretamente.
 */

import type { MilitanteInfo, MissaoResultado } from '../../src/utils/militanciaSheet';

// Re-exporta os tipos reais
export type { MilitanteInfo, MissaoResultado };

// ─── Helpers de data (espelham a lógica real) ─────────────────────────────────

export function dataAtual(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function dataOntem(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function dataAnteontem(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function isOntem(dataStr: string): boolean {
  if (!dataStr) return false;
  const partes = dataStr.trim().split('/');
  if (partes.length !== 3) return false;
  const stored = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  const agora = new Date();
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  return (
    stored.getFullYear() === ontem.getFullYear() &&
    stored.getMonth()    === ontem.getMonth()    &&
    stored.getDate()     === ontem.getDate()
  );
}

// ─── Estado em memória ───────────────────────────────────────────────────────

export type MockMilitante = MilitanteInfo & {
  /** Se true, `buscarMilitante` retorna null (simula "não encontrado") */
  _notFound?: boolean;
};

type ConteudoInfo = { titulo: string; link?: string; tipo?: string };
type EventoInfo = { nome: string; texto?: string; data?: string; hora?: string; local?: string };

let _militantes: Map<string, MockMilitante> = new Map();
let _missaoDia: string = 'Compartilhe uma publicação do candidato';
let _ultimaOrigem: { celular: string; origem: string } | null = null;
let _conteudos: ConteudoInfo[] = [];
let _eventos: EventoInfo[] = [{ nome: 'Ato na Praça', texto: 'Venha participar!', data: '10/05/2026', hora: '10h', local: 'Praça Central' }];

/**
 * Banco de dados in-memory acessível pelos testes.
 */
export const mockDB = {
  /** Insere ou substitui um militante (use para preparar cenários) */
  setMilitante(m: Partial<MilitanteInfo> & { celular: string }): void {
    const existente = _militantes.get(m.celular) ?? mockMilitanteBase(m.celular);
    _militantes.set(m.celular, { ...existente, ...m });
  },

  getMilitante(celular: string): MockMilitante | undefined {
    return _militantes.get(celular);
  },

  setMissaoDia(missao: string): void {
    _missaoDia = missao;
  },

  setConteudos(conteudos: ConteudoInfo[]): void {
    _conteudos = conteudos;
  },

  setEventos(eventos: EventoInfo[]): void {
    _eventos = eventos;
  },

  getUltimaOrigem(): { celular: string; origem: string } | null {
    return _ultimaOrigem;
  },

  /** Limpa todo o estado (chame em beforeEach) */
  reset(): void {
    _militantes = new Map();
    _missaoDia = 'Compartilhe uma publicação do candidato';
    _ultimaOrigem = null;
    _conteudos = [];
    _eventos = [{ nome: 'Ato na Praça', texto: 'Venha participar!', data: '10/05/2026', hora: '10h', local: 'Praça Central' }];
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockMilitanteBase(celular: string): MockMilitante {
  return {
    dataInscricao: '01/01/2026',
    nome: '',
    celular,
    bairro: '',
    cidade: '',
    nivel: 1,
    pontos: 0,
    dataUltimaInteracao: '',
    missoesConcluidasTotal: 0,
    streakAtual: 0,
    ultimaMissaoData: '',
    titulos: '',
    denunciasEnviadas: 0,
    conteudosCompartilhados: 0,
    militantesRecrutados: 0,
  };
}

// ─── Funções exportadas (espelham militanciaSheet.ts real) ───────────────────

export async function buscarMilitante(celular: string): Promise<MilitanteInfo | null> {
  const m = _militantes.get(celular);
  if (!m || m._notFound) return null;
  return { ...m };
}

export function isCadastroCompleto(m: MilitanteInfo): boolean {
  return !!(m.nome?.trim() && m.bairro?.trim() && m.cidade?.trim());
}

export async function registrarContato(celular: string): Promise<boolean> {
  if (!_militantes.has(celular)) {
    _militantes.set(celular, mockMilitanteBase(celular));
  }
  return true;
}

export async function contarMilitantes(): Promise<number> {
  let count = 0;
  _militantes.forEach((m) => { if (m.nome?.trim()) count++; });
  return Math.max(count, 1);
}

export async function atualizarCamposMilitante(
  celular: string,
  campos: Partial<{ nome: string; bairro: string; cidade: string }>
): Promise<boolean> {
  const m = _militantes.get(celular);
  if (!m) return false;
  _militantes.set(celular, { ...m, ...campos });
  return true;
}

export async function atualizarDataCadastro(_celular: string): Promise<void> {}

export async function atualizarUltimaInteracao(_celular: string): Promise<void> {}

export async function atualizarPontosENivel(celular: string, pts: number): Promise<void> {
  const m = _militantes.get(celular);
  if (m) _militantes.set(celular, { ...m, pontos: m.pontos + pts });
}

export async function registrarOrigem(celular: string, origem: string): Promise<void> {
  _ultimaOrigem = { celular, origem };
  const digits = origem.replace(/\D/g, '');
  const isPhone = digits.length >= 10 && digits.length <= 13;
  if (isPhone) {
    const recruiter = `55${digits}`.slice(-13);
    const m = _militantes.get(recruiter) ?? _militantes.get(digits);
    if (m) {
      _militantes.set(m.celular, {
        ...m,
        militantesRecrutados: m.militantesRecrutados + 1,
        pontos: m.pontos + 15,
      });
    }
  }
}

export async function registrarRespostaMissao(
  celular: string,
  _missaoDia: string
): Promise<MissaoResultado> {
  const m = _militantes.get(celular);
  if (!m) {
    return {
      levelUp: false, nivelAnterior: 1, novoNivel: 1, novasConquistas: [],
      streakAtual: 1, missoesConcluidasTotal: 1, pontos: 10, pontosGanhos: 10,
    };
  }

  // Streak: incrementa somente se ultimaMissaoData foi ontem (espelha lógica real)
  const novoStreak = isOntem(m.ultimaMissaoData) ? m.streakAtual + 1 : 1;
  const novasMissoes = m.missoesConcluidasTotal + 1;
  const pontosGanhos = calcularPontosMissao(novoStreak);
  const novosPontos = m.pontos + pontosGanhos;
  const novoNivel = calcularNivel(novasMissoes);
  const levelUp = novoNivel > m.nivel;

  // Conquistas por missões/stats
  const conquistasMissao = verificarConquistas({
    ...m,
    missoesConcluidasTotal: novasMissoes,
    pontos: novosPontos,
    nivel: novoNivel,
    streakAtual: novoStreak,
  });
  // Conquistas por streak (IDs 7 e 8) — chamadas separadamente como no código real
  const conquistasStreak = verificarStreakMilestones(m.titulos, novoStreak);
  const novasConquistas = [...conquistasMissao, ...conquistasStreak];

  const novosTitulos = [
    ...m.titulos.split(',').filter(Boolean),
    ...novasConquistas,
  ].join(',');

  _militantes.set(celular, {
    ...m,
    missoesConcluidasTotal: novasMissoes,
    streakAtual: novoStreak,
    ultimaMissaoData: dataAtual(),
    pontos: novosPontos,
    nivel: novoNivel,
    titulos: novosTitulos,
  });

  return {
    levelUp, nivelAnterior: m.nivel, novoNivel, novasConquistas,
    streakAtual: novoStreak, missoesConcluidasTotal: novasMissoes,
    pontos: novosPontos, pontosGanhos,
  };
}

export async function registrarAcessoConteudo(celular: string, _c: string, _t: string): Promise<void> {
  await atualizarPontosENivel(celular, 3);
}

export async function registrarConfirmacaoEvento(
  celular: string, _nome: string, confirmado = false
): Promise<void> {
  if (confirmado) await atualizarPontosENivel(celular, 5);
}

export async function registrarInteresseLideranca(
  _nome: string, _cel: string, _bairro: string, _area: string, _disp: string
): Promise<void> {}

export async function registrarDenuncia(
  celular: string, _bairro: string, _desc: string
): Promise<string> {
  await atualizarPontosENivel(celular, 8);
  return `D260430-0001`;
}

export async function obterDashboardPessoal(
  celular: string,
  _bairro: string
): Promise<{ missoesConcluidasTotal: number; militantesNoBairro: number; posicaoNoBairro: number; posicaoGeral: number }> {
  const m = _militantes.get(celular);
  return {
    missoesConcluidasTotal: m?.missoesConcluidasTotal ?? 0,
    militantesNoBairro: 3,
    posicaoNoBairro: 1,
    posicaoGeral: 1,
  };
}

export async function obterPainelBairro(bairro: string) {
  return {
    bairro,
    militantesAtivos: 3,
    missoesConcluidasSemana: 5,
    nivelMedio: 2,
    nivelBairro: 1,
    missoesTotais: 60,
    pontosTotais: 350,
    lider: undefined,
  };
}

export async function obterRankingBairros() {
  return [
    { bairro: 'Centro',    pontos: 500 },
    { bairro: 'Aldeota',   pontos: 320 },
    { bairro: 'Messejana', pontos: 180 },
  ];
}

export async function obterMissaoDia(): Promise<string | null> {
  return _missaoDia || null;
}

export async function obterUltimoConteudo(): Promise<null> { return null; }
export async function obterProximoEvento()  { return null; }
export async function obterProximosEventos(_n?: number): Promise<EventoInfo[]> {
  return [..._eventos];
}
export async function obterUltimosConteudosPorTipo() { return _conteudos; }
export async function obterTitulosSheet() { return {}; }

export function resolverNomeTitulo(id: string): string {
  const nomes: Record<string, string> = {
    '1': 'Recruta', '2': 'Ativista', '3': 'Combatente',
    '4': 'Porta-Voz', '5': 'Articulador', '6': 'Fiscal das Ruas',
    '7': 'Semana em Campo', '8': 'Mês em Campo',
    '9': 'Ativista Prata', '10': 'Ativista Ouro',
    '11': 'Combatente Prata', '12': 'Combatente Ouro', '13': 'Veterano da Causa',
    '14': 'Semana em Campo Prata', '15': 'Mês em Campo Ouro', '16': 'Incansável',
    '17': 'Porta-Voz Prata', '18': 'Porta-Voz Ouro',
    '19': 'Articulador Prata', '20': 'Articulador Ouro',
    '21': 'Fiscal Prata', '22': 'Fiscal Ouro',
    '23': 'Força do Movimento', '24': 'Pilar da Causa',
  };
  return nomes[id] ?? `Título #${id}`;
}

export function calcularNivel(missoes: number): number {
  if (missoes >= 150) return 6;
  if (missoes >= 80)  return 5;
  if (missoes >= 40)  return 4;
  if (missoes >= 15)  return 3;
  if (missoes >= 5)   return 2;
  return 1;
}

export function nomeDoNivel(nivel: number): string {
  const nomes: Record<number, string> = {
    1: 'Simpatizante', 2: 'Militante', 3: 'Militante Ativo',
    4: 'Mobilizador', 5: 'Líder de Bairro', 6: 'Coordenador',
  };
  return nomes[nivel] ?? 'Simpatizante';
}

export function calcularNivelBairro(missoes: number): number {
  if (missoes >= 400) return 4;
  if (missoes >= 250) return 3;
  if (missoes >= 120) return 2;
  if (missoes >= 50)  return 1;
  return 0;
}

export function calcularPontosMissao(streak: number): number {
  if (streak >= 30) return 20;
  if (streak >= 7)  return 15;
  return 10;
}

export function verificarConquistas(m: MilitanteInfo): string[] {
  const ativos = new Set(m.titulos.split(',').map((s) => s.trim()).filter(Boolean));
  const novas: string[] = [];

  const mis = m.missoesConcluidasTotal;
  if (mis >= 1   && !ativos.has('1'))  novas.push('1');
  if (mis >= 7   && !ativos.has('2'))  novas.push('2');
  if (mis >= 20  && !ativos.has('9'))  novas.push('9');
  if (mis >= 30  && !ativos.has('3'))  novas.push('3');
  if (mis >= 50  && !ativos.has('10')) novas.push('10');
  if (mis >= 80  && !ativos.has('11')) novas.push('11');
  if (mis >= 120 && !ativos.has('12')) novas.push('12');
  if (mis >= 180 && !ativos.has('13')) novas.push('13');

  const c = m.conteudosCompartilhados || 0;
  if (c >= 20 && !ativos.has('4'))  novas.push('4');
  if (c >= 40 && !ativos.has('17')) novas.push('17');
  if (c >= 60 && !ativos.has('18')) novas.push('18');

  const r = m.militantesRecrutados || 0;
  if (r >= 3  && !ativos.has('5'))  novas.push('5');
  if (r >= 7  && !ativos.has('19')) novas.push('19');
  if (r >= 15 && !ativos.has('20')) novas.push('20');

  const d = m.denunciasEnviadas || 0;
  if (d >= 3  && !ativos.has('6'))  novas.push('6');
  if (d >= 7  && !ativos.has('21')) novas.push('21');
  if (d >= 15 && !ativos.has('22')) novas.push('22');

  const p = m.pontos || 0;
  if (p >= 500  && !ativos.has('23')) novas.push('23');
  if (p >= 1000 && !ativos.has('24')) novas.push('24');

  return novas;
}

/**
 * Verifica conquistas por streak (IDs 7, 14, 8, 15, 16).
 * Chamada separadamente de verificarConquistas, como no código real.
 */
export function verificarStreakMilestones(titulosAtuais: string, novoStreak: number): string[] {
  const ativos = new Set(titulosAtuais.split(',').map((s) => s.trim()).filter(Boolean));
  const novas: string[] = [];
  const milestones: Array<{ streak: number; id: string }> = [
    { streak: 7,  id: '7'  },
    { streak: 14, id: '14' },
    { streak: 30, id: '8'  },
    { streak: 60, id: '15' },
    { streak: 90, id: '16' },
  ];
  for (const { streak, id } of milestones) {
    if (novoStreak >= streak && !ativos.has(id)) novas.push(id);
  }
  return novas;
}
