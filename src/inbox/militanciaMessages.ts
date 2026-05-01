/**
 * Mensagens do bot de militância política
 * Central de Mobilização da Militância
 */

import type { ConteudoInfo, EventoInfo, ConquistaDefinicao } from '../utils/militanciaSheet';

export const MESSAGES_MILITANCIA = {
  // ---- Primeiro contato (usuário não cadastrado, primeira mensagem) ----
  WELCOME_FIRST_CONTACT: `👋 Ola! Esse é o canal direto de *Felipe Moreira*.

Sua participação aqui ajuda a transformar nosso país.

O que você quer fazer?

1️⃣ Participar da missão
2️⃣ Ver conteúdos e eventos`,

  // ---- Segundo contato (retornou, ainda não cadastrado) ----
  WELCOME_SECOND_CONTACT: `👋 De volta por aqui!

Você está a um passo de participar da missão — vale concluir!

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

Em qual *bairro ou distrito* você mora?`,

  PEDIR_CIDADE: `📍 Quase lá!

Em qual *cidade* você mora?`,

  PEDIR_ORIGEM: `📱 *Última pergunta:*

Quem te trouxe para o movimento?

� Se foi indicação de alguém, envie o *número de membro* da pessoa (ex: *#42*)

🌐 Se veio pelas redes sociais, informe qual (ex: *Instagram*, *Facebook*, *TikTok*)

_Digite *0* para pular._`,

  CADASTRO_SUCESSO: (nome: string, posicao: number) => `🎉 *Bem-vindo ao movimento, ${nome}!*

Você é o *${posicao}º membro* da nossa rede. Cada pessoa faz diferença! 💪

🔢 *Seu número de membro: #${posicao}*
Compartilhe para recrutar amigos — quem entrar informando seu número te credita pontos! 🌟

${MESSAGES_MILITANCIA.MENU_PERSONALIZADO(nome, posicao)}`,

  ERRO_CADASTRO: `⚠️ Não consegui salvar. Por favor, tente enviar novamente.`,

  // Menu principal (personalizado para usuário cadastrado)
  MENU_PERSONALIZADO: (nome: string, posicao?: number) => {
    const membroStr = posicao ? `\n🔢 *Membro #${posicao}*` : '';
    return `👋 Olá, *${nome}*!${membroStr}

O que você quer fazer hoje?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais`;
  },

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `✊ *Central da Militância*

O que você quer fazer?

1️⃣ Missão do dia
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Já concluiu?

1️⃣ *Sim, fiz!* — para registrar como concluída
2️⃣ *Ainda não* — para registrar e voltar depois`,


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

  CONQUISTA_DESBLOQUEADA: (conquista: Pick<ConquistaDefinicao, 'nome' | 'emoji' | 'descricao'>, missoesTotal: number) => {
    const gram = missoesTotal === 1 ? 'missão' : 'missões';
    let msg = `${conquista.emoji} *Conquista desbloqueada!*\n\n*${conquista.nome}*`;
    if (conquista.descricao) msg += `\n_${conquista.descricao}_`;
    if (missoesTotal > 0) msg += `\n\n${missoesTotal} ${gram} no seu histórico. Siga em frente! 💪`;
    else msg += `\n\nParabéns pela conquista! 💪`;
    return msg;
  },

  MISSAO_PENDENTE: `⏳ *Missão pendente.*

Quando fizer, acesse *1 – Missão do dia* para registrar e ganhar seus pontos. 🎯

Digite *menu* para continuar.`,

  MISSAO_JA_FEITA: `✅ *Você já registrou a missão de hoje!*

Volte amanhã para a próxima missão. 🎯

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
    msg += `\n\n---\nVocê vai?\n\n1️⃣ Sim, estarei lá! ✅\n2️⃣ Talvez 🤔`;
    return msg;
  },

  EVENTO_CONFIRMADO: (confirmacao: 'sim' | 'talvez') =>
    confirmacao === 'sim'
      ? `✅ *Presença confirmada!* +5 pontos 🎉\n\nNos vemos lá!\n\nDigite *menu* para continuar.`
      : `👍 Registrado como *talvez*.\n\nFique atento — avisaremos sobre o evento.\n\nDigite *menu* para continuar.`,

  EVENTO_JA_CONFIRMADO: (nomeEvento: string) =>
    `✅ Você já confirmou presença em *${nomeEvento}*.

Nos vemos lá! 🎉

Digite *menu* para continuar.`,

  // 3 - Conteúdo
  CONTEUDO_JA_ACESSADO: (titulo: string) =>
    `👀 Você já acessou *${titulo}* anteriormente.\n\nDigite *menu* para ver outras opções.`,

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
4️⃣ Participar de pesquisas e estratégia

_Não está nas opções? Escreva o que você quer fazer! Qualquer contribuição é bem-vinda 💚_`,

  // Keep for backward compatibility (existing code that imports LIDERANCA_MENU will still compile)
  LIDERANCA_MENU: `🙏 Obrigado por ajudar!

Curtir, comentar e compartilhar conteúdos já faz muita diferença para o movimento.`,

  PEDIR_DISPONIBILIDADE: `⏰ Qual é a sua *disponibilidade*?

(Exemplo: fins de semana, noites, integral, etc.)`,

  LIDERANCA_REGISTRADA: `✅ *Registrado!*

Entraremos em contato em breve para alinhar os próximos passos.

Obrigado por querer fazer mais pelo movimento! 💪

Digite *menu* para continuar.`,

  // Fallback
  COMANDO_NAO_RECONHECIDO: `🤔 Não entendi essa mensagem.

Digite *menu* para ver todas as opções disponíveis.`,
};

