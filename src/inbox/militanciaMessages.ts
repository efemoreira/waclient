/**
 * Mensagens do bot de militância política
 * Central de Mobilização da Militância
 */

import type { ConteudoInfo, EventoInfo } from '../utils/militanciaSheet';

/**
 * Returns an ordinal suffix string for a rank number (Portuguese style).
 * e.g. 1 → "1º", 2 → "2º"
 */
function ordinal(n: number): string {
  return `${n}º`;
}

/**
 * Calculates the next level name and remaining missions.
 * Returns null if the militant is already at maximum level.
 */
function proximoNivel(
  nivelAtual: number,
  missoesAtuais: number
): { nome: string; missoesRestantes: number } | null {
  const thresholds: Record<number, { missoes: number; nome: string }> = {
    1: { missoes: 5, nome: 'Militante' },
    2: { missoes: 15, nome: 'Militante Ativo' },
    3: { missoes: 40, nome: 'Mobilizador' },
    4: { missoes: 80, nome: 'Líder de Bairro' },
    5: { missoes: 150, nome: 'Coordenador' },
  };
  const prox = thresholds[nivelAtual];
  if (!prox) return null;
  const missoesRestantes = Math.max(0, prox.missoes - missoesAtuais);
  return { nome: prox.nome, missoesRestantes };
}

