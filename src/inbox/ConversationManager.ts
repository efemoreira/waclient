/**
 * ConversationManager
 * ──────────────────────────────────────────────────────────────────────────────
 * Ponto central do bot. É instanciado uma vez por função Vercel (ou reutilizado
 * entre chamadas no mesmo container, se o Node.js reaproveitar a instância).
 *
 * Responsabilidades:
 *  1. Receber o payload bruto do webhook e extrair mensagens/status
 *  2. Manter um Map<telefone, Conversation> em memória (cache local)
 *  3. Persistir/carregar cada conversa individualmente no Upstash Redis (ou
 *     /tmp como fallback) — cada conversa tem sua própria chave, então a
 *     escrita de um usuário nunca corre risco de sobrescrever o estado de
 *     outro usuário
 *  4. Delegar cada mensagem recebida ao MilitanciaManager (lógica do bot)
 *  5. Registrar mensagens enviadas de volta ao Map e persistir
 *
 * Fluxo resumido de uma mensagem recebida:
 *   processarWebhook(payload)
 *     → adicionarMensagem(de, 'in', texto)
 *     → MilitanciaManager.processar(celular, texto, conversa)
 *       → WhatsApp.sendMessage(...)
 *     → persistirConversa(id)
 */

import { WhatsApp } from '../wabapi';
import type { WebhookPayload, WhatsAppMessage } from '../wabapi/types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { normalizarWaId } from '../utils/text-normalizer';
import {
  lerConversa,
  salvarConversa,
  lerTodasConversas,
  apagarTodasConversas,
  lerMeta,
  salvarMeta,
} from '../utils/conversation-storage';
import { MilitanciaManager } from './MilitanciaManager';

/**
 * Representa uma mensagem individual
 */
export interface MessageRecord {
  id: string;
  direction: 'in' | 'out';
  text: string;
  timestamp: number;
  status?: string;
}

/**
 * Representa uma conversa com um contato
 */
export interface Conversation {
  id: string;
  name?: string;
  phoneNumber: string;
  lastMessage?: string;
  lastTimestamp?: number;
  unreadCount: number;
  isHuman: boolean;
  messages: MessageRecord[];
  militanciaStage?:
    | 'lgpd_consentimento'
    | 'missao_resposta'
    | 'lideranca_area'
    | 'denuncia_bairro'
    | 'denuncia_descricao'
    | 'cadastro_origem';
  militanciaData?: {
    cadastroIniciado?: boolean;
    nome?: string;
    bairro?: string;
    cidade?: string;
    descricao?: string;
    missao?: { id: string };
    recrutadoPor?: string;
  };
}

/**
 * Gerenciador de conversas e mensagens
 * Orquestra o bot de mobilização política
 */
export class ConversationManager {
  private client: WhatsApp;
  private conversations: Map<string, Conversation> = new Map();
  private militanciaManager: MilitanciaManager;
  private lastLoadTime: number = 0;
  private loadTimeout: number = 1000; // Recarregar no máximo a cada 1 segundo
  private resetAt: number = 0;

  private log(msg: string): void {
    logger.info('Inbox', msg);
  }

  // Garante que resets globais foram aplicados antes de operar.
  // Um "reset" é disparado pela interface web para limpar todas as conversas.
  // Como cada instância Vercel tem seu próprio Map em memória, precisamos de
  // um mecanismo compartilhado (o campo resetAt no storage) para sincronizá-las.
  private async garantirResetAtualizado(): Promise<void> {
    const meta = await lerMeta();
    if (meta?.resetAt && meta.resetAt > this.resetAt) {
      this.resetAt = meta.resetAt;
      this.conversations.clear();
      this.log(`🧹 Reset detectado (${new Date(this.resetAt).toISOString()})`);
    }
  }

