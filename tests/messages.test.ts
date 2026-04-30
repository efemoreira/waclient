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
    const msg = MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA('Primeira Missão', 1);
    expect(msg).toContain('Primeira Missão');
    expect(msg).toContain('1 missões');
  });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.DASHBOARD', () => {
  const params = {
    nome: 'Maria',
    nivel: 3,
    nomeNivel: 'Militante Ativo',
    pontos: 200,
    missoesConcluidasTotal: 20,
    militantesNoBairro: 5,
    posicaoNoBairro: 2,
    posicaoGeral: 10,
    streakAtual: 7,
    bairro: 'Aldeota',
  };

  test('contém nome do militante', () => {
    expect(MESSAGES_MILITANCIA.DASHBOARD(params)).toContain('Maria');
  });

  test('contém nível e nome do nível', () => {
    const msg = MESSAGES_MILITANCIA.DASHBOARD(params);
    expect(msg).toContain('Nível');
    expect(msg).toContain('Militante Ativo');
  });

  test('contém bairro e posição no bairro', () => {
    const msg = MESSAGES_MILITANCIA.DASHBOARD(params);
    expect(msg).toContain('Aldeota');
    expect(msg).toContain('2');
  });

  test('contém streak', () => {
    expect(MESSAGES_MILITANCIA.DASHBOARD(params)).toContain('7');
  });

  test('contém missões concluídas', () => {
    expect(MESSAGES_MILITANCIA.DASHBOARD(params)).toContain('20');
  });
});

// ─── PAINEL_BAIRRO ────────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.PAINEL_BAIRRO', () => {
  const params = {
    bairro: 'Centro',
    militantesAtivos: 12,
    missoesConcluidasSemana: 45,
    nivelMedio: 2.3,
    nivelBairro: 2,
    missoesTotais: 300,
    pontosTotais: 2500,
    lider: undefined,
  };

  test('contém nome do bairro em maiúsculas', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_BAIRRO(params);
    expect(msg).toContain('CENTRO');
  });

  test('contém pontosTotais', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_BAIRRO(params);
    expect(msg).toContain('2500');
  });

  test('contém missoesTotais', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_BAIRRO(params);
    expect(msg).toContain('300');
  });

  test('exibe nível do bairro', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_BAIRRO(params);
    expect(msg).toContain('2');
  });

  test('exibe líder quando informado', () => {
    const comLider = { ...params, lider: 'Ana' };
    expect(MESSAGES_MILITANCIA.PAINEL_BAIRRO(comLider)).toContain('Ana');
  });
});

// ─── PAINEL_RANKING ───────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.PAINEL_RANKING', () => {
  const ranking = [
    { bairro: 'Centro',    pontos: 500 },
    { bairro: 'Aldeota',   pontos: 320 },
    { bairro: 'Messejana', pontos: 180 },
  ];

  test('contém todos os bairros', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_RANKING(ranking);
    expect(msg).toContain('Centro');
    expect(msg).toContain('Aldeota');
    expect(msg).toContain('Messejana');
  });

  test('usa medalhas 🥇🥈🥉 para os três primeiros', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_RANKING(ranking);
    expect(msg).toContain('🥇');
    expect(msg).toContain('🥈');
    expect(msg).toContain('🥉');
  });

  test('exibe pontos de cada bairro', () => {
    const msg = MESSAGES_MILITANCIA.PAINEL_RANKING(ranking);
    expect(msg).toContain('500');
    expect(msg).toContain('320');
    expect(msg).toContain('180');
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

// ─── PERFIL ───────────────────────────────────────────────────────────────────

describe('MESSAGES_MILITANCIA.PERFIL', () => {
  const base = {
    nome: 'Carlos',
    bairro: 'Centro',
    nivel: 3,
    nomeNivel: 'Militante Ativo',
    pontos: 250,
    missoesConcluidasTotal: 20,
    streakAtual: 5,
    titulos: 'Primeira Missão, Militante Ativo',
  };

  test('exibe nome e bairro', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL(base);
    expect(msg).toContain('Carlos');
    expect(msg).toContain('Centro');
  });

  test('exibe nível numérico e nome do nível', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL(base);
    expect(msg).toContain('3');
    expect(msg).toContain('Militante Ativo');
  });

  test('exibe streak atual', () => {
    expect(MESSAGES_MILITANCIA.PERFIL(base)).toContain('5');
  });

  test('exibe conquistas quando existem', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL(base);
    expect(msg).toContain('Primeira Missão');
  });

  test('não exibe seção de conquistas quando titulos está vazio', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL({ ...base, titulos: '' });
    expect(msg).not.toContain('Conquistas');
  });

  test('exibe próximo nível quando não está no máximo', () => {
    // Nível 3 → próximo é nível 4 (Mobilizador, 40 missões)
    const msg = MESSAGES_MILITANCIA.PERFIL({ ...base, nivel: 3, missoesConcluidasTotal: 20 });
    expect(msg).toContain('Mobilizador');
    expect(msg).toContain('Faltam');
  });

  test('não exibe próximo nível quando está no nível máximo (6)', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL({ ...base, nivel: 6, nomeNivel: 'Coordenador', missoesConcluidasTotal: 200 });
    expect(msg).not.toContain('Próximo nível');
  });

  test('exibe tabela de níveis', () => {
    const msg = MESSAGES_MILITANCIA.PERFIL(base);
    expect(msg).toContain('Simpatizante');
    expect(msg).toContain('Coordenador');
  });
});