export const MESSAGES_MILITANCIA = {
  // ---- Primeiro contato (usuário não cadastrado, primeira mensagem) ----
  WELCOME_FIRST_CONTACT: `👋 Olá! Seja bem-vindo ao assistente do movimento.

Escolha uma opção:

1️⃣ Fazer meu cadastro para participar ativamente
2️⃣ Ver último conteúdo e próximo evento`,

  // ---- Segundo contato (retornou, ainda não cadastrado) ----
  WELCOME_SECOND_CONTACT: `👋 Que bom ver você novamente!

Percebi que você ainda não fez seu cadastro na base da militância.

Se quiser participar mais ativamente, recomendo fazer o cadastro.

Se tiver alguma dúvida, pode falar diretamente com:

Felipe
📞 85 99722-3863

1️⃣ Fazer cadastro
2️⃣ Ver novidades / conteúdos`,

  // ---- Mostrar conteúdo ou evento para não-cadastrados ----
  MOSTRAR_CONTEUDO: (conteudo: ConteudoInfo) => {
    let msg = `📢 Último conteúdo publicado:\n\n${conteudo.titulo}`;
    if (conteudo.link) msg += `\n${conteudo.link}`;
    if (conteudo.tipo) msg += `\n\n_Tipo: ${conteudo.tipo}_`;
    return msg;
  },

  MOSTRAR_EVENTO: (evento: EventoInfo) => {
    let msg = `📅 Próximo evento:\n\n${evento.nome}`;
    if (evento.local) msg += `\n📍 ${evento.local}`;
    if (evento.data) msg += `\n🗓 ${evento.data}`;
    return msg;
  },

  MOSTRAR_NOVIDADES_FALLBACK: `📢 Fique de olho nas nossas redes para as últimas novidades!

Quando quiser se cadastrar e participar mais ativamente, é só mandar uma mensagem! 💪`,

  // Cadastro de novo militante
  WELCOME_NEW_USER: `👋 Bem-vindo à *Central da Militância*!

Para começar, por favor me envie seu *nome completo*.`,

  PEDIR_BAIRRO: `👍 Ótimo!

Agora me diga qual é o seu *bairro*.`,

  PEDIR_CIDADE: `📍 Perfeito!

E qual é a sua *cidade*?`,

  CADASTRO_SUCESSO: (nome: string) => `🎉 *Cadastro realizado com sucesso!*

Bem-vindo(a), *${nome}*! Você agora faz parte da nossa militância! 💪

${MESSAGES_MILITANCIA.MENU_PERSONALIZADO(nome)}`,

  ERRO_CADASTRO: `❌ Ocorreu um erro ao realizar seu cadastro.

Por favor, tente novamente respondendo com seu *nome completo*.`,

  // Menu principal (personalizado para usuário cadastrado)
  MENU_PERSONALIZADO: (nome: string) => `👋 Olá, *${nome}*!

Bem-vindo à Central da Militância.

Escolha uma opção:

1️⃣ Missão
2️⃣ Eventos
3️⃣ Conteúdos
4️⃣ Enviar denúncia
5️⃣ Quero assumir mais responsabilidade
6️⃣ Dashboard`,

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `👋 *Central da Militância*

Escolha uma opção:

1️⃣ Missão
2️⃣ Eventos
3️⃣ Conteúdos
4️⃣ Enviar denúncia
5️⃣ Quero assumir mais responsabilidade
6️⃣ Dashboard`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Depois responda:

✅ Já fiz
⏳ Vou fazer agora`,

  MISSAO_CONCLUIDA: (streakAtual: number) => {
    let msg = `🏆 *Parabéns!* Missão registrada com sucesso!\n\nVocê ganhou *10 pontos* por concluir a missão de hoje! 🎯`;
    if (streakAtual > 1) {
      msg += `\n\n🔥 Sequência atual: *${streakAtual} dias!*`;
    } else {
      msg += `\n\n🔥 Sequência iniciada! Volte amanhã para continuar.`;
    }
    msg += `\n\nContinue engajado e acumule mais pontos!\n\nDigite *menu* para ver outras opções.`;
    return msg;
  },

  NIVEL_SUBIU: (nomeNivel: string) => `🎉 *Parabéns!*

Você subiu de nível.

Novo nível: *${nomeNivel}* 🚀

Continue assim!`,

  CONQUISTA_DESBLOQUEADA: (nomeConquista: string, missoesTotal: number) =>
    `🏅 *Nova conquista desbloqueada!*

*${nomeConquista}*

Você completou ${missoesTotal} missões! Continue mobilizado! 💪`,

  MISSAO_PENDENTE: `⏳ Missão registrada! Assim que concluir, envie *✅ Já fiz*.

Continue mobilizado! 💪

Digite *menu* para ver outras opções.`,

  // 2 - Eventos
  EVENTOS: (eventosTexto: string) => `📅 *Próximos Eventos*

${eventosTexto}

---
Você vai participar?

1 - ✅ Sim, vou!
2 - 🤔 Talvez`,

  EVENTO_CONFIRMADO: (confirmacao: string) => `✅ Presença *${confirmacao}* registrada!

Obrigado por confirmar! Fique de olho nas novidades.

Digite *menu* para ver outras opções.`,

  // 3 - Conteúdo
  CONTEUDO: (conteudoTexto: string) => `📢 *Novo Conteúdo*

${conteudoTexto}

---
Gostou? Compartilhe com mais pessoas! 🔥

Digite *menu* para ver outras opções.`,

  // 4 - Denúncia
  DENUNCIA_INICIO: `📢 *Enviar Denúncia*

Vamos registrar sua denúncia.

Qual é o seu *bairro*?`,

  PEDIR_DESCRICAO_DENUNCIA: `📝 Descreva o *problema* que você quer reportar:`,

  PEDIR_FOTO_DENUNCIA: `📷 Você tem alguma *foto ou link de mídia* para enviar?

Se sim, envie agora.
Se não, responda *não*.`,

  DENUNCIA_REGISTRADA: `✅ *Denúncia registrada com sucesso!*

Sua denúncia foi recebida e será analisada pela equipe.

Obrigado por contribuir com a melhoria da sua comunidade! 🌟

Digite *menu* para ver outras opções.`,

  // 5 - Quero assumir mais responsabilidade
  LIDERANCA_AGRADECIMENTO: `🙏 Obrigado por ajudar!

Curtir, comentar e compartilhar conteúdos já faz muita diferença para o movimento.`,

  LIDERANCA_OPCOES: `Como você gostaria de ajudar mais?

1️⃣ Fazer uma doação
2️⃣ Organizar reuniões no meu bairro
3️⃣ Ajudar com minha experiência profissional
4️⃣ Participar de pesquisas e estratégias`,

  // Keep for backward compatibility (existing code that imports LIDERANCA_MENU will still compile)
  LIDERANCA_MENU: `🙏 Obrigado por ajudar!

Curtir, comentar e compartilhar conteúdos já faz muita diferença para o movimento.`,

  PEDIR_DISPONIBILIDADE: `⏰ Qual é a sua *disponibilidade*?

(Exemplo: fins de semana, noites, integral, etc.)`,

  LIDERANCA_REGISTRADA: `🌟 *Interesse registrado com sucesso!*

Entraremos em contato em breve para orientá-lo(a) sobre os próximos passos.

Obrigado pela disposição em ajudar! 💪

Digite *menu* para ver outras opções.`,

  // 6 - Dashboard
  DASHBOARD: (params: {
    nome: string;
    nivel: number;
    nomeNivel: string;
    pontos: number;
    missoesConcluidasTotal: number;
    militantesNoBairro: number;
    posicaoNoBairro: number;
    posicaoGeral: number;
    streakAtual: number;
    bairro: string;
  }) => {
    const prox = proximoNivel(params.nivel, params.missoesConcluidasTotal);
    let msg = `📊 *Seu progresso*

👤 ${params.nome}

🎖️ Nível: *${params.nomeNivel}*
🎯 Missões concluídas: *${params.missoesConcluidasTotal}*

🏘 Seu bairro: *${params.bairro}*
👥 Pessoas no seu bairro: ${params.militantesNoBairro}
📍 Sua posição no bairro: *${ordinal(params.posicaoNoBairro)}*
🌐 Posição geral: ${ordinal(params.posicaoGeral)}

🔥 Sequência atual: *${params.streakAtual} ${params.streakAtual === 1 ? 'dia' : 'dias'}*`;

    if (prox && prox.missoesRestantes > 0) {
      msg += `\n\n⬆️ Próximo nível: *${prox.nome}*\n🔢 Faltam ${prox.missoesRestantes} missões`;
    }

    msg += `\n\nDigite *menu* para voltar.`;
    return msg;
  },

  DASHBOARD_ERRO: `⚠️ Não foi possível carregar o dashboard no momento.

Tente novamente mais tarde.

Digite *menu* para ver outras opções.`,

  // Painel do bairro
  PAINEL_BAIRRO: (params: {
    bairro: string;
    militantesAtivos: number;
    missoesConcluidasSemana: number;
    nivelMedio: number;
    lider?: string;
    nivelBairro: number;
    missoesTotais: number;
  }) => `📍 *PAINEL DO BAIRRO – ${params.bairro.toUpperCase()}*

🏘 Nível do bairro: *${params.nivelBairro}*
🎯 Missões totais: *${params.missoesTotais}*

👥 Militantes ativos: ${params.militantesAtivos}
🎯 Missões concluídas essa semana: ${params.missoesConcluidasSemana}
⭐ Nível médio: ${params.nivelMedio}${params.lider ? `\n👑 Líder responsável: ${params.lider}` : ''}

---
🏆 *Ranking Geral de Bairros:*`,

  PAINEL_RANKING: (ranking: Array<{ bairro: string; missoes: number }>) => {
    if (!ranking.length) return 'Nenhum dado disponível ainda.';
    const medalhas = ['🥇', '🥈', '🥉'];
    return ranking
      .map((r, i) => `${medalhas[i] || `${i + 1}º`} ${r.bairro} – ${r.missoes} missões`)
      .join('\n');
  },

  PAINEL_ERRO: `⚠️ Não foi possível carregar o painel do bairro no momento.

Tente novamente mais tarde.

Digite *menu* para ver outras opções.`,

  // Perfil do militante
  PERFIL: (params: {
    nome: string;
    bairro: string;
    nivel: number;
    nomeNivel: string;
    pontos: number;
    missoesConcluidasTotal: number;
    streakAtual: number;
    titulos: string;
  }) => {
    const prox = proximoNivel(params.nivel, params.missoesConcluidasTotal);
    let msg = `⭐ *Seu Perfil*

👤 Nome: ${params.nome}
📍 Bairro: ${params.bairro}
🎖️ Nível: ${params.nivel} – ${params.nomeNivel}
🎯 Missões concluídas: ${params.missoesConcluidasTotal}
🔥 Sequência atual: ${params.streakAtual} ${params.streakAtual === 1 ? 'dia' : 'dias'}`;

    if (params.titulos) {
      msg += `\n🏅 Conquistas: ${params.titulos}`;
    }

    if (prox && prox.missoesRestantes > 0) {
      msg += `\n\n⬆️ Próximo nível: *${prox.nome}*\nFaltam ${prox.missoesRestantes} missões`;
    }

    msg += `\n\n*Níveis:*
• Nível 1 – Simpatizante: 0 missões
• Nível 2 – Militante: 5 missões
• Nível 3 – Militante Ativo: 15 missões
• Nível 4 – Mobilizador: 40 missões
• Nível 5 – Líder de Bairro: 80 missões
• Nível 6 – Coordenador: 150 missões`;

    return msg;
  },

  // Fallback
  COMANDO_NAO_RECONHECIDO: `🤔 Não entendi essa mensagem.

Digite *menu* para ver todas as opções disponíveis.`,
};

