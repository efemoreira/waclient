/**
 * Testes dos flows completos do MilitanciaManager
 *
 * Cada teste simula uma sequência de mensagens e verifica:
 * - O texto enviado de volta ao usuário
 * - O stage final da conversa
 * - Mutações no "banco" in-memory (via mockDB)
 */

import { MilitanciaManager } from '../src/inbox/MilitanciaManager';
import { WhatsApp } from './__mocks__/whatsapp';
import { mockDB, dataOntem, dataAnteontem } from './__mocks__/militanciaSheet';
import { config } from '../src/config';
import type { Conversation } from '../src/inbox/ConversationManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CEL = '5585999990001';
const CEL_RECRUTADOR = '5585999990099';

function novaConversa(): Conversation {
  return {
    id: CEL,
    phoneNumber: CEL,
    unreadCount: 0,
    isHuman: false,
    messages: [],
    militanciaStage: undefined,
    militanciaData: {},
  };
}

function buildManager() {
  const client = new WhatsApp();
  const manager = new MilitanciaManager(client as any);
  return { client, manager };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDB.reset();
  jest.clearAllMocks();
});

// ─── FLOW 1: Primeiro contato ─────────────────────────────────────────────────

describe('Flow 1 – Primeiro contato', () => {
  test('usuário novo recebe mensagem de boas-vindas', async () => {
    const { client, manager } = buildManager();
    const conversa = novaConversa();

    await manager.processar(CEL, 'Oi', conversa);

    expect(client.lastMessage()).toContain('Felipe Moreira');
    expect(conversa.militanciaStage).toBeUndefined();
  });
});

// ─── FLOW cadastro completo ───────────────────────────────────────────────────

describe('Flow 1/2 – Cadastro completo com origem', () => {
  test('sequência nome → bairro → cidade → origem (rede social) → menu', async () => {
    const { client, manager } = buildManager();
    const conversa = novaConversa();

    // 1. Primeiro contato
    await manager.processar(CEL, 'Oi', conversa);
    expect(client.lastMessage()).toContain('Felipe Moreira');

    // 2. Escolhe opção 1 (cadastrar)
    client.reset();
    await manager.processar(CEL, '1', conversa);
    expect(client.lastMessage()).toContain('nome completo');

    // 3. Envia nome
    client.reset();
    await manager.processar(CEL, 'Maria Silva', conversa);
    expect(mockDB.getMilitante(CEL)?.nome).toBe('Maria Silva');
    expect(client.lastMessage()).toContain('bairro');

    // 4. Envia bairro
    client.reset();
    await manager.processar(CEL, 'Aldeota', conversa);
    expect(mockDB.getMilitante(CEL)?.bairro).toBe('Aldeota');
    expect(client.lastMessage()).toContain('cidade');

    // 5. Envia cidade
    client.reset();
    await manager.processar(CEL, 'Fortaleza', conversa);
    expect(mockDB.getMilitante(CEL)?.cidade).toBe('Fortaleza');
    expect(client.lastMessage()).toContain('Última pergunta');
    expect(conversa.militanciaStage).toBe('cadastro_origem');

    // 6. Informa rede social
    client.reset();
    await manager.processar(CEL, 'Instagram', conversa);
    expect(mockDB.getUltimaOrigem()).toMatchObject({ celular: CEL, origem: 'Instagram' });
    expect(client.lastMessage()).toContain('Bem-vindo');
    expect(conversa.militanciaStage).toBeUndefined();
  });

  test('origem com número de telefone credita +15 pts ao recrutador', async () => {
    const { manager } = buildManager();

    // Prepara recrutador no banco
    mockDB.setMilitante({ celular: CEL_RECRUTADOR, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza', pontos: 50 });

    // Prepara novo militante em estágio de origem
    mockDB.setMilitante({ celular: CEL, nome: 'Maria', bairro: 'Aldeota', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'cadastro_origem', militanciaData: {},
    };

    // Normaliza: DD + número sem o 55 (bot adiciona)
    await manager.processar(CEL, '85 99999-0099', conversa);

    expect(conversa.militanciaStage).toBeUndefined();
    // Recrutador deveria ter +15 pts
    const recrutador = mockDB.getMilitante(CEL_RECRUTADOR);
    expect(recrutador?.pontos).toBe(65);
    expect(recrutador?.militantesRecrutados).toBe(1);
  });

  test('origem "0" pula sem registrar', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Maria', bairro: 'Aldeota', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'cadastro_origem', militanciaData: {},
    };

    await manager.processar(CEL, '0', conversa);

    expect(mockDB.getUltimaOrigem()).toBeNull();
    expect(client.lastMessage()).toContain('Bem-vindo');
  });
});

// ─── FLOW 3: Missão do dia ────────────────────────────────────────────────────

describe('Flow 3 – Missão do dia', () => {
  function militanteCadastrado() {
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 0, streakAtual: 0, pontos: 0, titulos: '',
    });
  }

  test('comando "1" envia missão e seta stage missao_resposta', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa = novaConversa();

    await manager.processar(CEL, '1', conversa);

    expect(client.lastMessage()).toContain('MISSÃO DE HOJE');
    expect(conversa.militanciaStage).toBe('missao_resposta');
  });

  test('resposta "ja fiz" registra missão e exibe pontos ganhos', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    expect(conversa.militanciaStage).toBeUndefined();
    const mensagens = client.messagesTo(CEL);
    expect(mensagens[0]).toContain('Missão feita');
    expect(mensagens[0]).toMatch(/\+\d+ pontos/);
  });

  test('resposta "ainda nao" registra como pendente', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'ainda não', conversa);

    expect(client.lastMessage()).toContain('pendente');
    expect(conversa.militanciaStage).toBeUndefined();
  });

  test('5ª missão sobe para nível 2 e exibe notificação', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 4, streakAtual: 4, pontos: 40, nivel: 1, titulos: '1',
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    const mensagens = client.messagesTo(CEL);
    const temLevelUp = mensagens.some((m: string) => m.includes('subiu de nível') || m.includes('Militante'));
    expect(temLevelUp).toBe(true);
  });

  test('1ª missão desbloqueia conquista "Recruta"', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 0, streakAtual: 0, pontos: 0, titulos: '',
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    const mensagens = client.messagesTo(CEL);
    const temConquista = mensagens.some((m: string) => m.includes('Recruta'));
    expect(temConquista).toBe(true);
  });

  test('streak ≥ 7 mostra bônus de streak na mensagem', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 10, streakAtual: 6, pontos: 100, nivel: 2, titulos: '1,2',
      ultimaMissaoData: dataOntem(), // ontem → streak vai para 7
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    // streak vai para 7 → 15 pts → bônus de +5
    expect(client.messagesTo(CEL)[0]).toContain('+5 bônus streak');
  });
});

