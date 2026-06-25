/**
 * MilitanciaManager
 * ──────────────────────────────────────────────────────────────────────────────
 * Contém toda a lógica de conversa do bot do Comando Digital do Delegado Huggo.
 *
 * É chamado pelo ConversationManager para cada mensagem recebida.
 * Retorna `true` se o estado da conversa mudou e precisa ser persistido.
 * Retorna `false` quando só enviou uma resposta sem mudar o estado (ex: menu).
 *
 * Fluxos suportados:
 * ─────────────────
 *  Cadastro (orientado pela planilha):
 *    Novo contato → consentimento LGPD → nome → bairro → cidade → origem → menu
 *
 *  Fluxos multi-passo (via militanciaStage na conversa):
 *    lgpd_consentimento   → coleta autorização LGPD antes do cadastro
 *    missao_resposta      → registra resposta da missão do dia
 *    lideranca_area       → registra área de interesse em contribuir
 *    denuncia_bairro       → coleta bairro da denúncia
 *    denuncia_descricao   → coleta descrição e finaliza denúncia
 *
 *  v1: missão, eventos e publicações vêm de um JSON hardcoded
 *  (src/data/militanciaConteudo.json), não mais da planilha. Apenas dados de
 *  pessoas (cadastro, denúncia, liderança) continuam no Google Sheets.
 *  Gamificação (pontos, nível, streak, conquistas, ranking) fica parada nesta
 *  versão — o código continua existindo em militanciaSheet.ts, só não é mais
 *  chamado por aqui.
 */

import { WhatsApp } from '../wabapi';
import { InlineKeyboard } from '../wabapi';
import { normalizarTexto } from '../utils/text-normalizer';
import { logger } from '../utils/logger';
import {
  buscarMilitante,
  isCadastroCompleto,
  registrarContato,
  atualizarCamposMilitante,
  atualizarDataCadastro,
  atualizarUltimaInteracao,
  registrarOrigem,
  registrarConsentimentoLgpd,
  registrarMissaoConcluida,
  verificarMissaoConcluida,
  registrarInteresseLideranca,
  registrarDenuncia,
  listarMilitantesParaLembrete,
  type MilitanteInfo,
} from '../utils/militanciaSheet';
import {
  obterMissaoAtual,
  obterPublicacoesRecentes,
  obterProximosEventos,
} from '../data/militanciaConteudo';
import { MESSAGES_MILITANCIA } from './militanciaMessages';
import type { Conversation } from './ConversationManager';

const REGEX_VIM_PELO = /VimPelo_(\d+)/i;

// Número autorizado a disparar o gatilho de retorno ("LEMBRAR").
const ADMIN_PHONE = '558597223863';

function isAdminPhone(celular: string): boolean {
  const digits = celular.replace(/\D/g, '');
  return digits === ADMIN_PHONE || `55${digits}` === ADMIN_PHONE || digits === ADMIN_PHONE.slice(2);
}

export class MilitanciaManager {
  private client: WhatsApp;

  constructor(client: WhatsApp) {
    this.client = client;
  }

  private log(msg: string): void {
    logger.info('Militancia', msg);
  }

