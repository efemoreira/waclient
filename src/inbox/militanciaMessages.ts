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
  WELCOME_FIRST_CONTACT: `✊ Olá! Bem-vindo ao canal de *Felipe Moreira*.

Sua participação transforma a cidade. Cada ação conta!

O que você quer fazer?

1️⃣ Entrar para a rede
2️⃣ Ver conteúdos e eventos`,

  // ---- Segundo contato (retornou, ainda não cadastrado) ----
  WELCOME_SECOND_CONTACT: `👋 De volta por aqui!

Você está a um passo de entrar para a rede — vale concluir!

1️⃣ Concluir meu cadastro
2️⃣ Ver novidades e eventos`,

  // ---- Mostrar conteúdo ou evento para não-cadastrados ----
  MOSTRAR_CONTEUDO: (conteudo: ConteudoInfo) => {
    const tipoLabel: Record<string, string> = {
      instagram: '📸 Instagram', video: '🎬 Vídeo', youtube: '▶️ YouTube',
      artigo: '📰 Artigo', tiktok: '📱 TikTok',
    };
    const tipo = tipoLabel[(conteudo.tipo ?? '').toLowerCase()] ?? '📢 Conteúdo';
    let msg = `${tipo}\n\n*${conteudo.titulo}*`;
    if (conteudo.link) msg += `\n${conteudo.link}`;
    msg += `\n\n_Encaminhe para 3 pessoas e amplie o movimento_ 📲`;
    return msg;
  },

  MOSTRAR_EVENTO: (evento: EventoInfo) => {
    let msg = `📅 *${evento.nome}*`;
    if (evento.texto) msg += `\n\n${evento.texto}`;
    if (evento.data || evento.hora) {
      msg += '\n\n🗓';
      if (evento.data) msg += ` ${evento.data}`;
      if (evento.hora) msg += ` às ${evento.hora}`;
    }
    if (evento.local) msg += `\n📍 ${evento.local}`;
    return msg;
  },

  MOSTRAR_NOVIDADES_FALLBACK: `📢 Ainda não há novidades cadastradas.

Em breve chegarão conteúdos e eventos — você será avisado!

Responda *1* para entrar e participar ativamente. 💪`,

  // Cadastro de novo militante
  WELCOME_NEW_USER: `✍️ Ótimo! Vamos ao cadastro.

Qual é o seu *nome completo*?`,

  PEDIR_BAIRRO: `👍 Ótimo!

Em qual *bairro* você mora?`,

  PEDIR_CIDADE: `📍 Quase lá!

Em qual *cidade* você mora?`,

  PEDIR_ORIGEM: `📱 *Última pergunta:*

Quem te trouxe para o movimento?

📞 Se foi indicação de alguém, envie o número com DD (ex: *85 99999-0001*)
🌐 Se veio pelas redes sociais, informe qual (ex: *Instagram*, *Facebook*, *TikTok*)

_Digite *0* para pular._`,

  CADASTRO_SUCESSO: (nome: string, posicao: number) => `🎉 *Bem-vindo ao movimento, ${nome}!*

Você é o *${posicao}º membro* da nossa rede. Cada pessoa faz diferença! 💪

${MESSAGES_MILITANCIA.MENU_PERSONALIZADO(nome)}`,

  ERRO_CADASTRO: `⚠️ Não consegui salvar. Por favor, tente enviar novamente.`,

  // Menu principal (personalizado para usuário cadastrado)
  MENU_PERSONALIZADO: (nome: string) => `👋 Olá, *${nome}*!

O que você quer fazer hoje?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais
6️⃣ Meu painel
7️⃣ Painel do bairro

_Digite *perfil* para ver seus pontos e conquistas._`,

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `✊ *Central da Militância*

O que você quer fazer?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais
6️⃣ Meu painel
7️⃣ Painel do bairro`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Já concluiu?