// ─── FLOW 4: Eventos ──────────────────────────────────────────────────────────

describe('Flow 4 – Confirmação de evento', () => {
  function militanteCadastrado() {
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Meireles', cidade: 'Fortaleza', pontos: 0 });
  }

  test('"2" lista eventos e seta stage evento_confirmacao', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa = novaConversa();

    await manager.processar(CEL, '2', conversa);

    expect(client.lastMessage()).toContain('Próximos Eventos');
    expect(conversa.militanciaStage).toBe('evento_confirmacao');
  });

  test('"sim" confirma evento, concede +5 pts e limpa stage', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'evento_confirmacao',
      militanciaData: { evento: 'Ato na Praça' },
    };

    await manager.processar(CEL, 'sim', conversa);

    expect(client.lastMessage()).toContain('confirmada');
    expect(conversa.militanciaStage).toBeUndefined();
    expect(mockDB.getMilitante(CEL)?.pontos).toBe(5);
  });

  test('"talvez" não concede pontos', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'evento_confirmacao',
      militanciaData: { evento: 'Ato na Praça' },
    };

    await manager.processar(CEL, 'talvez', conversa);

    expect(client.lastMessage()).toContain('talvez');
    expect(mockDB.getMilitante(CEL)?.pontos).toBe(0);
  });
});

// ─── FLOW 6: Denúncia ────────────────────────────────────────────────────────

describe('Flow 6 – Denúncia', () => {
  function militanteCadastrado() {
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Aldeota', cidade: 'Fortaleza', pontos: 0 });
  }

  test('fluxo completo: bairro → descrição → protocolo + +8 pts', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    const conversa = novaConversa();

    // Inicia denúncia
    await manager.processar(CEL, '4', conversa);
    expect(client.lastMessage()).toContain('Enviar Denúncia');
    expect(conversa.militanciaStage).toBe('denuncia_bairro');

    // Informa bairro
    client.reset();
    await manager.processar(CEL, 'Aldeota', conversa);
    expect(client.lastMessage()).toContain('Descreva');
    expect(conversa.militanciaStage).toBe('denuncia_descricao');

    // Informa descrição
    client.reset();
    await manager.processar(CEL, 'Buraco enorme na Av. Santos Dumont', conversa);
    expect(client.lastMessage()).toContain('Protocolo');
    expect(client.lastMessage()).toMatch(/#D\w+/);
    expect(conversa.militanciaStage).toBeUndefined();
    expect(mockDB.getMilitante(CEL)?.pontos).toBe(8);
  });
});