  /**
   * Ponto de entrada principal — processa uma mensagem recebida.
   *
   * Muta o objeto `conversa` quando o state muda (ex: avança um stage).
   * Retorna `true` quando o estado foi alterado e precisa ser persistido no Redis.
   * Retorna `false` quando só enviou uma resposta sem mudar o estado (ex: menu).
   */
  async processar(celular: string, texto: string, conversa: Conversation): Promise<boolean> {
    // Guard: se a conversa está em modo humano, o operador responde manualmente — bot fica em silêncio.
    if (conversa.isHuman) return false;

    const textoNorm = normalizarTexto(texto).trim();

    // Gatilho de retorno: o número admin envia "LEMBRAR" para disparar a mensagem
    // de retorno a militantes cuja última interação está há menos de 22h (dentro
    // da janela de 24h de mensagens do WhatsApp, com margem de segurança).
    if (textoNorm === 'lembrar' && isAdminPhone(celular)) {
      await this.dispararLembreteRetorno(celular);
      return false;
    }
    const isOpcao1 = ['1', 'cadastro', 'cadastrar', 'quero me cadastrar'].includes(textoNorm);
    const isOpcao2 = ['2', 'novidades', 'acompanhar'].includes(textoNorm);
    conversa.militanciaData = conversa.militanciaData || {};

    if (conversa.militanciaStage) {
      if (['cadastro_nome', 'cadastro_bairro', 'cadastro_cidade'].includes(conversa.militanciaStage)) {
        // Stages legados de cadastro: limpa e deixa cair no fluxo derivado da planilha
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
      } else {
        return await this.processarStage(celular, texto, textoNorm, conversa);
      }
    }

    const militante = await buscarMilitante(celular);

    // Case 1: fully registered
    if (militante && isCadastroCompleto(militante)) {
      return await this.processarMenuOuComando(celular, texto, textoNorm, conversa, militante);
    }

    // Case 2: registration in progress — derive step from sheet data
    if (militante) {
      const cadastroIniciado = conversa.militanciaData.cadastroIniciado === true;

      if (!cadastroIniciado) {
        if (isOpcao2) {
          await this.enviarConteudoEEvento(celular);
          return true;
        }
        if (isOpcao1) {
          return await this.iniciarLgpdOuCadastro(celular, militante, conversa);
        }

        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_SECOND_CONTACT);
        return true;
      }

      if (!militante.nome?.trim()) {
        if (isOpcao1 || MilitanciaManager.isSaudacao(textoNorm)) {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
          return true;
        }
        if (isOpcao2) {
          await this.enviarConteudoEEvento(celular);
          return true;
        }
        const okNome = await atualizarCamposMilitante(celular, { nome: texto.trim() });
        await this.client.sendMessage(
          celular,
          okNome ? MESSAGES_MILITANCIA.PEDIR_BAIRRO : MESSAGES_MILITANCIA.ERRO_CADASTRO
        );
        return true;
      }

      if (!militante.bairro?.trim()) {
        if (MilitanciaManager.isSaudacao(textoNorm) || isOpcao1) {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_BAIRRO);
          return true;
        }
        if (isOpcao2) {
          await this.enviarConteudoEEvento(celular);
          return true;
        }
        const okBairro = await atualizarCamposMilitante(celular, { bairro: texto.trim() });
        await this.client.sendMessage(
          celular,
          okBairro ? MESSAGES_MILITANCIA.PEDIR_CIDADE : MESSAGES_MILITANCIA.ERRO_CADASTRO
        );
        return true;
      }

