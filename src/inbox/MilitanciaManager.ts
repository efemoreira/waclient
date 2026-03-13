/**
 * Gerenciador do bot de militância política
 * Central de Mobilização da Militância
 *
 * Handles all conversation flows:
 * - Member registration
 * - Daily mission
 * - Upcoming events
 * - New content
 * - Leadership interest
 * - Neighborhood panel
 * - Complaints
 */

import { WhatsApp } from '../wabapi';
import { normalizarTexto } from '../utils/text-normalizer';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  buscarMilitante,
  registrarMilitante,
  atualizarUltimaInteracao,
  registrarRespostaMissao,
  registrarAcessoConteudo,
  registrarConfirmacaoEvento,
  registrarInteresseLideranca,
  registrarDenuncia,
  obterPainelBairro,
  obterRankingBairros,
  nomeDoNivel,
  type MilitanteInfo,
} from '../utils/militanciaSheet';
import { MESSAGES_MILITANCIA } from './militanciaMessages';
import type { Conversation } from './ConversationManager';

export class MilitanciaManager {
  private client: WhatsApp;

  constructor(client: WhatsApp) {
    this.client = client;
  }

  private log(msg: string): void {
    logger.info('Militancia', msg);
  }

  /**
   * Process incoming message.
   * Mutates `conversa` state as needed.
   * Returns true if the conversation state needs to be persisted.
   */
  async processar(celular: string, texto: string, conversa: Conversation): Promise<boolean> {
    const textoNorm = normalizarTexto(texto).trim();

    // Continue a multi-step flow if one is active
    if (conversa.militanciaStage) {
      return await this.processarStage(celular, texto, textoNorm, conversa);
    }

    // Check if user is registered
    const militante = await buscarMilitante(celular);
    if (!militante) {
      conversa.militanciaStage = 'cadastro_nome';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW);
      return true;
    }

    // Update last interaction (fire-and-forget)
    atualizarUltimaInteracao(celular).catch(() => {});