// ─── FLOW 7: Liderança ───────────────────────────────────────────────────────

describe('Flow 7 – Liderança', () => {
  test('opção 5 → exibe opções → resposta registra interesse', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Carlos', bairro: 'Centro', cidade: 'Fortaleza' });
    const conversa = novaConversa();

    await manager.processar(CEL, '5', conversa);
    expect(client.lastMessage()).toContain('doação');
    expect(conversa.militanciaStage).toBe('lideranca_area');

    client.reset();
    await manager.processar(CEL, '2', conversa);
    expect(client.lastMessage()).toContain('Registrado');
    expect(conversa.militanciaStage).toBeUndefined();
  });
});

// ─── FLOW 8: Dashboard pessoal ───────────────────────────────────────────────

describe('Flow 8 – Dashboard pessoal', () => {
  test('"6" exibe dashboard com pontos e posição', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'Ana', bairro: 'Meireles', cidade: 'Fortaleza',
      nivel: 2, pontos: 80, missoesConcluidasTotal: 8, streakAtual: 3,
    });

    await manager.processar(CEL, '6', novaConversa());

    const msg = client.lastMessage() ?? '';
    expect(msg).toContain('Seu progresso');
    expect(msg).toContain('Meireles');
  });
});

// ─── FLOW 8b: Painel do bairro ───────────────────────────────────────────────

describe('Flow 8b – Painel do bairro', () => {
  test('"7" solicita bairro, resposta exibe painel + ranking', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Meireles', cidade: 'Fortaleza' });
    const conversa = novaConversa();

    await manager.processar(CEL, '7', conversa);
    expect(client.lastMessage()).toContain('Qual bairro');
    expect(conversa.militanciaStage).toBe('painel_bairro');

    client.reset();
    await manager.processar(CEL, 'Centro', conversa);
    const msg = client.lastMessage() ?? '';
    expect(msg).toContain('CENTRO');
    expect(msg).toContain('pts');
    expect(conversa.militanciaStage).toBeUndefined();
  });
});

// ─── Comandos globais ────────────────────────────────────────────────────────

describe('Comandos globais', () => {
  function militanteCadastrado() {
    mockDB.setMilitante({ celular: CEL, nome: 'Lúcia', bairro: 'Aldeota', cidade: 'Fortaleza' });
  }

  test('"menu" exibe menu personalizado', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    await manager.processar(CEL, 'menu', novaConversa());
    expect(client.lastMessage()).toContain('Lúcia');
    expect(client.lastMessage()).toContain('Missão do dia');
  });

  test('"perfil" exibe nivel e missões', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'Lúcia', bairro: 'Aldeota', cidade: 'Fortaleza',
      nivel: 3, missoesConcluidasTotal: 20, streakAtual: 5, pontos: 200,
    });
    await manager.processar(CEL, 'perfil', novaConversa());
    const msg = client.lastMessage() ?? '';
    expect(msg).toContain('Perfil');
    expect(msg).toContain('Militante Ativo');
  });

  test('mensagem desconhecida exibe menu', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    await manager.processar(CEL, 'batatinha frita 1 2 3', novaConversa());
    expect(client.lastMessage()).toContain('Missão do dia');
  });
});

// ─── Streak reset ────────────────────────────────────────────────────────────