      // nome + bairro filled → collecting cidade
      if (!militante.cidade?.trim() && (MilitanciaManager.isSaudacao(textoNorm) || isOpcao1)) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_CIDADE);
        return true;
      }
      if (!militante.cidade?.trim() && isOpcao2) {
        await this.enviarConteudoEEvento(celular);
        return true;
      }
      const ok = await atualizarCamposMilitante(celular, { cidade: texto.trim() });
      if (ok) {
        // Awaited so a próxima etapa só roda depois do cadastro salvo
        await atualizarDataCadastro(celular).catch(() => {});
        const recrutadoPor = conversa.militanciaData.recrutadoPor;
        if (recrutadoPor) {
          conversa.militanciaStage = undefined;
          conversa.militanciaData = {};
          registrarOrigem(celular, recrutadoPor).catch(() => {});
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CADASTRO_SUCESSO(texto.trim()));
          atualizarUltimaInteracao(celular).catch(() => {});
        } else {
          conversa.militanciaStage = 'cadastro_origem';
          conversa.militanciaData = {};
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_ORIGEM);
        }
      } else {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.ERRO_CADASTRO);
      }
      return true;
    }

    // Case 3: phone not in sheet → save first contact and show welcome options
    const contatoOk = await registrarContato(celular).catch((err) => {
      this.log(`⚠️ Erro ao registrar contato no primeiro acesso: ${err?.message}`);
      return false;
    });

    if (!contatoOk) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.ERRO_CADASTRO);
      return true;
    }

    // Atalho: a primeira mensagem pode vir no formato "VimPelo_<telefone>",
    // preenchido automaticamente pelo link de recrutamento. Quando detectado,
    // pula a tela de boas-vindas e vai direto para o consentimento LGPD.
    const vimPeloMatch = texto.match(REGEX_VIM_PELO);
    if (vimPeloMatch) {
      conversa.militanciaData.recrutadoPor = vimPeloMatch[1];
      const militanteNovo = await buscarMilitante(celular);
      return await this.iniciarLgpdOuCadastro(celular, militanteNovo, conversa);
    }

    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_FIRST_CONTACT);
    return true;
  }

  /**
   * Common greeting words (normalized, no diacritics) that should restart
   * the conversation instead of being treated as registration input.
   */
  private static readonly SAUDACOES = [
    'ola', 'oi', 'hello', 'hi', 'hey',
    'bom dia', 'boa tarde', 'boa noite',
    'inicio', 'iniciar', 'comecar', 'recomecar', 'reiniciar', 'voltar',
  ];

  private static isSaudacao(textoNorm: string): boolean {
    return MilitanciaManager.SAUDACOES.includes(textoNorm);
  }

  /**
   * Inicia o cadastro: se o consentimento LGPD ainda não foi dado, pede
   * primeiro; caso já tenha sido dado (ex: usuário que recomeçou), segue
   * direto para a coleta de nome.
   */
  private async iniciarLgpdOuCadastro(
    celular: string,
    militante: MilitanteInfo | null,
    conversa: Conversation
  ): Promise<boolean> {
    conversa.militanciaData = conversa.militanciaData || {};
    conversa.militanciaData.cadastroIniciado = true;

    if (militante?.consentimentoLgpd) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
      return true;
    }

    conversa.militanciaStage = 'lgpd_consentimento';
    const keyboard = new InlineKeyboard([
      MESSAGES_MILITANCIA.LGPD_BOTAO_SIM,
      MESSAGES_MILITANCIA.LGPD_BOTAO_NAO,
    ]);
    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LGPD_CONSENTIMENTO, {
      replyMarkup: keyboard,
    });
    return true;
  }

  /**
   * Processa a mensagem quando há um fluxo multi-passo ativo (stage).
   */
  private async processarStage(
    celular: string,
    texto: string,
    textoNorm: string,
    conversa: Conversation
  ): Promise<boolean> {
    conversa.militanciaData = conversa.militanciaData || {};

    switch (conversa.militanciaStage) {
      // ---- LGPD consent step ----
      case 'lgpd_consentimento': {
        conversa.militanciaStage = undefined;
        const autorizou = textoNorm.includes('autorizo') && !textoNorm.includes('nao autorizo') && !textoNorm.startsWith('nao');
        if (autorizou) {
          registrarConsentimentoLgpd(celular).catch(() => {});
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
        } else {
          conversa.militanciaData = {};
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LGPD_RECUSADO);
        }
        return true;
      }

      // ---- Registration origin step ----
      case 'cadastro_origem': {
        const origemTexto = texto.trim();
        const pulou = ['0', 'nao', 'nao sei', 'pular', 'skip', 'nenhum', 'nenhuma'].includes(textoNorm);
        conversa.militanciaStage = undefined;
        if (!pulou && origemTexto) {
          registrarOrigem(celular, origemTexto).catch(() => {});
        }
        const militantePos = await buscarMilitante(celular);
        await this.client.sendMessage(
          celular,
          MESSAGES_MILITANCIA.CADASTRO_SUCESSO(militantePos?.nome || '')
        );
        atualizarUltimaInteracao(celular).catch(() => {});
        return true;
      }

      // ---- Mission response ----
      case 'missao_resposta': {
        const missao = conversa.militanciaData?.missao;
        const fezMissao = this.detectarRespostaMissao(textoNorm) === 'concluído';
        conversa.militanciaStage = undefined;

        if (fezMissao && missao?.id) {
          await registrarMissaoConcluida(celular, missao.id);
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO_CONCLUIDA);
        } else {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO_PENDENTE);
        }
        return true;
      }

      // ---- Leadership / contribution flow ----
      case 'lideranca_area': {
        const areas: Record<string, string> = {
          '1': 'Vaquinha',
          '2': 'Liderança / organizar reuniões no meu bairro',
          '3': 'Grupo de trabalho',
          '4': 'Outros',
        };
        const area = areas[textoNorm] || texto.trim();
        const militante = await buscarMilitante(celular);
        await registrarInteresseLideranca(
          militante?.nome || '',
          celular,
          militante?.bairro || '',
          area,
          ''
        );
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_REGISTRADA);
        return true;
      }

      // ---- Complaint flow ----
      case 'denuncia_bairro': {
        conversa.militanciaData.bairro = texto.trim();
        conversa.militanciaStage = 'denuncia_descricao';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_DESCRICAO_DENUNCIA);
        return true;
      }

      case 'denuncia_descricao': {
        const bairro = conversa.militanciaData.bairro || '';
        const descricao = texto.trim();
        const protocolo = await registrarDenuncia(celular, bairro, descricao);
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DENUNCIA_REGISTRADA(protocolo));
        return true;
      }

      default:
        conversa.militanciaStage = undefined;
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU);
        atualizarUltimaInteracao(celular).catch(() => {});
        return true;
    }
  }

  /**
   * Processa seleções do menu principal e comandos globais para militantes cadastrados.
   *
   * Opções do menu:
   *   1 → Missão do dia
   *   2 → Publicações recentes
   *   3 → Próximos eventos
   *   4 → Fazer uma denúncia
   *   5 → Quero contribuir mais
   *   6 → Como recrutar
   *   7 → Minha comunidade
   */
  private async processarMenuOuComando(
    celular: string,
    texto: string,
    textoNorm: string,
    conversa: Conversation,
    militante: MilitanteInfo
  ): Promise<boolean> {
    // Global commands
    if (['menu', 'ajuda', 'help', 'inicio', 'início', 'voltar'].includes(textoNorm)) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome));
      atualizarUltimaInteracao(celular).catch(() => {});
      return false;
    }

    // Option 1 - Mission
    if (['1', 'missao', 'missão', 'missao de hoje', 'missão de hoje'].includes(textoNorm)) {
      const missao = obterMissaoAtual();
      if (!missao) {
        await this.client.sendMessage(celular, 'A missão de hoje ainda não foi configurada. Tente novamente mais tarde.\n\nDigite *menu* para ver outras opções.');
        return false;
      }
      const jaConcluiu = await verificarMissaoConcluida(celular, missao.id);
      if (jaConcluiu) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO_JA_FEITA);
        return false;
      }
      conversa.militanciaStage = 'missao_resposta';
      conversa.militanciaData = { missao: { id: missao.id } };
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO(missao.texto));
      return true;
    }

    // Option 2 - Publicações recentes
    if (
      ['2', 'publicacao', 'publicação', 'publicacoes', 'publicações', 'conteudo', 'conteúdo'].includes(textoNorm)
    ) {
      const publicacoes = obterPublicacoesRecentes();
      if (!publicacoes.length) {
        await this.client.sendMessage(celular, 'Não há publicações cadastradas no momento.\n\nDigite *menu* para ver outras opções.');
        return false;
      }
      for (const p of publicacoes) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PUBLICACAO(p));
      }
      return false;
    }

    // Option 3 - Próximos eventos
    if (
      ['3', 'eventos', 'evento', 'proximos eventos'].includes(textoNorm)
    ) {
      const eventos = obterProximosEventos(3);
      if (!eventos.length) {
        await this.client.sendMessage(celular, 'Não há eventos próximos cadastrados no momento.\n\nDigite *menu* para ver outras opções.');
        return false;
      }
      for (const ev of eventos) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_EVENTO(ev));
      }
      return false;
    }

    // Option 4 - Complaint
    if (
      ['4', 'denuncia', 'denúncia', 'enviar denuncia', 'enviar denúncia'].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'denuncia_bairro';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DENUNCIA_INICIO);
      return true;
    }

    // Option 5 - Quero contribuir mais
    if (
      [
        '5',
        'contribuir',
        'lideranca',
        'liderança',
        'quero contribuir',
        'quero ajudar',
      ].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'lideranca_area';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CONTRIBUIR_INTRO);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_OPCOES);
      return true;
    }

    // Option 6 - Como recrutar
    if (['6', 'recrutar', 'como recrutar'].includes(textoNorm)) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.COMO_RECRUTAR_1);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.COMO_RECRUTAR_2(celular));
      return false;
    }

    // Option 7 - Minha comunidade
    if (['7', 'comunidade', 'minha comunidade'].includes(textoNorm)) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MINHA_COMUNIDADE);
      return false;
    }

    // Unrecognized - show personalized menu
    this.log(`⚠️ Comando não reconhecido: "${texto.substring(0, 50)}"`);
    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome));
    atualizarUltimaInteracao(celular).catch(() => {});
    return false;
  }

  /**
   * Gatilho de retorno: envia MESSAGES_MILITANCIA.LEMBRETE_RETORNO a todo militante
   * cuja última interação está há menos de 22h (dentro da janela de 24h de
   * mensagens do WhatsApp, com margem de segurança). Disparado manualmente pelo
   * número admin enviando "LEMBRAR".
   */
  private async dispararLembreteRetorno(celularAdmin: string): Promise<void> {
    const militantes = await listarMilitantesParaLembrete(22);
    let enviados = 0;
    for (const militante of militantes) {
      try {
        await this.client.sendMessage(militante.celular, MESSAGES_MILITANCIA.LEMBRETE_RETORNO(militante.nome));
        enviados++;
      } catch (err: any) {
        this.log(`❌ Erro ao enviar lembrete para ${militante.celular}: ${err?.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await this.client.sendMessage(celularAdmin, `✅ Lembrete enviado para ${enviados}/${militantes.length} militante(s).`);
  }

  /**
   * Fetch and send latest publication AND nearest event to non-registered users (option 2)
   */
  private async enviarConteudoEEvento(celular: string): Promise<void> {
    try {
      const publicacao = obterPublicacoesRecentes()[0] ?? null;
      const evento = obterProximosEventos(1)[0] ?? null;

      if (publicacao) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PUBLICACAO(publicacao));
      }
      if (evento) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_EVENTO(evento));
      }
      if (!publicacao && !evento) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_NOVIDADES_FALLBACK);
      }
    } catch (err: any) {
      this.log(`❌ Erro ao enviar publicação e evento: ${err?.message}`);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_NOVIDADES_FALLBACK);
    }
  }

  /**
   * Detect whether a mission response means "completed" or "pending"
   */
  private detectarRespostaMissao(textoNorm: string): 'concluído' | 'pendente' {
    const concluidos = ['1', 'ja fiz', 'ja', 'fiz', 'concluido', 'concluído', 'feito', 'ok', '✅', 'sim'];
    if (concluidos.some((c) => textoNorm === c || textoNorm.startsWith(c))) {
      return 'concluído';
    }
    return 'pendente';
  }
}