  // Mescla a versão de uma conversa vinda do storage com a versão em memória
  // desta instância, evitando perda de mensagens.
  //
  // Por quê isso é necessário?
  // A Vercel pode ter múltiplas instâncias do bot rodando ao mesmo tempo, cada
  // uma com seu próprio Map em memória. Quando precisamos salvar no Redis, não
  // podemos simplesmente sobrescrever — precisamos unir as mensagens de ambas
  // as instâncias. Essa função faz isso usando o ID da mensagem como chave de
  // deduplicação.
  //
  // Importante: cada conversa tem sua PRÓPRIA chave no storage (ver
  // conversation-storage.ts), então essa mescla nunca afeta outras conversas —
  // diferente do esquema antigo, que guardava todas as conversas num único
  // blob JSON e corria o risco de uma escrita concorrente de OUTRO usuário
  // sobrescrever o `militanciaStage` desta conversa.
  private mergeConversa(existing: Conversation, conv: Conversation): Conversation {
    const msgMap = new Map<string, MessageRecord>();
    existing.messages.forEach((m) => msgMap.set(m.id, m));
    conv.messages.forEach((m) => msgMap.set(m.id, m));
    const messages = Array.from(msgMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    const lastMessage = messages.length ? messages[messages.length - 1].text : existing.lastMessage;
    const lastTimestamp = messages.length
      ? messages[messages.length - 1].timestamp
      : existing.lastTimestamp;

    // Preserve militanciaStage/militanciaData from storage when the current
    // conversation was freshly created (property absent) to avoid race conditions
    // on cold starts (e.g. Vercel serverless).
    //
    // The `in` operator distinguishes two cases:
    //   - Property ABSENT on conv (freshly created conversation, stage not yet set):
    //     use existing stage from storage to avoid losing saved state.
    //   - Property PRESENT on conv (even if undefined, meaning processar cleared it):
    //     use conv's value so intentional stage updates / clears are respected.
    const militanciaStage = 'militanciaStage' in conv
      ? conv.militanciaStage
      : existing.militanciaStage;
    const militanciaData = 'militanciaData' in conv
      ? conv.militanciaData
      : existing.militanciaData;

    return {
      ...existing,
      ...conv,
      name: existing.name || conv.name,
      phoneNumber: existing.phoneNumber || conv.phoneNumber,
      isHuman: existing.isHuman || conv.isHuman,
      unreadCount: Math.max(existing.unreadCount || 0, conv.unreadCount || 0),
      messages,
      lastMessage,
      lastTimestamp,
      militanciaStage,
      militanciaData,
    };
  }

  constructor() {
    const versionStr = config.whatsapp.apiVersion.replace(/\.0$/, '');
    const apiVersion = parseInt(versionStr, 10);
    this.log(`🔧 Usando API v${apiVersion}.0`);
    const storageMode = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? 'Upstash Redis' : '/tmp local';
    this.log(`🗄️  Storage mode: ${storageMode}`);
    
    // Debug: verificar se token está configurado
    console.log('[ConversationManager Constructor] 🔐 Configuração:', {
      tokenPresent: !!config.whatsapp.token,
      tokenLength: config.whatsapp.token?.length,
      tokenStart: config.whatsapp.token?.substring(0, 10) + '***',
      numberId: config.whatsapp.numberId,
    });
    
    if (!config.whatsapp.token) {
      console.error('[ConversationManager Constructor] ❌ WHATSAPP_ACCESS_TOKEN não configurado!');
      this.log('❌ WHATSAPP_ACCESS_TOKEN não configurado!');
    }
    
    this.client = new WhatsApp({
      token: config.whatsapp.token,
      numberId: config.whatsapp.numberId,
      version: apiVersion,
    });
    this.militanciaManager = new MilitanciaManager(this.client);

    // Carregar conversas do armazenamento
    this.carregarConversas().catch(console.error);
  }

  /**
   * Recarregar conversas do arquivo apenas se passou tempo suficiente
   */
  private async recarregarSeNecessario(): Promise<void> {
    const agora = Date.now();
    if (agora - this.lastLoadTime < this.loadTimeout) {
      // Já foi carregado recentemente, usar cache
      return;
    }
    this.lastLoadTime = agora;
    await this.recarregarConversas();
  }

  /**
   * Carregar conversas do armazenamento (Upstash ou /tmp)
   */
  private async carregarConversas(): Promise<void> {
    try {
      await this.garantirResetAtualizado();
      const conversas = await lerTodasConversas();
      Object.entries(conversas).forEach(([id, conv]) => {
        this.conversations.set(id, conv);
      });
      this.log(`✅ Carregadas ${this.conversations.size} conversas`);
    } catch (e: any) {
      this.log(`❌ Erro ao carregar conversas: ${e?.message || e}`);
    }
  }

  /**
   * Recarregar conversas do arquivo (útil após mudanças)
   */
  async recarregarConversas(): Promise<void> {
    this.log('🔄 Recarregando conversas do storage...');
    this.conversations.clear();
    await this.carregarConversas();
  }

  /**
   * Salvar uma única conversa no armazenamento (Upstash ou /tmp).
   *
   * Faz merge apenas com a versão dessa MESMA conversa no storage — nunca
   * lê/escreve as conversas de outros usuários, eliminando a race condition
   * que existia quando todas as conversas viviam num único blob.
   */
  private async persistirConversa(id: string): Promise<void> {
    try {
      await this.garantirResetAtualizado();
      const conv = this.conversations.get(id);
      if (!conv) return;
      const existente = await lerConversa(id);
      const mergedConv = existente ? this.mergeConversa(existente, conv) : conv;
      await salvarConversa(id, mergedConv);
      this.conversations.set(id, mergedConv);
      this.log(`💾 Conversa salva: ${id}`);
    } catch (e: any) {
      this.log(`❌ Erro ao salvar conversa ${id}: ${e?.message || e}`);
    }
  }

  /**
   * Extrair texto da mensagem (suporta vários tipos)
   */
  private extrairTexto(message: WhatsAppMessage): string {
    if (message.text?.body) return message.text.body;
    if (message.interactive?.button_reply?.title) {
      return message.interactive.button_reply.title;
    }
    if (message.interactive?.list_reply?.title) {
      return message.interactive.list_reply.title;
    }
    if (message.location) {
      const { latitude, longitude, name } = message.location;
      return name
        ? `📍 ${name} (${latitude}, ${longitude})`
        : `📍 Localização (${latitude}, ${longitude})`;
    }
    return `[${message.type}]`;
  }

  /**
   * Obter ou criar uma conversa
   */
  private obterOuCriarConversa(
    waId: string,
    nome?: string
  ): Conversation {
    const idNormalizado = normalizarWaId(waId);
    // Garantir reset atualizado antes de usar o cache
    // (não aguarda: usar best-effort no fluxo síncrono)
    this.garantirResetAtualizado().catch(() => undefined);
    const existente = this.conversations.get(idNormalizado);
    if (existente) {
      if (nome && !existente.name) existente.name = nome;
      return existente;
    }

    const conversa: Conversation = {
      id: idNormalizado,
      name: nome,
      phoneNumber: idNormalizado,
      unreadCount: 0,
      isHuman: false,
      messages: [],
    };
    this.conversations.set(idNormalizado, conversa);
    return conversa;
  }

  /**
   * Adicionar mensagem a uma conversa
   */
  private async adicionarMensagem(
    waId: string,
    direcao: 'in' | 'out',
    texto: string,
    mensagemId?: string,
    timestamp?: number
  ): Promise<void> {
    await this.garantirResetAtualizado();
    const conversa = this.obterOuCriarConversa(waId);
    const ts = timestamp || Date.now();
    const registro: MessageRecord = {
      id: mensagemId || `local-${ts}-${Math.random().toString(36).slice(2, 8)}`,
      direction: direcao,
      text: texto,
      timestamp: ts,
    };

    conversa.messages.push(registro);
    conversa.lastMessage = texto;
    conversa.lastTimestamp = ts;
    if (direcao === 'in') {
      conversa.unreadCount += 1;
    }

    // Salvar após cada mensagem
    await this.persistirConversa(conversa.id);
  }

  /**
   * Atualizar status de uma mensagem enviada
   */
  private async atualizarStatusMensagem(
    waId: string,
    mensagemId: string,
    status: string,
    timestamp?: number
  ): Promise<void> {
    await this.garantirResetAtualizado();
    const conversa = this.obterOuCriarConversa(waId);
    const msg = conversa.messages.find((m) => m.id === mensagemId);
    if (msg) {
      msg.status = status;
      if (timestamp) {
        conversa.lastTimestamp = timestamp;
      }
      await this.persistirConversa(conversa.id);
      this.log(`✅ Status atualizado: ${mensagemId} -> ${status}`);
    } else {
      this.log(`⚠️  Status recebido para mensagem desconhecida: ${mensagemId}`);
    }
  }

  /**
   * Processar histórico de mensagens (history webhook)
   */
  private async processarHistory(history: any[]): Promise<void> {
    for (const item of history) {
      const meta = item?.metadata;
      if (meta?.phase !== undefined) {
        this.log(`🧭 History phase=${meta.phase} chunk=${meta.chunk_order} progress=${meta.progress}`);
      }

      const threads = Array.isArray(item?.threads) ? item.threads : [];
      for (const thread of threads) {
        const threadId = thread?.id;
        if (!threadId) continue;
        this.obterOuCriarConversa(threadId);

        const mensagens = Array.isArray(thread?.messages) ? thread.messages : [];
        for (const msg of mensagens) {
          const de = msg?.from;
          if (!de) continue;

          const texto = this.extrairTexto(msg);
          const timestamp = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
          const fromMeFlag = msg?.history_context?.from_me;
          const fromMe = typeof fromMeFlag === 'boolean'
            ? fromMeFlag
            : de !== threadId;
          const status = msg?.history_context?.status;
          const direcao: 'in' | 'out' = fromMe ? 'out' : 'in';

          await this.adicionarMensagem(threadId, direcao, texto, msg.id, timestamp);
          if (status) {
            await this.atualizarStatusMensagem(threadId, msg.id, status, timestamp);
          }
        }
      }
    }
  }

  /**
   * Processa o payload JSON bruto recebido do webhook do WhatsApp.
   *
   * Estrutura do payload do WhatsApp:
   * {
   *   entry: [{
   *     id: "business_account_id",
   *     changes: [{
   *       field: "messages",
   *       value: {
   *         metadata: { phone_number_id, display_phone_number },
   *         contacts: [{ wa_id, profile: { name } }],
   *         messages: [{ from, id, text, type, timestamp }],  ← mensagens recebidas
   *         statuses: [{ id, status, recipient_id, timestamp }] ← confirmações de entrega
   *       }
   *     }]
   *   }]
   * }
   *
   * O campo `contacts` mapeamos para obter o nome do remetente.
   * O campo `messages` contém as mensagens recebidas — cada uma é processada pelo MilitanciaManager.
   * O campo `statuses` são atualizações de entrega/leitura das mensagens que enviamos.
   */
  async processarWebhook(payload: WebhookPayload): Promise<void> {
    this.log('🔍 PROCESSANDO WEBHOOK');

    const entries = payload.entry || [];
    if (entries.length === 0) {
      this.log('❌ Webhook sem entry');
      return;
    }

    for (const entrada of entries) {
      this.log(`📦 Entry: ${entrada?.id || 'sem id'}`);
      const changes = entrada.changes || [];
      for (const mudanca of changes) {
        const valor: any = mudanca?.value;
        if (!valor) {
          this.log('❌ Nenhum value encontrado na change');
          continue;
        }

        if (mudanca?.field) {
          this.log(`🧩 Field: ${mudanca.field}`);
        }
        const metadata = valor.metadata;
        if (metadata?.phone_number_id) {
          this.log(`📱 Phone Number ID: ${metadata.phone_number_id}`);
        }

        // Erros no nível do value
        if (Array.isArray(valor.errors) && valor.errors.length > 0) {
          this.log(`❌ Erros no webhook (value.errors): ${valor.errors.length}`);
          for (const err of valor.errors) {
            const details = err?.error_data?.details ? ` details=${err.error_data.details}` : '';
            this.log(`• code=${err?.code} type=${err?.type} title=${err?.title || err?.message}${details}`);
          }
        }

        // Mapear contatos por wa_id para obter o nome de perfil do remetente.
        // O payload pode conter múltiplos contatos se várias pessoas enviaram mensagens
        // no mesmo batch de webhook.
        const contacts = Array.isArray(valor.contacts) ? valor.contacts : [];
        const contatoPorId = new Map<string, string>();
        for (const c of contacts) {
          if (c?.wa_id) {
            contatoPorId.set(c.wa_id, c?.profile?.name || 'Desconhecido');
          }
        }

        // History (backfill)
        if (Array.isArray(valor.history) && valor.history.length > 0) {
          this.log(`🕘 WEBHOOK HISTORY RECEBIDO (${valor.history.length})`);
          await this.processarHistory(valor.history);
        }

        // Mensagens recebidas dos usuários.
        // Cada mensagem é registrada no histórico e depois entregue ao MilitanciaManager,
        // exceto se a conversa estiver em modo humano (isHuman = true), caso em que
        // o operador está respondendo manualmente pelo painel.
        if (Array.isArray(valor.messages) && valor.messages.length > 0) {
          this.log(`📨 Processando ${valor.messages.length} mensagem(ns)...`);
          for (const msg of valor.messages) {
            const de = msg?.from;
            if (!de) {
              this.log('⚠️  Mensagem sem origem');
              continue;
            }

            if (Array.isArray(msg?.errors) && msg.errors.length > 0) {
              this.log(`❌ Mensagem com erro (type=${msg?.type || 'unknown'})`);
              for (const err of msg.errors) {
                const details = err?.error_data?.details ? ` details=${err.error_data.details}` : '';
                this.log(`• code=${err?.code} title=${err?.title || err?.message}${details}`);
              }
            }

            const texto = this.extrairTexto(msg);
            const timestamp = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
            const nome = contatoPorId.get(de);
            if (nome) {
              this.obterOuCriarConversa(de, nome);
            }

            await this.adicionarMensagem(de, 'in', texto, msg.id, timestamp);
            this.log(`✅ De ${de}: "${texto.substring(0, 50)}..."`);

            // Obter conversa
            const conversa = this.obterOuCriarConversa(de);

            // Se a conversa está em modo humano, o operador está respondendo
            // manualmente pelo painel web. O bot fica em silêncio.
            if (conversa.isHuman) {
              continue;
            }

            // Entrega a mensagem ao MilitanciaManager.
            // O método processar() retorna true se o estado da conversa mudou
            // (ex: stage foi avançado), indicando que precisa ser persistido.
            // Delegate all message handling to MilitanciaManager
            try {
              const precisaPersistir = await this.militanciaManager.processar(de, texto, conversa);
              if (precisaPersistir) {
                await this.persistirConversa(conversa.id);
              }
            } catch (erro: any) {
              this.log(`❌ Erro ao processar mensagem: ${erro?.message}`);
            }
          }
        }

        // Status de mensagens enviadas
        if (Array.isArray(valor.statuses) && valor.statuses.length > 0) {
          this.log(`📊 Processando ${valor.statuses.length} status(es)`);
          for (const st of valor.statuses) {
            const recipientId = st?.recipient_id;
            const msgId = st?.id;
            const status = st?.status;
            const ts = st?.timestamp ? Number(st.timestamp) * 1000 : undefined;
            if (Array.isArray(st?.errors) && st.errors.length > 0) {
              this.log(`❌ Status com erro (msg=${msgId})`);
              for (const err of st.errors) {
                const details = err?.error_data?.details ? ` details=${err.error_data.details}` : '';
                this.log(`• code=${err?.code} title=${err?.title || err?.message}${details}`);
              }
            }
            if (recipientId && msgId && status) {
              await this.atualizarStatusMensagem(recipientId, msgId, status, ts);
            }
          }
        }
      }
    }

    this.log('✅ WEBHOOK PROCESSADO');
  }

  /**
   * Obter todas as conversas ordenadas por recency (recarrega do arquivo se necessário)
   */
  async obterConversas(): Promise<Conversation[]> {
    // Recarregar do arquivo apenas se passou tempo suficiente
    await this.recarregarSeNecessario();
    
    return Array.from(this.conversations.values())
      .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
      .map((c) => ({
        ...c,
        messages: c.messages.slice(-50), // Limitar últimas 50 mensagens
      }));
  }

  /**
   * Obter conversa específica e marcar como lida (recarrega do arquivo se necessário)
   */
  async obterConversa(id: string): Promise<Conversation | null> {
    // Recarregar do arquivo apenas se passou tempo suficiente
    await this.recarregarSeNecessario();

    const idNormalizado = normalizarWaId(id);
    this.log(`🔍 Buscando conversa: ${idNormalizado}`);
    const conversa = this.conversations.get(idNormalizado);
    if (conversa) {
      conversa.unreadCount = 0;
      this.log(`✅ Encontrada com ${conversa.messages.length} mensagens`);
    } else {
      this.log('❌ Não encontrada');
    }
    return conversa || null;
  }

  /**
   * Alternar controle manual da conversa
   */
  alternarControleManual(id: string, ativo: boolean): boolean {
    const idNormalizado = normalizarWaId(id);
    this.log(`🔄 Alternando controle manual: ${idNormalizado} -> ${ativo ? '👤 Humano' : '🤖 Bot'}`);
    const conversa = this.conversations.get(idNormalizado);
    if (!conversa) {
      this.log('❌ Conversa não encontrada');
      return false;
    }
    conversa.isHuman = ativo;
    this.log('✅ Controle alterado');
    return true;
  }

  /**
   * Enviar mensagem e armazenar registro
   */
  async enviarMensagem(para: string, texto: string): Promise<string> {
    const paraNormalizado = normalizarWaId(para);
    this.log('📤 Enviando mensagem');
    this.log(`Para: ${paraNormalizado}`);
    this.log(`Texto: "${texto.substring(0, 60)}${texto.length > 60 ? '...' : ''}"`);
    
    try {
      await this.garantirResetAtualizado();
      // Garantir que conversa existe (será criada se não existir)
      this.obterOuCriarConversa(paraNormalizado);
      
      console.log('[enviarMensagem] 🔄 Chamando client.sendMessage', {
        para: paraNormalizado,
        textoLength: texto.length,
      });
      
      this.log(`🔄 Chamando client.sendMessage(${paraNormalizado}, texto)`);
      const resposta = await this.client.sendMessage(para, texto);
      
      // Log status da resposta
      this.log(`📨 Resposta: status ${resposta.status}, mensagens: ${resposta.data?.messages?.length || 0}`);
      
      const mensagemId = resposta.data?.messages?.[0]?.id;
      
      await this.adicionarMensagem(paraNormalizado, 'out', texto, mensagemId, Date.now());
      this.log(`✅ Enviada com ID: ${mensagemId}`);
      
      return mensagemId || '';
    } catch (erro: any) {
      const errorMessage = erro?.message || 'Desconhecido';
      const errorCode = erro?.response?.data?.error?.code || null;
      const errorType = erro?.response?.data?.error?.type || null;
      const status = erro?.response?.status || 'unknown';
      const fbtrace = erro?.response?.data?.error?.fbtrace_id || null;
      
      console.error('[enviarMensagem] ❌ Erro ao enviar mensagem para WhatsApp', {
        status,
        errorMessage,
        errorCode,
        errorType,
        fbtrace,
      });
      
      this.log('❌ Erro capturado');
      this.log(`Mensagem: ${errorMessage}`);
      this.log(`Status HTTP: ${status}`);
      
      // Debug adicional para 401
      if (status === 401) {
        this.log('⚠️ ERRO 401 - Autenticação falhou!');
        this.log('Possíveis causas:');
        this.log('1. WHATSAPP_ACCESS_TOKEN não configurado');
        this.log('2. Token expirado');
        this.log('3. Token sem permissão');
        if (fbtrace) this.log(`Trace ID: ${fbtrace}`);
      }
      
      if (errorCode) this.log(`Código: ${errorCode}`);
      if (errorType) this.log(`Tipo: ${errorType}`);
      
      throw erro;
    }
  }

  /**
   * Criar conversa com nome (para novas conversas)
   */
  async criarConversa(telefone: string, nome?: string): Promise<Conversation> {
    const telefoneNormalizado = normalizarWaId(telefone);
    this.log(`✨ Criando nova conversa: ${telefoneNormalizado}`);
    if (nome) this.log(`Nome: ${nome}`);
    
    await this.garantirResetAtualizado();
    const existente = this.conversations.get(telefoneNormalizado);
    if (existente) {
      this.log('ℹ️  Conversa já existe, atualizando nome se fornecido');
      if (nome && !existente.name) {
        existente.name = nome;
        await this.persistirConversa(telefoneNormalizado);
      }
      return existente;
    }

    const conversa: Conversation = {
      id: telefoneNormalizado,
      name: nome,
      phoneNumber: telefoneNormalizado,
      unreadCount: 0,
      isHuman: false,
      messages: [],
    };

    this.conversations.set(telefoneNormalizado, conversa);
    await this.persistirConversa(telefoneNormalizado);
    this.log('✅ Conversa criada e salva');

    return this.conversations.get(telefoneNormalizado)!;
  }

  /**
   * Apagar todas as conversas persistidas
   */
  async limparConversas(): Promise<void> {
    this.conversations.clear();
    const resetAt = Date.now();
    this.resetAt = resetAt;
    await salvarMeta({ resetAt });
    await apagarTodasConversas();
    this.log('🧹 Todas as conversas foram apagadas');
  }
}
