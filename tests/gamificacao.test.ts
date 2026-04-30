/**
 * Testes de gamificação pura (funções sem I/O)
 * Cobre: calcularNivel, calcularPontosMissao, calcularNivelBairro, verificarConquistas
 */

import {
  calcularNivel,
  calcularPontosMissao,
  calcularNivelBairro,
  verificarConquistas,
  verificarStreakMilestones,
} from './__mocks__/militanciaSheet';
import type { MilitanteInfo } from '../src/utils/militanciaSheet';

// ─── calcularNivel ────────────────────────────────────────────────────────────

describe('calcularNivel', () => {
  test.each([
    [0,   1, 'Simpatizante (0 missões)'],
    [1,   1, 'ainda Simpatizante (1 missão)'],
    [4,   1, 'ainda Simpatizante (4 missões)'],
    [5,   2, 'Militante (5 missões)'],
    [14,  2, 'ainda Militante (14 missões)'],
    [15,  3, 'Militante Ativo (15 missões)'],
    [39,  3, 'ainda Militante Ativo (39 missões)'],
    [40,  4, 'Mobilizador (40 missões)'],
    [79,  4, 'ainda Mobilizador (79 missões)'],
    [80,  5, 'Líder de Bairro (80 missões)'],
    [149, 5, 'ainda Líder (149 missões)'],
    [150, 6, 'Coordenador (150 missões)'],
    [999, 6, 'Coordenador máximo (999 missões)'],
  ])('missões=%i → nível %i (%s)', (missoes, nivelEsperado) => {
    expect(calcularNivel(missoes)).toBe(nivelEsperado);
  });
});

// ─── calcularPontosMissao ─────────────────────────────────────────────────────

describe('calcularPontosMissao', () => {
  test.each([
    [1,  10, 'streak 1 → base 10 pts'],
    [6,  10, 'streak 6 → base 10 pts'],
    [7,  15, 'streak 7 → bônus streak: 15 pts'],
    [29, 15, 'streak 29 → ainda 15 pts'],
    [30, 20, 'streak 30 → bônus máximo: 20 pts'],
    [50, 20, 'streak 50 → mantém 20 pts'],
  ])('streak=%i → %i pts (%s)', (streak, pontosEsperados) => {
    expect(calcularPontosMissao(streak)).toBe(pontosEsperados);
  });

  test('bônus de streak é incremental (não retroativo)', () => {
    const base = calcularPontosMissao(1);
    const bonus7 = calcularPontosMissao(7);
    const bonus30 = calcularPontosMissao(30);
    expect(bonus7 - base).toBe(5);
    expect(bonus30 - base).toBe(10);
  });
});

// ─── calcularNivelBairro ──────────────────────────────────────────────────────

describe('calcularNivelBairro', () => {
  test.each([
    [0,   0, 'sem missões → nível 0'],
    [49,  0, 'abaixo de 50 → nível 0'],
    [50,  1, 'exatamente 50 → nível 1'],
    [119, 1, 'ainda nível 1'],
    [120, 2, 'nível 2'],
    [249, 2, 'ainda nível 2'],
    [250, 3, 'nível 3'],
    [399, 3, 'ainda nível 3'],
    [400, 4, 'nível máximo 4'],
  ])('missões=%i → nível do bairro %i (%s)', (missoes, nivelEsperado) => {
    expect(calcularNivelBairro(missoes)).toBe(nivelEsperado);
  });
});

// ─── verificarConquistas ──────────────────────────────────────────────────────

function militanteComMissoes(missoes: number, extras: Partial<MilitanteInfo> = {}): MilitanteInfo {
  return {
    dataInscricao: '', nome: 'Teste', celular: '5585999990001',
    bairro: 'Centro', cidade: 'Fortaleza', nivel: calcularNivel(missoes),
    pontos: missoes * 10, dataUltimaInteracao: '', missoesConcluidasTotal: missoes,
    streakAtual: 1, ultimaMissaoData: '', titulos: '',
    denunciasEnviadas: 0, conteudosCompartilhados: 0, militantesRecrutados: 0,
    ...extras,
  };
}