describe('Streak – reset por data', () => {
  test('ultima missão foi ontem → streak incrementa', async () => {
    const { manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 6, streakAtual: 6, pontos: 60,
      titulos: '1', ultimaMissaoData: dataOntem(), nivel: 2,
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    expect(mockDB.getMilitante(CEL)?.streakAtual).toBe(7);
  });

  test('ultima missão foi há 2 dias → streak reinicia para 1', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 10, streakAtual: 10, pontos: 120,
      titulos: '1,2', ultimaMissaoData: dataAnteontem(), nivel: 2,
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    expect(mockDB.getMilitante(CEL)?.streakAtual).toBe(1);
    // Bônus de streak NÃO deve aparecer (streak reiniciou para 1 → 10 pts base)
    expect(client.messagesTo(CEL)[0]).not.toContain('bônus streak');
  });

  test('streak 7 consecutivos desbloqueia conquista "Semana em Campo"', async () => {
    const { client, manager } = buildManager();
    // Streak 6 com ultima missão ontem → ao fazer hoje vai para 7
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 10, streakAtual: 6, pontos: 100,
      titulos: '1,2', ultimaMissaoData: dataOntem(), nivel: 2,
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    const mensagens = client.messagesTo(CEL);
    const temConquista = mensagens.some((m: string) => m.includes('Semana em Campo'));
    expect(temConquista).toBe(true);
  });

  test('streak 30 consecutivos desbloqueia conquista "Mês em Campo"', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({
      celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza',
      missoesConcluidasTotal: 50, streakAtual: 29, pontos: 600,
      titulos: '1,2,3,7', ultimaMissaoData: dataOntem(), nivel: 4,
    });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    const mensagens = client.messagesTo(CEL);
    const temConquista = mensagens.some((m: string) => m.includes('Mês em Campo'));
    expect(temConquista).toBe(true);
  });
});

// ─── isHuman guard ───────────────────────────────────────────────────────────

describe('isHuman – modo atendimento humano', () => {
  test('conversa em modo humano: bot não envia nenhuma mensagem', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Centro', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: true,
      messages: [], militanciaStage: undefined, militanciaData: {},
    };

    const precisaPersistir = await manager.processar(CEL, 'Olá, preciso de ajuda', conversa);

    expect(client.sent).toHaveLength(0);
    expect(precisaPersistir).toBe(false);
  });

  test('conversa em modo humano não interfere com stage ativo', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Centro', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: true,
      messages: [], militanciaStage: 'missao_resposta', militanciaData: { missao: 'Teste' },
    };

    await manager.processar(CEL, 'já fiz', conversa);

    expect(client.sent).toHaveLength(0);
    // Stage permanece intacto (operador não avançou)
    expect(conversa.militanciaStage).toBe('missao_resposta');
  });
});

// ─── Flow 5: Acesso a conteúdo ───────────────────────────────────────────────

describe('Flow 5 – Acesso a conteúdo', () => {
  function militanteCadastrado() {
    mockDB.setMilitante({ celular: CEL, nome: 'Bia', bairro: 'Aldeota', cidade: 'Fortaleza', pontos: 0 });
  }

  test('"3" com conteúdo disponível exibe conteúdo e registra +3 pts', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    mockDB.setConteudos([{ titulo: 'Post sobre saúde pública', link: 'https://t.me/exemplo', tipo: 'instagram' }]);

    await manager.processar(CEL, '3', novaConversa());

    expect(client.lastMessage()).toContain('Post sobre saúde pública');
    // +3 pts (fire-and-forget, await next tick)
    await Promise.resolve();
    expect(mockDB.getMilitante(CEL)?.pontos).toBe(3);
  });

  test('"3" com múltiplos conteúdos (por tipo) envia um por tipo', async () => {
    const { client, manager } = buildManager();
    militanteCadastrado();
    mockDB.setConteudos([
      { titulo: 'Post Instagram',   tipo: 'instagram' },
      { titulo: 'Artigo do site',   tipo: 'artigo' },
    ]);

    await manager.processar(CEL, '3', novaConversa());

    const msgs = client.messagesTo(CEL);
    expect(msgs.length).toBe(2);
    expect(msgs[0]).toContain('Post Instagram');
    expect(msgs[1]).toContain('Artigo do site');
    await Promise.resolve();
    expect(mockDB.getMilitante(CEL)?.pontos).toBe(6); // +3 por conteúdo
  });
});

// ─── Flow 1: Opção 2 (novidades) — usuário não cadastrado ────────────────────

