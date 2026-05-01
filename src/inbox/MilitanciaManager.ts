/**
 * MilitanciaManager
 * ──────────────────────────────────────────────────────────────────────────────
 * Contém toda a lógica de conversa do bot de militância política.
 *
 * É chamado pelo ConversationManager para cada mensagem recebida.
 * Retorna `true` se o estado da conversa mudou e precisa ser persistido.
 *
 * Fluxos suportados:
 * ─────────────────
 *  Cadastro (orientado pela planilha):
 *    Novo contato → pergunta nome → pergunta bairro → pergunta cidade → pergunta origem → menu
 *
 *  Fluxos multi-passo (via militanciaStage na conversa):
 *    missao_resposta      → registra resposta da missão do dia
 *    evento_confirmacao   → registra confirmação de presença
 *    lideranca_area       → registra área de interesse em liderança
 *    denuncia_bairro      → coleta bairro da denúncia
 *    denuncia_descricao   → coleta descrição e finaliza denúncia
 *
 *  Todos os dados são gravados no Google Sheets via militanciaSheet.ts
 */

import { WhatsApp } from '../wabapi';
import { normalizarTexto } from '../utils/text-normalizer';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  buscarMilitante,
  isCadastroCompleto,
  registrarContato,
  atualizarCamposMilitante,
  atualizarDataCadastro,
  atualizarUltimaInteracao,
  registrarRespostaMissao,
  registrarAcessoConteudo,
  registrarConfirmacaoEvento,
  registrarInteresseLideranca,
  registrarDenuncia,
  registrarOrigem,
  obterUltimoConteudo,
  obterProximoEvento,
  obterProximosEventos,
  obterUltimosConteudosPorTipo,
  obterMissaoDia,
  contarMilitantes,
  nomeDoNivel,
  verificarERegistrarConquistas,
  type MilitanteInfo,
  type MissaoResultado,
  type ConquistaDefinicao,
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
   * Ponto de entrada principal — processa uma mensagem recebida.
   *
   * Muta o objeto `conversa` quando o state muda (ex: avança um stage).
   * Retorna `true` quando o estado foi alterado e precisa ser persistido no Redis.
   * Retorna `false` quando só enviou uma resposta sem mudar o estado (ex: menu).
   *
   * Ordem de verificação:
   *   1. Se existe um stage ativo → delega para processarStage()
   *   2. Se militante cadastrado → delega para processarMenuOuComando()
   *   3. Se cadastro incompleto → coleta o campo que falta (nome/bairro/cidade)
   *   4. Se telefone não existe na planilha → registra contato novo
   *
   * Estado de cadastro é derivado da planilha (não de flags locais):
   *   - telefone NÃO está na planilha  → salva contato + mostra boas-vindas
   *   - nome vazio                     → coleta nome
   *   - nome preenchido, bairro vazio  → coleta bairro
   *   - nome+bairro, cidade vazia      → coleta cidade
   *   - tudo preenchido                → menu principal
   */
  async processar(celular: string, texto: string, conversa: Conversation): Promise<boolean> {
    // Guard: se a conversa está em modo humano, o operador responde manualmente — bot fica em silêncio.
    if (conversa.isHuman) return false;

    const textoNorm = normalizarTexto(texto).trim();
    const isOpcao1 = ['1', 'cadastro', 'cadastrar', 'quero me cadastrar'].includes(textoNorm);
    const isOpcao2 = ['2', 'novidades', 'acompanhar'].includes(textoNorm);
    conversa.militanciaData = conversa.militanciaData || {};

    // Continua fluxos multi-passo que ainda precisam de stage tracking (missão, evento, liderança...).
    // Stages de cadastro são ignorados propositalmente: o cadastro é derivado da planilha,
    // não de um stage salvo localmente (isso evita inconsistências após re-deploys).
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
      atualizarUltimaInteracao(celular).catch(() => {});
      return await this.processarMenuOuComando(celular, texto, textoNorm, conversa, militante);
    }

    // Case 2: registration in progress — derive step from sheet data
    if (militante) {
      const cadastroIniciado = conversa.militanciaData.cadastroIniciado === true;

      // Step 2: ask for explicit decision before collecting registration fields
      if (!cadastroIniciado) {
        if (isOpcao2) {
          await this.enviarConteudoEEvento(celular);
          return true;
        }
        if (isOpcao1) {
          conversa.militanciaData.cadastroIniciado = true;
          if (!militante.nome?.trim()) {
            await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_NEW_USER);
            return true;
          }
          if (!militante.bairro?.trim()) {
            await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_BAIRRO);
            return true;
          }
          if (!militante.cidade?.trim()) {
            await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_CIDADE);
            return true;
          }
          // Defensive fallback if profile became complete between reads
          const atualizado = await buscarMilitante(celular);
          if (atualizado && isCadastroCompleto(atualizado)) {
            conversa.militanciaData = {};
            await this.client.sendMessage(
              celular,
              MESSAGES_MILITANCIA.MENU_PERSONALIZADO(atualizado.nome, atualizado.posicao)
            );
            return true;
          }
        }

        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.WELCOME_SECOND_CONTACT);
        return true;
      }

      if (!militante.nome?.trim()) {
        // If user greets or repeats option 1, re-prompt for name.
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
        // Awaited so posicao (membro #N) is assigned before CADASTRO_SUCESSO is sent
        await atualizarDataCadastro(celular).catch(() => {});
        conversa.militanciaStage = 'cadastro_origem';
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_ORIGEM);
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
    await this.client.sendMessage(
      celular,
      contatoOk ? MESSAGES_MILITANCIA.WELCOME_FIRST_CONTACT : MESSAGES_MILITANCIA.ERRO_CADASTRO
    );
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
   * Processa a mensagem quando há um fluxo multi-passo ativo (stage).
   *
   * Cada case corresponde a uma etapa de um fluxo que precisa de mais de uma
   * resposta do usuário. O stage é salvo na conversa entre mensagens.
   *
   * Exemplo de fluxo de denúncia:
   *   Bot: "Qual o bairro?" → stage = 'denuncia_bairro'
   *   Usuário: "Centro"     → stage = 'denuncia_descricao'
   *   Bot: "Qual o problema?"
   *   Usuário: "Buraco na rua" → stage = undefined → grava na planilha
   */
  private async processarStage(
    celular: string,
    texto: string,
    textoNorm: string,
    conversa: Conversation
  ): Promise<boolean> {
    conversa.militanciaData = conversa.militanciaData || {};

    switch (conversa.militanciaStage) {
      // ---- Registration origin step ----
      case 'cadastro_origem': {
        const origemTexto = texto.trim();
        const pulou = ['0', 'nao', 'nao sei', 'pular', 'skip', 'nenhum', 'nenhuma'].includes(textoNorm);
        conversa.militanciaStage = undefined;
        if (!pulou && origemTexto) {
          registrarOrigem(celular, origemTexto).catch(() => {});
        }
        const militantePos = await buscarMilitante(celular);
        const posicaoMembro = militantePos?.posicao || (await contarMilitantes());
        await this.client.sendMessage(
          celular,
          MESSAGES_MILITANCIA.CADASTRO_SUCESSO(militantePos?.nome || '', posicaoMembro)
        );
        return true;
      }

      // ---- Mission response ----
      case 'missao_resposta': {
        const missaoDia = conversa.militanciaData?.missao || config.militancia.missaoDia;
        const fezMissao = this.detectarRespostaMissao(textoNorm) === 'concluído';
        conversa.militanciaStage = undefined;

        if (fezMissao) {
          const resultado: MissaoResultado = await registrarRespostaMissao(celular, missaoDia);
          // Base confirmation with streak and points
          await this.client.sendMessage(
            celular,
            MESSAGES_MILITANCIA.MISSAO_CONCLUIDA(resultado.streakAtual, resultado.pontos, resultado.pontosGanhos)
          );
          // Level-up notification
          if (resultado.levelUp) {
            await this.client.sendMessage(
              celular,
              MESSAGES_MILITANCIA.NIVEL_SUBIU(nomeDoNivel(resultado.novoNivel))
            );
          }
          // Achievement notifications
          for (const conquista of resultado.novasConquistas) {
            await this.client.sendMessage(
              celular,
              MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA(conquista, resultado.missoesConcluidasTotal)
            );
          }
        } else {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO_PENDENTE);
        }
        return true;
      }

      // ---- Event confirmation ----
      case 'evento_confirmacao': {
        const nomeEvento = conversa.militanciaData?.evento || config.militancia.proximosEventos;
        const confirmacao: 'sim' | 'talvez' = ['1', 'sim', 'vou', 'vou sim', 'sim vou'].some((k) => textoNorm.includes(k))
          ? 'sim'
          : 'talvez';
        await registrarConfirmacaoEvento(celular, nomeEvento, confirmacao === 'sim');
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.EVENTO_CONFIRMADO(confirmacao));
        // Verificar conquistas de eventos após confirmação
        if (confirmacao === 'sim') {
          const novasConquistas = await verificarERegistrarConquistas(celular);
          for (const conquista of novasConquistas) {
            await this.client.sendMessage(
              celular,
              MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA(conquista, 0)
            );
          }
        }
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
        const bairro = conversa.militanciaData.bairro || '';
        const descricao = texto.trim();
        const protocolo = await registrarDenuncia(celular, bairro, descricao);
        conversa.militanciaStage = undefined;
        conversa.militanciaData = {};
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.DENUNCIA_REGISTRADA(protocolo));
        // Verificar conquistas de denúncias (registrarDenuncia já awaita o incremento do contador)
        const novasConquistasDenuncia = await verificarERegistrarConquistas(celular);
        for (const conquista of novasConquistasDenuncia) {
          await this.client.sendMessage(
            celular,
            MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA(conquista, 0)
          );
        }
        return true;
      }

      default:
        conversa.militanciaStage = undefined;
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU);
        return true;
    }
  }

  /**
   * Processa seleções do menu principal e comandos globais para militantes cadastrados.
   *
   * Comandos globais (funcionam em qualquer momento):
   *   menu / ajuda / voltar → exibe o menu principal personalizado
   *
   * Opções do menu:
   *   1 → Missão do dia
   *   2 → Próximos eventos
   *   3 → Novo conteúdo
   *   4 → Fazer uma denúncia
   *   5 → Quero contribuir mais (liderança)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async processarMenuOuComando(
    celular: string,
    texto: string,
    textoNorm: string,
    conversa: Conversation,
    militante: MilitanteInfo
  ): Promise<boolean> {
    // Global commands
    if (['menu', 'ajuda', 'help', 'inicio', 'início', 'voltar'].includes(textoNorm)) {
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome, militante.posicao));
      return false;
    }

    // Option 1 - Mission
    if (['1', 'missao', 'missão', 'missao de hoje', 'missão de hoje'].includes(textoNorm)) {
      const missaoSheet = await obterMissaoDia();
      const missaoTexto = missaoSheet || config.militancia.missaoDia || '';
      if (!missaoTexto) {
        await this.client.sendMessage(celular, 'A missão de hoje ainda não foi configurada. Tente novamente mais tarde.\n\nDigite *menu* para ver outras opções.');
        return false;
      }
      conversa.militanciaStage = 'missao_resposta';
      conversa.militanciaData = { missao: missaoTexto };
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MISSAO(missaoTexto));
      return true;
    }

    // Option 2 - Events (up to 3 upcoming, nearest first)
    if (
      ['2', 'eventos', 'evento', 'proximos eventos'].includes(textoNorm)
    ) {
      const eventos = await obterProximosEventos(3);
      if (!eventos.length) {
        await this.client.sendMessage(celular, 'Não há eventos próximos cadastrados no momento.\n\nDigite *menu* para ver outras opções.');
        return true;
      }
      // First event uses EVENTOS (includes confirmation prompt)
      await this.client.sendMessage(celular, MESSAGES_MILITANCIA.EVENTOS(eventos[0]));
      // Subsequent events are shown without confirmation prompt
      for (let i = 1; i < eventos.length; i++) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_EVENTO(eventos[i]));
      }
      conversa.militanciaStage = 'evento_confirmacao';
      conversa.militanciaData = { evento: eventos[0].nome };
      return true;
    }

    // Option 3 - Content (latest post per type from sheet)
    if (
      ['3', 'conteudo', 'conteúdo', 'conteudos', 'conteúdos', 'novo conteudo', 'novo conteúdo'].includes(textoNorm)
    ) {
      const conteudos = await obterUltimosConteudosPorTipo();
      if (conteudos.length) {
        for (const c of conteudos) {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_CONTEUDO(c));
          registrarAcessoConteudo(celular, c.titulo, c.tipo ?? '').catch(() => {});
        }
      } else {
        // Fallback to env var
        const conteudoTexto = config.militancia.novoConteudo;
        const conteudoTipo = config.militancia.novoConteudoTipo;
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CONTEUDO(conteudoTexto));
        registrarAcessoConteudo(celular, conteudoTexto, conteudoTipo).catch(() => {});
      }
      // Check achievements after content access (Porta-Voz title requires 20 shares)
      // Fire-and-forget: doesn't block the response
      verificarERegistrarConquistas(celular).then(async (novas) => {
        for (const conquista of novas) {
          await this.client.sendMessage(celular, MESSAGES_MILITANCIA.CONQUISTA_DESBLOQUEADA(conquista, 0));
        }
      }).catch(() => {});
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

    // Unrecognized - show personalized menu
    this.log(`⚠️ Comando não reconhecido: "${texto.substring(0, 50)}"`);
    await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MENU_PERSONALIZADO(militante.nome, militante.posicao));
    return false;
  }

  /**
   * Fetch and send BOTH latest content AND nearest event to non-registered users (option 2)
   */
  private async enviarConteudoEEvento(celular: string): Promise<void> {
    try {
      const [conteudo, evento] = await Promise.all([
        obterUltimoConteudo('instagram'),
        obterProximoEvento(),
      ]);

      // Fallback values from env vars
      const conteudoTexto = config.militancia.novoConteudo;
      const eventosTexto = config.militancia.proximosEventos;

      const conteudoFinal = conteudo || (conteudoTexto ? { titulo: conteudoTexto } : null);
      const eventoFinal = evento || (eventosTexto ? { nome: eventosTexto } : null);

      if (conteudoFinal) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_CONTEUDO(conteudoFinal));
      }
      if (eventoFinal) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_EVENTO(eventoFinal));
      }
      if (!conteudoFinal && !eventoFinal) {
        await this.client.sendMessage(celular, MESSAGES_MILITANCIA.MOSTRAR_NOVIDADES_FALLBACK);
      }
    } catch (err: any) {
      this.log(`❌ Erro ao enviar conteúdo e evento: ${err?.message}`);
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
