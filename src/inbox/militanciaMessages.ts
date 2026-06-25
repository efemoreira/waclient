/**
 * Mensagens do bot de militância política
 * Comando Digital do Delegado Huggo
 */

import type { PublicacaoItem, EventoItem } from '../data/militanciaConteudo';

const CAMPANHA_NOME = 'Comando Digital do Delegado Huggo';

const LINK_VAQUINHA = 'PLACEHOLDER_LINK_VAQUINHA';
const LINK_COMUNIDADE = 'https://chat.whatsapp.com/C5x7kHvgknLHVqoXCwy8z5?mode=gi_t';

function linkRecrutamento(celular: string): string {
  return `https://wa.me/558591522980?text=VimPelo_${celular.replace(/\D/g, '')}`;
}

export const MESSAGES_MILITANCIA = {
  // ---- Primeiro contato (usuário não cadastrado, primeira mensagem) ----
  WELCOME_FIRST_CONTACT: `👋 Ola! Esse é o canal direto do *${CAMPANHA_NOME}*.

Sua participação aqui ajuda a transformar nosso estado.

O que você quer fazer?

1️⃣ Participar da missão
2️⃣ Ver publicações e eventos`,

  // ---- Segundo contato (retornou, ainda não cadastrado) ----
  WELCOME_SECOND_CONTACT: `👋 De volta por aqui!

Você está a um passo de participar da missão — vale concluir!

1️⃣ Concluir meu cadastro
2️⃣ Ver novidades e eventos`,

  // ---- Consentimento LGPD (antes de iniciar o cadastro) ----
  LGPD_CONSENTIMENTO: `Olá! Aqui é o ${CAMPANHA_NOME}. 🕵️‍♂️🇧🇷

Conforme a Lei Geral de Proteção de Dados, antes de continuarmos:
Você autoriza nossa equipe a salvar seus dados para fins de contato com a equipe do Delegado?

Caso deseje que seus dados sejam retirados, basta solicitar no menu.`,

  LGPD_BOTAO_SIM: 'Sim, eu autorizo',
  LGPD_BOTAO_NAO: 'Não autorizo',

  LGPD_RECUSADO: `Tudo bem, entendemos! 🙏

Vamos ficar por aqui esperando — quando quiser, é só voltar e digitar *menu*.`,

  // ---- Mostrar publicação ou evento para não-cadastrados ----
  PUBLICACAO: (publicacao: PublicacaoItem) => {
    let msg = `📢 *${publicacao.rede}*\n\n${publicacao.texto}`;
    if (publicacao.link) msg += `\n${publicacao.link}`;
    msg += `\n\n_Encaminhe para 3 pessoas e amplie o movimento_ 📲`;
    return msg;
  },

  MOSTRAR_EVENTO: (evento: EventoItem) => {
    let msg = `📅 *Evento*\n\n${evento.texto}`;
    if (evento.data || evento.hora) {
      msg += '\n\n🗓';
      if (evento.data) msg += ` ${evento.data}`;
      if (evento.hora) msg += ` às ${evento.hora}`;
    }
    if (evento.local) msg += `\n📍 ${evento.local}`;
    return msg;
  },

  MOSTRAR_NOVIDADES_FALLBACK: `📢 Ainda não há novidades cadastradas.

Em breve chegarão publicações e eventos — você será avisado!

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

Se foi indicação de alguém, envie o *telefone* da pessoa (só números, ex: *85984321244*)

🌐 Se veio pelas redes sociais, informe qual (ex: *Instagram*, *Facebook*, *TikTok*)

_Digite *0* para pular._`,

  CADASTRO_SUCESSO: (nome: string) => `🎉 *Bem-vindo ao movimento, ${nome}!*

Cada pessoa faz diferença! 💪

${MESSAGES_MILITANCIA.MENU_PERSONALIZADO(nome)}`,

  ERRO_CADASTRO: `⚠️ Não consegui salvar. Por favor, tente enviar novamente.`,

  // Menu principal (personalizado para usuário cadastrado)
  MENU_PERSONALIZADO: (nome: string) => `👋 Olá, *${nome}*!

O que você quer fazer hoje?

1️⃣ Missão do dia
2️⃣ Publicações recentes
3️⃣ Próximos eventos
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais
6️⃣ Como recrutar
7️⃣ Minha comunidade`,

  // Gatilho de retorno — enviado a militantes inativos dentro da janela de 24h do WhatsApp
  LEMBRETE_RETORNO: (nome: string) => `👋 Oi, *${nome}*! Faz um tempinho que você não aparece por aqui.

A missão de hoje ainda te espera — vamos continuar juntos? 💪

Digite *menu* para ver as opções.`,

  // Menu principal (sem nome, para compatibilidade e casos de uso genérico)
  MENU: `✊ *${CAMPANHA_NOME}*

O que você quer fazer?

1️⃣ Missão do dia
2️⃣ Publicações recentes
3️⃣ Próximos eventos
4️⃣ Fazer uma denúncia
5️⃣ Quero contribuir mais
6️⃣ Como recrutar
7️⃣ Minha comunidade`,

  // 1 - Missão do dia
  MISSAO: (missaoTexto: string) => `🚀 *MISSÃO DE HOJE*

${missaoTexto}

---
Já concluiu?

1️⃣ *Sim, fiz!* — para registrar como concluída
2️⃣ *Ainda não* — para registrar e voltar depois`,

  MISSAO_CONCLUIDA: `✅ *Missão feita! Obrigado por participar.*

Digite *menu* para continuar.`,

  MISSAO_PENDENTE: `⏳ *Missão pendente.*

Quando fizer, acesse *1 – Missão do dia* para registrar. 🎯

Digite *menu* para continuar.`,

  MISSAO_JA_FEITA: `✅ *Você já registrou a missão de hoje!*

Volte mais tarde para a próxima missão. 🎯

Digite *menu* para ver outras opções.`,

  // 4 - Denúncia
  DENUNCIA_INICIO: `🚨 *Enviar Denúncia*

Registrar um problema é um ato cívico. Obrigado!

Em qual *bairro* está o problema?`,

  PEDIR_DESCRICAO_DENUNCIA: `📝 *Descreva o problema com detalhes:*

_O que é? Onde fica? Há quanto tempo?_`,

  DENUNCIA_REGISTRADA: (protocolo: string) => `✅ *Denúncia registrada!*

🔖 Protocolo: *#${protocolo}*

Equipe notificada. Obrigado por fiscalizar sua comunidade! 🌟

Digite *menu* para continuar.`,

  // 5 - Quero contribuir mais
  CONTRIBUIR_INTRO: `🙌 *Que atitude!*

Você é o tipo de pessoa que faz o movimento crescer.

💰 Quer ajudar com uma contribuição financeira? Acesse nossa vaquinha:
👉 ${LINK_VAQUINHA}

_Contribuições acima de R$ 1.000 são registradas — nossa equipe entrará em contato para alinhar os detalhes._

Além da vaquinha, como mais você quer contribuir?`,

  LIDERANCA_OPCOES: `1️⃣ Vaquinha — já mostrada acima 💰
2️⃣ Liderança — organizar reuniões no meu bairro
3️⃣ Grupo de trabalho — pesquisas e estratégia
4️⃣ Outros

_Não está nas opções? Escreva o que você quer fazer! Qualquer contribuição é bem-vinda 💚_`,

  LIDERANCA_REGISTRADA: `✅ *Registrado!*

Entraremos em contato em breve para alinhar os próximos passos.

Obrigado por querer fazer mais pelo movimento! 💪

Digite *menu* para continuar.`,

  // 6 - Como recrutar
  COMO_RECRUTAR_1: `🚀 QUER AJUDAR EM NOSSO CRESCIMENTO?`,

  COMO_RECRUTAR_2: (celular: string) => `Fala, irmão! Estou ajudando o Delegado Huggo a fiscalizar os problemas reais do nosso estado pelo WhatsApp dele. Entra aí também para fazer sua denúncia e ajudar a mudar o Ceará. Clica no link:
👉 ${linkRecrutamento(celular)}`,

  // 7 - Minha comunidade
  MINHA_COMUNIDADE: `📲 *Minha comunidade*

Entre no nosso grupo da comunidade no WhatsApp:
👉 ${LINK_COMUNIDADE}`,

  // Fallback
  COMANDO_NAO_RECONHECIDO: `🤔 Não entendi essa mensagem.

Digite *menu* para ver todas as opções disponíveis.`,
};