describe('Flow 1 – Opção 2 (novidades sem cadastro)', () => {
  test('usuário envia "2" antes de se cadastrar → recebe conteúdo/evento', async () => {
    const { client, manager } = buildManager();
    // Registra contato mas sem nome/bairro/cidade
    mockDB.setMilitante({ celular: CEL, nome: '', bairro: '', cidade: '' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: undefined,
      militanciaData: { cadastroIniciado: true },
    };

    await manager.processar(CEL, '2', conversa);

    // Deve exibir conteúdo/evento ou mensagem de fallback — nunca ficar em silêncio
    expect(client.sent.length).toBeGreaterThan(0);
    // Não deve perguntar nome (cadastro não deve avançar)
    expect(client.lastMessage()).not.toContain('nome completo');
  });
});

// ─── Flow 2 – WELCOME_SECOND_CONTACT ─────────────────────────────────────────

describe('Flow 2 – Retorno sem cadastro (WELCOME_SECOND_CONTACT)', () => {
  test('usuário retorna sem cadastroIniciado → recebe mensagem de retorno', async () => {
    const { client, manager } = buildManager();
    // Existe na planilha mas sem dados
    mockDB.setMilitante({ celular: CEL, nome: '', bairro: '', cidade: '' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: undefined, militanciaData: {}, // cadastroIniciado ausente
    };

    await manager.processar(CEL, 'Oi', conversa);

    // Deve exibir mensagem de retorno, não perguntar nome diretamente
    expect(client.lastMessage()).toContain('De volta por aqui');
  });

  test('opção "1" com cadastroIniciado false seta flag e pede nome', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: '', bairro: '', cidade: '' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: undefined, militanciaData: {},
    };

    await manager.processar(CEL, '1', conversa);

    expect(client.lastMessage()).toContain('nome completo');
    expect(conversa.militanciaData?.cadastroIniciado).toBe(true);
  });

  test('opção "2" com cadastroIniciado false exibe conteúdo/evento', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: '', bairro: '', cidade: '' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: undefined, militanciaData: {},
    };

    await manager.processar(CEL, '2', conversa);

    expect(client.sent.length).toBeGreaterThan(0);
    expect(client.lastMessage()).not.toContain('nome completo');
  });
});

// ─── Edge cases do bot ───────────────────────────────────────────────────────

describe('Edge cases – estados não habituais', () => {
  test('missão não configurada exibe aviso e não seta stage', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'João', bairro: 'Centro', cidade: 'Fortaleza' });
    mockDB.setMissaoDia(''); // planilha sem missão do dia

    // Temporariamente zera o fallback do config para ativar o caminho de erro
    const origMissao = config.militancia.missaoDia;
    (config.militancia as any).missaoDia = '';
    try {
      await manager.processar(CEL, '1', novaConversa());
      expect(client.lastMessage()).toContain('não foi configurada');
    } finally {
      (config.militancia as any).missaoDia = origMissao;
    }
  });

  test('"2" sem eventos cadastrados exibe mensagem adequada e não seta stage', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Centro', cidade: 'Fortaleza' });
    mockDB.setEventos([]); // nenhum evento
    const conversa = novaConversa();

    await manager.processar(CEL, '2', conversa);

    expect(client.lastMessage()).toContain('Não há eventos');
    expect(conversa.militanciaStage).toBeUndefined();
  });

  test('"3" sem conteúdo na planilha usa fallback do env var', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Centro', cidade: 'Fortaleza' });
    // _conteudos está vazio (padrão após reset)

    await manager.processar(CEL, '3', novaConversa());

    // Deve enviar algum conteúdo (fallback via config.militancia.novoConteudo)
    expect(client.sent.length).toBeGreaterThan(0);
    expect(client.lastMessage()).toBeTruthy();
  });

  test('stage desconhecido é limpo e exibe menu', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Ana', bairro: 'Centro', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'stage_que_nao_existe' as any, militanciaData: {},
    };

    await manager.processar(CEL, 'qualquer coisa', conversa);

    expect(conversa.militanciaStage).toBeUndefined();
    expect(client.lastMessage()).toContain('Missão do dia');
  });
});

// ─── lideranca_disponibilidade (backward compat) ──────────────────────────────

describe('lideranca_disponibilidade – compatibilidade legado', () => {
  test('stage legado registra interesse e limpa stage', async () => {
    const { client, manager } = buildManager();
    mockDB.setMilitante({ celular: CEL, nome: 'Pedro', bairro: 'Benfica', cidade: 'Fortaleza' });
    const conversa: Conversation = {
      id: CEL, phoneNumber: CEL, unreadCount: 0, isHuman: false,
      messages: [], militanciaStage: 'lideranca_disponibilidade',
      militanciaData: { area: 'Organizar reuniões' },
    };

    await manager.processar(CEL, 'fins de semana', conversa);

    expect(conversa.militanciaStage).toBeUndefined();
    expect(client.lastMessage()).toContain('Registrado');
  });
});