✅ *Já fiz* — para registrar como concluída
⏳ *Ainda não* — para registrar e voltar depois`,


  MISSAO_CONCLUIDA: (streakAtual: number, pontos: number, pontosGanhos: number) => {
    const bonus = pontosGanhos > 10 ? ` _(+${pontosGanhos - 10} bônus streak 🔥)_` : '';
    let msg = `✅ *Missão feita!*\n\n+${pontosGanhos} pontos${bonus} · Total: *${pontos} pts*`;
    if (streakAtual >= 90) {
      msg += `\n\n🔥 *${streakAtual} dias consecutivos!* Você é uma lenda desta causa! 🏆`;
    } else if (streakAtual >= 60) {
      msg += `\n\n🔥 *${streakAtual} dias seguidos!* Dois meses de dedicação! 🏆`;
    } else if (streakAtual === 30) {
      msg += `\n\n🔥 *30 dias consecutivos!* Um mês completo — você é imparável! 🏆`;
    } else if (streakAtual === 7) {
      msg += `\n\n🔥 *Uma semana seguida!* Continue assim! 💪`;
    } else if (streakAtual > 1) {
      msg += `\n\n🔥 *${streakAtual} dias seguidos!*`;
    } else {
      msg += `\n\n🔥 Sequência iniciada! Volte amanhã para continuar.`;
    }
    msg += `\n\nDigite *menu* para continuar.`;
    return msg;
  },

  NIVEL_SUBIU: (nomeNivel: string) => `🚀 *Você subiu de nível!*

→ *${nomeNivel}*

Cada missão cumprida constrói um futuro melhor. Continue! 💪`,

  CONQUISTA_DESBLOQUEADA: (nomeConquista: string, missoesTotal: number) => {
    const gram = missoesTotal === 1 ? 'missão' : 'missões';
    return `🎖️ *Conquista desbloqueada!*\n\n*${nomeConquista}*\n\n${missoesTotal} ${gram} no seu histórico. Siga em frente! 💪`;
  },

  MISSAO_PENDENTE: `⏳ *Missão pendente.*

Quando fizer, acesse *1 – Missão do dia* para registrar e ganhar seus pontos. 🎯

Digite *menu* para continuar.`,

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
    msg += `\n\n---\nVocê vai?\n\n*1* – Sim, estarei lá! ✅\n*2* – Talvez 🤔`;
    return msg;
  },

  EVENTO_CONFIRMADO: (confirmacao: 'sim' | 'talvez') =>
    confirmacao === 'sim'
      ? `✅ *Presença confirmada!* +5 pontos 🎉\n\nNos vemos lá!\n\nDigite *menu* para continuar.`
      : `👍 Registrado como *talvez*.\n\nFique atento — avisaremos sobre o evento.\n\nDigite *menu* para continuar.`,

  // 3 - Conteúdo
  CONTEUDO: (conteudoTexto: string) => `📢 *Novo Conteúdo*

${conteudoTexto}

---
Gostou? Compartilhe — cada divulgação fortalece o movimento! 🔥

Digite *menu* para continuar.`,

  // 4 - Denúncia
  DENUNCIA_INICIO: `� *Enviar Denúncia*

Registrar um problema é um ato cívico. Obrigado!

Em qual *bairro* está o problema?`,

  PEDIR_DESCRICAO_DENUNCIA: `📝 *Descreva o problema com detalhes:*

_O que é? Onde fica? Há quanto tempo?_`,

  PEDIR_FOTO_DENUNCIA: `📷 Tem alguma foto ou link (imagem, vídeo, notícia) que ilustre o problema?\n\nSe sim, envie agora. Se não, responda *não*.`,

  DENUNCIA_REGISTRADA: (protocolo: string) => `✅ *Denúncia registrada!*

🔖 Protocolo: *#${protocolo}*

Equipe notificada. Obrigado por fiscalizar sua comunidade! 🌟

Digite *menu* para continuar.`,

  // 5 - Quero liderar
  LIDERANCA_AGRADECIMENTO: `🙌 *Que atitude!*

Você é o tipo de pessoa que faz o movimento crescer. Como quer contribuir?`,

  LIDERANCA_OPCOES: `1️⃣ Fazer uma doação financeira
