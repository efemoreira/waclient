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
  isCadastroCompleto,
  registrarMilitante,
  atualizarUltimaInteracao,
  registrarRespostaMissao,
  registrarAcessoConteudo,
  registrarConfirmacaoEvento,
  registrarInteresseLideranca,
  registrarDenuncia,
  obterPainelBairro,
  obterRankingBairros,
  obterUltimoConteudo,
  obterProximoEvento,
  obterDashboardPessoal,
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

    // Case 1: Registered user with complete profile (nome + bairro + cidade)
    if (militante && isCadastroCompleto(militante)) {
      // Update last interaction (fire-and-forget)
      atualizarUltimaInteracao(celular).catch(() => {});
      return await this.processarMenuOuComando(celular, texto, textoNorm, conversa, militante);
    }

    // Cases 2 & 3: phone not in sheet, OR in sheet but with incomplete profile.
    // Both cases are treated identically: non-registered flow based on contact history.
    // Distinguish first vs returning contact by checking conversation history.
    const isFirstContact = conversa.messages.length <= 1;

    if (isFirstContact) {
      // First ever interaction — offer registration or follow
      conversa.militanciaStage = 'welcome_opcao';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_FIRST_CONTACT);
      return true;
    } else {
      // Returning user that has not yet completed registration
      conversa.militanciaStage = 'segundo_contato_opcao';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_SECOND_CONTACT);
      return true;
    }
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
      // ---- First contact: user chooses register (1) or follow (2) ----
      case 'welcome_opcao': {
        if (['1', 'cadastro', 'cadastrar', 'quero me cadastrar'].includes(textoNorm)) {
          conversa.militanciaStage = 'cadastro_nome';
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
          return true;
        }
        // Default to showing news (option 2 or any other response)
        conversa.militanciaStage = undefined;
        await this.enviarNovidades(celular);
        return true;
      }

      // ---- Second contact: user chooses register (1) or see news (2) ----
      case 'segundo_contato_opcao': {
        if (['1', 'cadastro', 'cadastrar', 'quero me cadastrar'].includes(textoNorm)) {
          conversa.militanciaStage = 'cadastro_nome';
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
          return true;
        }
        // Default to showing news (option 2 or any other response)
        conversa.militanciaStage = undefined;
        await this.enviarNovidades(celular);
        return true;
      }

      // ---- Registration flow ----
      case 'cadastro_nome': {
        conversa.militanciaData.nome = texto.trim();
        conversa.militanciaStage = 'cadastro_bairro';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_BAIRRO);
        return true;
      }

      case 'cadastro_bairro': {
        conversa.militanciaData.bairro = texto.trim();
        conversa.militanciaStage = 'cadastro_cidade';
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_CIDADE);
        return true;
      }

      case 'cadastro_cidade': {
        const nome = conversa.militanciaData.nome || '';
        const bairro = conversa.militanciaData.bairro || '';
        const cidade = texto.trim();
        const ok = await registrarMilitante(nome, celular, bairro, cidade);
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

      // ---- Leadership / responsibility flow ----
      case 'lideranca_area': {
        const areas: Record<string, string> = {
          '1': 'Fazer uma doação',
          '2': 'Organizar reuniões no meu bairro',
          '3': 'Ajudar com minha experiência profissional',
          '4': 'Participar de pesquisas e estratégias',
        };
        const area = areas[textoNorm] || texto.trim();
        const militante = await buscarMilitante(celular);
        await registrarInteresseLideranca(
          militante?.nome || '',
          celular,
          militante?.bairro || '',
          area,
          '' // availability is no longer collected in the new flow
        );
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_REGISTRADA);
        return true;
      }

      // Backward-compat: availability stage from old flow
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
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome));
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
      ['3', 'conteudo', 'conteúdo', 'conteudos', 'conteúdos', 'novo conteudo', 'novo conteúdo'].includes(textoNorm)
    ) {
      const conteudoTexto = config.militancia.novoConteudo;
      const conteudoTipo = config.militancia.novoConteudoTipo;
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CONTEUDO(conteudoTexto));
      // Register content access (fire-and-forget)
      registrarAcessoConteudo(celular, conteudoTexto, conteudoTipo).catch(() => {});
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

    // Option 5 - Leadership / responsibility
    if (
      [
        '5',
        'lideranca',
        'liderança',
        'responsabilidade',
        'quero liderar',
        'quero ajudar',
        'assumir responsabilidade',
      ].includes(textoNorm)
    ) {
      conversa.militanciaStage = 'lideranca_area';
      conversa.militanciaData = {};
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_AGRADECIMENTO);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.LIDERANCA_OPCOES);
      return true;
    }

    // Option 6 - Dashboard
    if (
      ['6', 'dashboard', 'painel', 'painel do meu bairro', 'meu bairro'].includes(textoNorm)
    ) {
      await this.enviarDashboard(celular, militante);
      return false;
    }

    // Unrecognized - show personalized menu
    this.log(`⚠️ Comando não reconhecido: "${texto.substring(0, 50)}"`);
    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome));
    return false;
  }

  /**
   * Fetch and send personal dashboard data
   */
  private async enviarDashboard(celular: string, militante: MilitanteInfo): Promise<void> {
    try {
      const dashboard = await obterDashboardPessoal(celular, militante.bairro);
      const msg = MESSAGES_MILITANCIA.DASHBOARD({
        nome: militante.nome,
        nivel: militante.nivel,
        nomeNivel: nomeDoNivel(militante.nivel),
        pontos: militante.pontos,
        missoesConcluidasTotal: dashboard.missoesConcluidasTotal,
        militantesNoBairro: dashboard.militantesNoBairro,
        posicaoNoBairro: dashboard.posicaoNoBairro,
        posicaoGeral: dashboard.posicaoGeral,
      });
      await this.client.sendMessage(celular, msg);
    } catch (err: any) {
      this.log(`❌ Erro ao obter dashboard: ${err?.message}`);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DASHBOARD_ERRO);
    }
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
   * Fetch and send latest content or nearest event to non-registered users
   */
  private async enviarNovidades(celular: string): Promise<void> {
    try {
      const [conteudo, evento] = await Promise.all([
        obterUltimoConteudo(),
        obterProximoEvento(),
      ]);

      if (conteudo) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_CONTEUDO(conteudo));
      } else if (evento) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_EVENTO(evento));
      } else {
        // Fall back to env-var content
        const conteudoTexto = config.militancia.novoConteudo;
        const eventosTexto = config.militancia.proximosEventos;
        if (conteudoTexto) {
          await this.client.sendMessage(
            celular,
            MESSAGES_MILITANCIA.MOSTRAR_CONTEUDO({ titulo: conteudoTexto })
          );
        } else if (eventosTexto) {
          await this.client.sendMessage(
            celular,
            MESSAGES_MILITANCIA.MOSTRAR_EVENTO({ nome: eventosTexto })
          );
        } else {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_NOVIDADES_FALLBACK);
        }
      }
    } catch (err: any) {
      this.log(`❌ Erro ao enviar novidades: ${err?.message}`);
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_NOVIDADES_FALLBACK);
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