    // Process menu selection or show menu
    return await this.processarMenuOuComando(celular, texto, textoNorm, conversa, militante);
  }

  /**
   * Handle messages when a multi-step flow is active
   */
  private async processarStage(
    celular: string,
    texto: string,
    textoNorm: string,
    conversa: Conversation
  ): Promise<boolean> {
    conversa.militanciaData = conversa.militanciaData || {};

    switch (conversa.militanciaStage) {
      // ---- Registration flow ----
      case 'cadastro_nome': {
        conversa.militanciaData.nome = texto.trim();
        conversa.militanciaStage = 'cadastro_bairro';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_BAIRRO);
        return true;
      }

      case 'cadastro_bairro': {
        const nome = conversa.militanciaData.nome || '';
        const bairro = texto.trim();
        const ok = await registrarMilitante(nome, celular, bairro);
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        if (ok) {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CADASTRO_SUCESSO(nome));
        } else {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.ERRO_CADASTRO);
        }
        return true;
      }

      // ---- Mission response ----
      case 'missao_resposta': {
        const missaoDia = config.militancia.missaoDia;
        const status = this.detectarRespostaMissao(textoNorm);
        await registrarRespostaMissao(celular, missaoDia, status);
        conversa.militanciaStage = undefined;
        const resposta =
          status === 'concluído'
            ? MESSAGES_MILITANCIA.MISSAO_CONCLUIDA
            : MESSAGES_MILITANCIA.MISSAO_PENDENTE;
        await this.client.sendMessage(celular, resposta);
        return true;
      }

      // ---- Event confirmation ----
      case 'evento_confirmacao': {
        const evento = config.militancia.proximosEventos;
        let confirmacao: 'sim' | 'talvez' = 'talvez';
        if (['1', 'sim', 'vou', 'vou sim', 'sim vou'].some((k) => textoNorm.includes(k))) {
          confirmacao = 'sim';
        }
        await registrarConfirmacaoEvento(celular, evento, confirmacao);
        conversa.militanciaStage = undefined;
        const label = confirmacao === 'sim' ? 'confirmada' : 'talvez';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.EVENTO_CONFIRMADO(label));
        return true;
      }

      // ---- Leadership flow ----
      case 'lideranca_area': {
        const areas: Record<string, string> = {
          '1': 'Liderar meu bairro',
          '2': 'Organizar reuniões',
          '3': 'Ajudar na comunicação',
          '4': 'Ajudar nos eventos',
          '5': 'Ajudar online',
        };
        conversa.militanciaData.area = areas[textoNorm] || texto.trim();
        conversa.militanciaStage = 'lideranca_disponibilidade';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_DISPONIBILIDADE);
        return true;
      }

      case 'lideranca_disponibilidade': {
        const militante = await buscarMilitante(celular);
        await registrarInteresseLideranca(
          militante?.nome || '',
          celular,
          militante?.bairro || '',
          conversa.militanciaData.area || '',
          texto.trim()
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
        conversa.militanciaData.descricao = texto.trim();
        conversa.militanciaStage = 'denuncia_foto';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_FOTO_DENUNCIA);
        return true;
      }

      case 'denuncia_foto': {
        const bairro = conversa.militanciaData.bairro || '';
        const descricao = conversa.militanciaData.descricao || '';
        const semMidia = ['nao', 'não', 'n', 'no'].includes(textoNorm);
        const linkMidia = semMidia ? undefined : texto.trim();
        await registrarDenuncia(celular, bairro, descricao, linkMidia);
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DENUNCIA_REGISTRADA);
        return true;
      }

      // ---- Neighborhood panel bairro input ----
      case 'painel_bairro': {
        const bairro = texto.trim();
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.enviarPainelBairro(celular, bairro);
        return true;
      }

      default:
        conversa.militanciaStage = undefined;
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU);
        return true;
    }
  }

  /**
   * Process menu selections and global commands for registered members
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
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU);
      return false;
    }

    if (['perfil', 'meu perfil', 'pontos', 'nivel', 'nível'].includes(textoNorm)) {
      await this.client.sendMessage(
        celular,
        MESSAGES_MILITANCIA.PERFIL({
          nome: militante.nome,
          bairro: militante.bairro,
          nivel: militante.nivel,
          nomeNivel: nomeDoNivel(militante.nivel),
          pontos: militante.pontos,
        })
      );
      return false;
    }

    // Option 1 - Mission
    if (['1', 'missao', 'missão', 'missao de hoje', 'missão de hoje'].includes(textoNorm)) {
      conversa.militanciaStage = 'missao_resposta';
      const missaoTexto = config.militancia.missaoDia;
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO(missaoTexto));
      return true;
    }

    // Option 2 - Events
    if (
      ['2', 'eventos', 'evento', 'proximos eventos', 'próximos eventos'].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'evento_confirmacao';
      const eventosTexto = config.militancia.proximosEventos;
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.EVENTOS(eventosTexto));
      return true;
    }

    // Option 3 - Content
    if (
      ['3', 'conteudo', 'conteúdo', 'novo conteudo', 'novo conteúdo'].includes(textoNorm)
    ) {
      const conteudoTexto = config.militancia.novoConteudo;
      const conteudoTipo = config.militancia.novoConteudoTipo;
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CONTEUDO(conteudoTexto));
      // Register content access (fire-and-forget)
      registrarAcessoConteudo(celular, conteudoTexto, conteudoTipo).catch(() => {});
      return false;
    }

    // Option 4 - Leadership
    if (
      [
        '4',
        'lideranca',
        'liderança',
        'responsabilidade',
        'quero liderar',
        'quero ajudar',
      ].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'lideranca_area';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_MENU);
      return true;
    }

    // Option 5 - Neighborhood panel
    if (
      ['5', 'painel', 'bairro', 'painel do meu bairro', 'meu bairro'].includes(textoNorm)
    ) {
      if (militante.bairro) {
        await this.enviarPainelBairro(celular, militante.bairro);
        return false;
      }
      // Ask for neighborhood if not registered
      conversa.militanciaStage = 'painel_bairro';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, '📍 Qual é o seu *bairro*?');
      return true;
    }

    // Option 6 - Complaint
    if (
      ['6', 'denuncia', 'denúncia', 'enviar denuncia', 'enviar denúncia'].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'denuncia_bairro';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DENUNCIA_INICIO);
      return true;
    }

    // Unrecognized - show menu
    this.log(`⚠️ Comando não reconhecido: "${texto.substring(0, 50)}"`);
    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.COMANDO_NAO_RECONHECIDO);
    return false;
  }

  /**
   * Fetch and send neighborhood panel data
   */
  private async enviarPainelBairro(celular: string, bairro: string): Promise<void> {
    try {
      const [painel, ranking] = await Promise.all([
        obterPainelBairro(bairro),
        obterRankingBairros(),
      ]);
      const painelMsg = MESSAGES_MILITANCIA.PAINEL_BAIRRO(painel);
      const rankingMsg = MESSAGES_MILITANCIA.PAINEL_RANKING(ranking);
      await this.client.sendMessage(celular, `${painelMsg}\n\n${rankingMsg}\n\nDigite *menu* para voltar.`);
    } catch (err: any) {
      this.log(`❌ Erro ao obter painel: ${err?.message}`);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PAINEL_ERRO);
    }
  }

  /**
   * Detect whether a mission response means "completed" or "pending"
   */
  private detectarRespostaMissao(textoNorm: string): 'concluído' | 'pendente' {
    const concluidos = ['ja fiz', 'ja', 'fiz', 'concluido', 'concluído', 'feito', 'ok', '✅', 'sim'];
    if (concluidos.some((c) => textoNorm === c || textoNorm.startsWith(c))) {
      return 'concluído';
    }
    return 'pendente';
  }
}
