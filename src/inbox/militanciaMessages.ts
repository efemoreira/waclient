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
  WELCOME_FIRST_CONTACT: `👋 Esse é o canal direto com Felipe Moreira.
Sua participação aqui ajuda a transformar nosso país.

O que você quer fazer agora?

1️⃣ Participar da missão
2️⃣ Ver conteúdos e eventos`,

  // ---- Segundo contato (retornou, ainda não cadastrado) ----
  WELCOME_SECOND_CONTACT: `👋 Que bom ter você de volta!

Você já começou a entrar para a missão — falta só um passo rápido para concluir.

O que deseja agora?

1️⃣ Concluir minha entrada na missão
2️⃣ Ver novidades e próximo evento`,

  // ---- Mostrar conteúdo ou evento para não-cadastrados ----
  MOSTRAR_CONTEUDO: (conteudo: ConteudoInfo) => {
    let msg = `📢 Último conteúdo publicado:\n\n${conteudo.titulo}`;
    if (conteudo.link) msg += `\n${conteudo.link}`;
    if (conteudo.tipo) msg += `\n\n_Tipo: ${conteudo.tipo}_`;
    return msg;
  },

  MOSTRAR_EVENTO: (evento: EventoInfo) => {
    let msg = `📅 Próximo evento:\n\n*${evento.nome}*`;
    if (evento.texto) msg += `\n\n${evento.texto}`;
    if (evento.data || evento.hora) {
      msg += '\n\n🗓';
      if (evento.data) msg += ` ${evento.data}`;
      if (evento.hora) msg += ` às ${evento.hora}`;
    }
    if (evento.local) msg += `\n📍 ${evento.local}`;
    return msg;
  },

  MOSTRAR_NOVIDADES_FALLBACK: `📢 Não há novidades cadastradas no momento.

Assim que houver conteúdo novo ou eventos confirmados, você será um dos primeiros a saber!

Se quiser participar mais ativamente, responda *1* para fazer seu cadastro. 💪`,

  // Cadastro de novo militante
  WELCOME_NEW_USER: `✍️ Ótimo! Vamos ao cadastro.

Qual é o seu *nome completo*?`,

  PEDIR_BAIRRO: `👍 Perfeito, *{nome}*!

Em qual *bairro* você mora?`,

  PEDIR_CIDADE: `📍 Quase lá!

E qual é a sua *cidade*?`,

  CADASTRO_SUCESSO: (nome: string) => `🎉 *Cadastro concluído!*

Bem-vindo, *${nome}*! Você já faz parte da nossa militância. 💪

${MESSAGES_MILITANCIA.MENU_PERSONALIZADO(nome)}`,

  ERRO_CADASTRO: `⚠️ Não consegui salvar essa informação. Por favor, tente enviar novamente.`,

  // Menu principal (personalizado para usuário cadastrado)
  MENU_PERSONALIZADO: (nome: string) => `👋 Olá, *${nome}*!

O que você quer fazer hoje?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero liderar
6️⃣ Meu painel
7️⃣ Painel do bairro

_Digite *perfil* para ver seus pontos e nível._`,

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `👋 *Central da Militância*

O que você quer fazer hoje?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero liderar
6️⃣ Meu painel
7️⃣ Painel do bairro`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Já concluiu?

✅ *Já fiz* — para registrar como concluída
⏳ *Ainda não* — para registrar e voltar depois`,


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

  MISSAO_PENDENTE: `⏳ Anotado! Missão registrada como pendente.

Quando concluir, acesse a opção *1 – Missão do dia* para marcar como feita e ganhar seus pontos. 🎯

Digite *menu* para ver outras opções.`,

  // 2 - Eventos
  EVENTOS: (evento: EventoInfo) => {
    let msg = `📅 *Próximos Eventos*\n\n*${evento.nome}*`;
    if (evento.texto) msg += `\n\n${evento.texto}`;
    if (evento.data || evento.hora) {
      msg += '\n\n🗓';
      if (evento.data) msg += ` ${evento.data}`;
      if (evento.hora) msg += ` às ${evento.hora}`;
    }
    if (evento.local) msg += `\n📍 ${evento.local}`;
    msg += `\n\n---\nVocê vai participar?\n\n*1* – Sim, estarei lá! ✅\n*2* – Talvez, vou tentar 🤔`;
    return msg;
  },

  EVENTO_CONFIRMADO: (confirmacao: 'sim' | 'talvez') =>
    confirmacao === 'sim'
      ? `✅ Presença confirmada! Te vemos lá. 🎉\n\nDigite *menu* para ver outras opções.`
      : `👍 Entendido! Registramos que você talvez apareça.\n\nFique atento — avisamos se houver novidades sobre o evento.\n\nDigite *menu* para ver outras opções.`,

  // 3 - Conteúdo
  CONTEUDO: (conteudoTexto: string) => `📢 *Novo Conteúdo*

${conteudoTexto}

---
Gostou? Compartilhe com mais pessoas! 🔥

Digite *menu* para ver outras opções.`,

  // 4 - Denúncia
  DENUNCIA_INICIO: `📢 *Enviar Denúncia*

Vamos registrar o problema. Quanto mais detalhes, melhor!

Em qual *bairro* o problema está ocorrendo?`,

  PEDIR_DESCRICAO_DENUNCIA: `📝 Descreva o problema com detalhes:\n\n_O que está acontecendo? Onde exatamente? Há quanto tempo?_`,

  PEDIR_FOTO_DENUNCIA: `📷 Tem alguma foto ou link (imagem, vídeo, notícia) que ilustre o problema?\n\nSe sim, envie agora. Se não, responda *não*.`,

  DENUNCIA_REGISTRADA: `✅ *Denúncia recebida!*

Sua mensagem foi registrada e será analisada pela equipe.

Obrigado por ajudar a melhorar sua comunidade. Cada denúncia faz diferença! 🌟

Digite *menu* para ver outras opções.`,

  // 5 - Quero liderar
  LIDERANCA_AGRADECIMENTO: `🙌 Que ótimo! Pessoas engajadas são o coração do movimento.

Escolha como você quer contribuir:`,

  LIDERANCA_OPCOES: `1️⃣ Fazer uma doação financeira
2️⃣ Organizar reuniões no meu bairro
3️⃣ Oferecer minha experiência profissional
4️⃣ Participar de pesquisas e planejamento estratégico`,

  // Keep for backward compatibility (existing code that imports LIDERANCA_MENU will still compile)
  LIDERANCA_MENU: `🙏 Obrigado por ajudar!

Curtir, comentar e compartilhar conteúdos já faz muita diferença para o movimento.`,

  PEDIR_DISPONIBILIDADE: `⏰ Qual é a sua *disponibilidade*?

(Exemplo: fins de semana, noites, integral, etc.)`,

  LIDERANCA_REGISTRADA: `🌟 *Registrado!*

Vamos entrar em contato em breve para alinhar os próximos passos com você.

Obrigado por querer fazer mais pelo movimento! 💪

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

  PAINEL_BAIRRO_PROMPT: `📍 *Painel do Bairro*

Qual bairro você quer consultar?

_Pode ser o seu ou qualquer outro da cidade._`,

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