2️⃣ Organizar reuniões no meu bairro
3️⃣ Oferecer minha experiência profissional
4️⃣ Participar de pesquisas e estratégia`,

  // Keep for backward compatibility (existing code that imports LIDERANCA_MENU will still compile)
  LIDERANCA_MENU: `🙏 Obrigado por ajudar!

Curtir, comentar e compartilhar conteúdos já faz muita diferença para o movimento.`,

  PEDIR_DISPONIBILIDADE: `⏰ Qual é a sua *disponibilidade*?

(Exemplo: fins de semana, noites, integral, etc.)`,

  LIDERANCA_REGISTRADA: `✅ *Registrado!*

Entraremos em contato em breve para alinhar os próximos passos.

Obrigado por querer fazer mais pelo movimento! 💪

Digite *menu* para continuar.`,

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

👤 *${params.nome}*
🎖️ Nível: *${params.nomeNivel}*
💰 *${params.pontos} pts*
🎯 ${params.missoesConcluidasTotal} missões concluídas
🔥 Sequência: *${params.streakAtual} ${params.streakAtual === 1 ? 'dia' : 'dias'}*

� Bairro *${params.bairro}*: ${ordinal(params.posicaoNoBairro)} lugar (${params.militantesNoBairro} militantes)
🌐 Posição geral: *${ordinal(params.posicaoGeral)}*`;

    if (prox && prox.missoesRestantes > 0) {
      msg += `\n\n⬆️ Próximo: *${prox.nome}*\nFaltam ${prox.missoesRestantes} missões`;
    }

    msg += `\n\nDigite *menu* para continuar.`;
    return msg;
  },

  DASHBOARD_ERRO: `⚠️ Não foi possível carregar o painel. Tente novamente.

Digite *menu* para continuar.`,

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
    pontosTotais: number;
  }) => `🏡 *PAINEL DO BAIRRO – ${params.bairro.toUpperCase()}*

📊 Nível do bairro: *${params.nivelBairro}* · ⭐ *${params.pontosTotais} pts*
🎯 Missões totais: ${params.missoesTotais}

👥 Militantes ativos: ${params.militantesAtivos}
📅 Missões essa semana: ${params.missoesConcluidasSemana}
🏆 Nível médio: ${params.nivelMedio}${params.lider ? `\n👑 Líder responsável: ${params.lider}` : ''}

---
🏆 *Ranking Geral de Bairros:*`,

  PAINEL_RANKING: (ranking: Array<{ bairro: string; pontos: number }>) => {
    if (!ranking.length) return 'Nenhum dado disponível ainda.';
    const medalhas = ['🥇', '🥈', '🥉'];
    return ranking
      .map((r, i) => `${medalhas[i] || `${i + 1}º`} ${r.bairro} – ${r.pontos} pts`)
      .join('\n');
  },

  PAINEL_ERRO: `⚠️ Não foi possível carregar o painel do bairro. Tente novamente.

Digite *menu* para continuar.`,

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

👤 *${params.nome}*  |  📍 ${params.bairro}
🎖️ Nível ${params.nivel}: *${params.nomeNivel}*
💰 *${params.pontos} pts*
🎯 ${params.missoesConcluidasTotal} missões  ·  🔥 ${params.streakAtual} ${params.streakAtual === 1 ? 'dia' : 'dias'}`;

    if (params.titulos) {
      msg += `\n\n🏅 *Conquistas:*\n${params.titulos}`;
    }

    if (prox && prox.missoesRestantes > 0) {
      msg += `\n\n⬆️ Próximo: *${prox.nome}*\nFaltam ${prox.missoesRestantes} missões`;
    }

    msg += `\n\n*Níveis:*
• 1 – Simpatizante: 0 missões
• 2 – Militante: 5 missões
• 3 – Militante Ativo: 15 missões
• 4 – Mobilizador: 40 missões
• 5 – Líder de Bairro: 80 missões
• 6 – Coordenador: 150 missões`;

    return msg;
  },

  // Fallback
  COMANDO_NAO_RECONHECIDO: `🤔 Não entendi essa mensagem.

Digite *menu* para ver todas as opções disponíveis.`,
};

