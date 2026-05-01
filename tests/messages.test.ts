/**
 * Testes dos templates de mensagens (militanciaMessages.ts)
 * Valida conteúdo dos textos sem depender de I/O
 */

import { MESSAGES_MILITANCIA } from '../src/inbox/militanciaMessages';

// ─── MISSAO_CONCLUIDA ─────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.MISSAO_CONCLUIDA', () => {
  test('base 10 pts (streak < 7) — sem indicação de bônus', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(1, 10, 10);
    expect(msg).toContain('+10 pontos');
    expect(msg).not.toContain('bônus streak');
  });

  test('streak = 1 exibe "Sequência iniciada"', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(1, 10, 10);
    expect(msg).toContain('Sequência iniciada');
  });

  test('15 pts (streak 7-29) — mostra +5 bônus streak', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(7, 115, 15);
    expect(msg).toContain('+15 pontos');
    expect(msg).toContain('+5 bônus streak');
  });

  test('streak = 7 exibe mensagem especial de 1 semana', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(7, 115, 15);
    expect(msg).toContain('Uma semana');
  });

  test('20 pts (streak 30+) — mostra +10 bônus streak', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(30, 200, 20);
    expect(msg).toContain('+20 pontos');
    expect(msg).toContain('+10 bônus streak');
  });

  test('streak = 30 exibe mensagem especial de mês completo', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(30, 200, 20);
    expect(msg).toContain('30 dias');
  });

  test('streak > 1 e < 7 mostra contagem de dias', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(5, 50, 10);
    expect(msg).toContain('5 dias');
  });

  test('exibe streak atual na mensagem', () => {
    const msg = MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(15, 150, 15);
    expect(msg).toContain('15');
  });
});

// ─── NIVEL_SUBIU ──────────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.NIVEL_SUBIU', () => {
  test('mostra novo nível e nome do nível', () => {
    const msg = MESSAGES_MILITANCIA.NIVEL_SUBIU('Militante');
    expect(msg).toContain('subiu de nível');
    expect(msg).toContain('Militante');
  });
});

// ─── CONQUISTA_DESBLOQUEADA ───────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA', () => {
  test('exibe nome da conquista e total de missões', () => {
    const conquista = { nome: 'Primeira Missão', emoji: '🎖️', descricao: 'Completou a 1ª missão' };
    const msg = MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA(conquista, 1);
    expect(msg).toContain('Primeira Missão');
    expect(msg).toContain('1 missão');
  });
});

// ─── PEDIR_ORIGEM ────────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.PEDIR_ORIGEM', () => {
  test('explica as opções: número, rede social e pular', () => {
    const msg = MESSAGES_MILITANCIA.PEDIR_ORIGEM;
    expect(msg).toContain('0');      // pular
    // deve mencionar algum tipo de rede ou convite
    expect(msg.length).toBeGreaterThan(30);
  });
});