describe('verificarConquistas', () => {
  test('primeira missão desbloqueia título 1', () => {
    const conquistas = verificarConquistas(militanteComMissoes(1));
    expect(conquistas).toContain('1');
  });

  test('7 missões desbloqueia título 2 (Militante Ativo)', () => {
    const conquistas = verificarConquistas(militanteComMissoes(7, { titulos: '1' }));
    expect(conquistas).toContain('2');
    expect(conquistas).not.toContain('1'); // já tinha
  });

  test('30 missões desbloqueia título 3 (Persistente)', () => {
    const conquistas = verificarConquistas(militanteComMissoes(30, { titulos: '1,2' }));
    expect(conquistas).toContain('3');
  });

  test('não duplica título já conquistado', () => {
    const conquistas = verificarConquistas(militanteComMissoes(1, { titulos: '1' }));
    expect(conquistas).not.toContain('1');
  });

  test('20 conteúdos compartilhados → título 4 (Influenciador)', () => {
    const conquistas = verificarConquistas(
      militanteComMissoes(1, { conteudosCompartilhados: 20, titulos: '1' })
    );
    expect(conquistas).toContain('4');
  });

  test('3 militantes recrutados → título 5 (Mobilizador)', () => {
    const conquistas = verificarConquistas(
      militanteComMissoes(1, { militantesRecrutados: 3, titulos: '1' })
    );
    expect(conquistas).toContain('5');
  });

  test('3 denúncias enviadas → título 6 (Observador da Cidade)', () => {
    const conquistas = verificarConquistas(
      militanteComMissoes(1, { denunciasEnviadas: 3, titulos: '1' })
    );
    expect(conquistas).toContain('6');
  });

  test('militante zerado não tem conquistas', () => {
    const conquistas = verificarConquistas(militanteComMissoes(0));
    expect(conquistas).toHaveLength(0);
  });

  test('múltiplas conquistas simultâneas', () => {
    // 7 missões + 3 denúncias em primeira vez → títulos 1, 2 e 6
    const conquistas = verificarConquistas(
      militanteComMissoes(7, { denunciasEnviadas: 3 })
    );
    expect(conquistas).toContain('1');
    expect(conquistas).toContain('2');
    expect(conquistas).toContain('6');
  });
});

// ─── verificarStreakMilestones ────────────────────────────────────────────────

describe('verificarStreakMilestones', () => {
  test('streak 7 desbloqueia título 7 (Uma Semana Seguida)', () => {
    expect(verificarStreakMilestones('1,2', 7)).toContain('7');
  });

  test('streak 6 NÃO desbloqueia título 7', () => {
    expect(verificarStreakMilestones('1', 6)).toHaveLength(0);
  });

  test('streak 29 desbloqueia título 7 mas não 8', () => {
    const r = verificarStreakMilestones('1,2', 29);
    expect(r).toContain('7');
    expect(r).not.toContain('8');
  });

  test('streak 30 desbloqueia título 8 (Mês Completo)', () => {
    const r = verificarStreakMilestones('1,2,7', 30);
    expect(r).toContain('8');
    expect(r).not.toContain('7'); // já possui
  });

  test('streak 30+ sem título 7 anterior → só desbloqueia 8', () => {
    // Streak pulou de 1 para 30 (teórico) — prioriza 8 sobre 7 (lógica else-if)
    const r = verificarStreakMilestones('1', 30);
    expect(r).toContain('8');
    expect(r).not.toContain('7');
  });

  test('não duplica título já conquistado', () => {
    expect(verificarStreakMilestones('1,7', 7)).toHaveLength(0);
    expect(verificarStreakMilestones('1,7,8', 30)).toHaveLength(0);
  });
});
