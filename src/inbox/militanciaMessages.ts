/**
 * Mensagens do bot de militância política
 * Central de Mobilização da Militância
 */

import type { ConteudoInfo, EventoInfo } from '../utils/militanciaSheet';

export const MESSAGES_MILITANCIA = {
  // ---- Primeiro contato (usuário não cadastrado, primeira mensagem) ----
  WELCOME_FIRST_CONTACT: `👋 Olá! Seja bem-vindo.

Este é o assistente do movimento.

Você pode:

1️⃣ Fazer um cadastro rápido para participar da militância
2️⃣ Apenas acompanhar o que está acontecendo`,

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

Bem-vindo de volta à Central da Militância.

Escolha uma opção:

1️⃣ Missão de hoje
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Quero assumir mais responsabilidade
5️⃣ Painel do meu bairro
6️⃣ Enviar denúncia`,

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `👋 *Central da Militância*

Escolha uma opção:

1️⃣ Missão de hoje
2️⃣ Próximos eventos
3️⃣ Novo conteúdo
4️⃣ Quero assumir mais responsabilidade
5️⃣ Painel do meu bairro
6️⃣ Enviar denúncia`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Depois responda:

✅ Já fiz
⏳ Vou fazer agora`,

  MISSAO_CONCLUIDA: `🏆 *Parabéns!* Missão registrada com sucesso!

Você ganhou *10 pontos* por concluir a missão de hoje! 🎯

Continue engajado e acumule mais pontos!

Digite *menu* para ver outras opções.`,

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

  // 4 - Liderança
  LIDERANCA_MENU: `💪 *Quero assumir mais responsabilidade*

Em qual área você gostaria de ajudar?

1️⃣ Liderar meu bairro
2️⃣ Organizar reuniões
3️⃣ Ajudar na comunicação
4️⃣ Ajudar nos eventos
5️⃣ Ajudar online`,

  PEDIR_DISPONIBILIDADE: `⏰ Qual é a sua *disponibilidade*?

(Exemplo: fins de semana, noites, integral, etc.)`,

  LIDERANCA_REGISTRADA: `🌟 *Interesse registrado com sucesso!*

Entraremos em contato em breve para orientá-lo(a) sobre os próximos passos.

Obrigado pela disposição em liderar! 💪

Digite *menu* para ver outras opções.`,

  // 5 - Painel do bairro
  PAINEL_BAIRRO: (params: {
    bairro: string;
    militantesAtivos: number;
    missoesConcluidasSemana: number;
    nivelMedio: number;
    lider?: string;
  }) => `📍 *PAINEL DO BAIRRO – ${params.bairro.toUpperCase()}*

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

  // 6 - Denúncia
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

  // Perfil do militante
  PERFIL: (params: {
    nome: string;
    bairro: string;
    nivel: number;
    nomeNivel: string;
    pontos: number;
  }) => `⭐ *Seu Perfil*

👤 Nome: ${params.nome}
📍 Bairro: ${params.bairro}
🎖️ Nível: ${params.nivel} – ${params.nomeNivel}
🏅 Pontos: ${params.pontos}

*Pontuação para subir de nível:*
• Nível 2 (Militante): 20 pts
• Nível 3 (Militante Ativo): 50 pts
• Nível 4 (Mobilizador): 100 pts
• Nível 5 (Líder de Bairro): 200 pts
• Nível 6 (Coordenador Regional): 500 pts`,

  // Fallback
  COMANDO_NAO_RECONHECIDO: `🤔 Não entendi essa mensagem.

Digite *menu* para ver todas as opções disponíveis.`,
};
