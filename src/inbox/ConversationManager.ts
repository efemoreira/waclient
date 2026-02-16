import { WhatsApp } from '../wabapi';
import type { WebhookPayload, WhatsAppMessage } from '../wabapi/types';
import { config } from '../config';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger';
import { appendPredioEntry } from '../utils/predioSheet';
import { verificarInscrito, adicionarInscrito, listarInscricoesPorCelular } from '../utils/inscritosSheet';
import { GastosManager } from './GastosManager';

const CONVERSATIONS_FILE = '/tmp/conversations.json';
const CONVERSATIONS_META_FILE = '/tmp/conversations.meta.json';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const UPSTASH_KEY = 'waclient:conversations';
const UPSTASH_META_KEY = 'waclient:meta';

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
  inscricaoStage?:
    | 'nome'
    | 'bairro'
    | 'cep'
    | 'tipo_imovel'
    | 'pessoas'
    | 'uid_indicador';
  inscricaoData?: {
    nome?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    tipo_imovel?: string;
    pessoas?: string;
    uid_indicador?: string;
  };
  pendingLeitura?: {
    valor?: string;
    tipo?: 'agua' | 'energia' | 'gas';
    idImovel?: string;
  };
}

/**
 * Gerenciador de conversas e mensagens
 * Orquestra fluxos de acompanhamento de gastos (água, energia, gás)
 */
export class ConversationManager {
  private client: WhatsApp;
  private conversations: Map<string, Conversation> = new Map();
  private gastosManager: GastosManager;
  private lastLoadTime: number = 0;
  private loadTimeout: number = 1000; // Recarregar no máximo a cada 1 segundo
  private resetAt: number = 0;

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private log(msg: string): void {
    logger.info('Inbox', msg);
  }

  // Normaliza qualquer identificador para dígitos (evita conversas duplicadas)
  private normalizarWaId(id: string): string {
    return String(id || '').replace(/\D/g, '');
  }

  // Garante que resets globais foram aplicados antes de operar
  private async garantirResetAtualizado(): Promise<void> {
    const meta = await this.lerMeta();
    if (meta?.resetAt && meta.resetAt > this.resetAt) {
      this.resetAt = meta.resetAt;
      this.conversations.clear();
      this.log(`🧹 Reset detectado (${new Date(this.resetAt).toISOString()})`);
    }
  }

  // Mescla conversas (evita sobrescrever mensagens entre instâncias)
  private mergeConversas(
    base: Record<string, Conversation>,
    updates: Record<string, Conversation>
  ): Record<string, Conversation> {
    const merged: Record<string, Conversation> = { ...base };

    Object.entries(updates).forEach(([id, conv]) => {
      const existing = merged[id];
      if (!existing) {
        merged[id] = conv;
        return;
      }

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

      merged[id] = {
        ...existing,
        ...conv,
        name: existing.name || conv.name,
        phoneNumber: existing.phoneNumber || conv.phoneNumber,
        isHuman: existing.isHuman || conv.isHuman,
        unreadCount: Math.max(existing.unreadCount || 0, conv.unreadCount || 0),
        messages,
        lastMessage,
        lastTimestamp,
      };
    });

    return merged;
  }

  constructor() {
    const versionStr = config.whatsapp.apiVersion.replace(/\.0$/, '');
    const apiVersion = parseInt(versionStr, 10);
    this.log(`🔧 Usando API v${apiVersion}.0`);
    const storageMode = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN ? 'Upstash Redis' : '/tmp local';
    this.log(`🗄️  Storage mode: ${storageMode}`);
    this.client = new WhatsApp({
      token: config.whatsapp.token,
      numberId: config.whatsapp.numberId,
      version: apiVersion,
    });
    this.gastosManager = new GastosManager(this.client);
    
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
      const conversas = await this.lerDoArmazenamento();
      if (!conversas || typeof conversas !== 'object') {
        this.log(`❌ Armazenamento inválido (${typeof conversas})`);
        return;
      }
      Object.entries(conversas).forEach(([id, conv]: [string, any]) => {
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
   * Salvar conversas no armazenamento (Upstash ou /tmp)
   */
  private async salvarConversas(): Promise<void> {
    try {
      await this.garantirResetAtualizado();
      const data: Record<string, Conversation> = {};
      this.conversations.forEach((conv, id) => {
        data[id] = conv;
      });
      const base = (await this.lerDoArmazenamento()) || {};
      const merged = this.mergeConversas(base, data);
      await this.salvarNoArmazenamento(merged);
      this.conversations.clear();
      Object.entries(merged).forEach(([id, conv]) => {
        this.conversations.set(id, conv);
      });
      this.log(`💾 Salvas ${Object.keys(merged).length} conversas`);
    } catch (e: any) {
      this.log(`❌ Erro ao salvar conversas: ${e?.message || e}`);
    }
  }

  /**
   * Ler do armazenamento compartilhado quando configurado (Upstash)
   */
  private async lerDoArmazenamento(): Promise<Record<string, Conversation> | null> {
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      try {
        const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(UPSTASH_KEY)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
        });
        if (!res.ok) {
          this.log(`❌ Upstash GET falhou: ${res.status}`);
          return {};
        }
        const json: any = await res.json();
        if (!json?.result) return {};
        return JSON.parse(json.result);
      } catch (e: any) {
        this.log(`❌ Erro ao ler Upstash: ${e?.message || e}`);
        return {};
      }
    }

    // Fallback local (/tmp) para desenvolvimento
    try {
      const data = await fs.readFile(CONVERSATIONS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.log('📝 Nenhuma conversa anterior encontrada');
        return {};
      }
      throw e;
    }
  }

  /**
   * Salvar no armazenamento compartilhado quando configurado (Upstash)
   */
  private async salvarNoArmazenamento(data: Record<string, Conversation>): Promise<void> {
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      const url = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(UPSTASH_KEY)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error(`Upstash SET falhou: ${res.status}`);
      }
      return;
    }

    await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async lerMeta(): Promise<{ resetAt?: number }> {
    // Lê metadata de reset no storage compartilhado
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      try {
        const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(UPSTASH_META_KEY)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
        });
        if (!res.ok) return {};
        const json: any = await res.json();
        if (!json?.result) return {};
        return JSON.parse(json.result);
      } catch (_e) {
        return {};
      }
    }

    try {
      const data = await fs.readFile(CONVERSATIONS_META_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (_e) {
      return {};
    }
  }

  private async salvarMeta(meta: { resetAt: number }): Promise<void> {
    // Persiste metadata de reset
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      const url = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(UPSTASH_META_KEY)}`;
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meta),
      });
      return;
    }

    await fs.writeFile(CONVERSATIONS_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
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
    const idNormalizado = this.normalizarWaId(waId);
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
    await this.salvarConversas();
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
      await this.salvarConversas();
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
   * Processar webhook do WhatsApp
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

        // Mapear contatos por wa_id
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

        // Mensagens recebidas
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

            // Verificar inscrição primeiro
            const conversa = this.obterOuCriarConversa(de);
            if (conversa.inscricaoStage) {
              conversa.inscricaoData = conversa.inscricaoData || {};
              const stage = conversa.inscricaoStage;

              if (stage === 'nome') conversa.inscricaoData.nome = texto;
              if (stage === 'bairro') conversa.inscricaoData.bairro = texto;
              if (stage === 'cidade') conversa.inscricaoData.cidade = texto;
              if (stage === 'estado') conversa.inscricaoData.estado = texto;
              if (stage === 'tipo_imovel') conversa.inscricaoData.tipo_imovel = texto;
              if (stage === 'pessoas') conversa.inscricaoData.pessoas = texto;
              if (stage === 'uid_indicador') conversa.inscricaoData.uid_indicador = texto;

              const avancar = async (proximo: Conversation['inscricaoStage'], pergunta: string) => {
                conversa.inscricaoStage = proximo;
                await this.salvarConversas();
                await this.enviarMensagem(de, pergunta);
              };

              try {
                if (stage === 'nome') {
                  await avancar('bairro', 'Perfeito! Agora me diga o seu bairro.');
                } else if (stage === 'bairro') {
                  await avancar('cidade', 'Agora, qual é a sua cidade?');
                } else if (stage === 'cidade') {
                  await avancar('estado', 'Qual é o seu estado?');
                } else if (stage === 'estado') {
                  await avancar('tipo_imovel', 'Qual é o tipo de imóvel? (casa, apto, comercial, etc.)');
                } else if (stage === 'tipo_imovel') {
                  await avancar('pessoas', 'Quantas pessoas moram no imóvel?');
                } else if (stage === 'pessoas') {
                  await avancar('uid_indicador', 'Você tem UID de indicador? Se sim, informe. Se não tiver, responda "não".');
                } else if (stage === 'uid_indicador') {
                  const dados = conversa.inscricaoData;
                  const resultado = await adicionarInscrito({
                    nome: dados?.nome || texto,
                    celular: de,
                    bairro: dados?.bairro || '',
                    cidade: dados?.cidade || '',
                    estado: dados?.estado || '',
                    tipo_imovel: dados?.tipo_imovel || '',
                    pessoas: dados?.pessoas || '',
                    uid_indicador: dados?.uid_indicador || '',
                  });

                  if (resultado.ok) {
                    conversa.inscricaoStage = undefined;
                    conversa.inscricaoData = undefined;
                    await this.salvarConversas();
                    const reply = `✅ Inscrição realizada com sucesso!\n\nBem-vindo(a) ${dados?.nome || ''}! 🎉\n\nUID: ${resultado.uid}\nID Imóvel: ${resultado.idImovel}\n\nAgora você pode enviar as leituras de água.`;
                    await this.enviarMensagem(de, reply);
                  } else {
                    const reply = `❌ Erro ao processar inscrição. ${resultado.erro || 'Tente novamente.'}`;
                    await this.enviarMensagem(de, reply);
                  }
                }
              } catch (erro: any) {
                this.log(`❌ Erro no fluxo de inscrição: ${erro?.message || erro}`);
                const reply = `❌ Erro ao processar inscrição. Tente novamente.`;
                try {
                  await this.enviarMensagem(de, reply);
                } catch (err: any) {
                  this.log(`❌ Falha ao enviar resposta: ${err?.message || err}`);
                }
              }

              continue;
            }

            // Verificar se já é inscrito
            const verificacao = await verificarInscrito(de);
            if (!verificacao.inscrito) {
              // Não está inscrito - pedir inscrição
              conversa.inscricaoStage = 'nome';
              conversa.inscricaoData = {};
              await this.salvarConversas();
              const reply = `Obrigado por entrar em contato! 👋\n\nVerifiquei que você não está entre nossos inscritos.\n\nPara continuar, inicie sua inscrição enviando seu nome completo.`;
              try {
                await this.enviarMensagem(de, reply);
              } catch (erro: any) {
                this.log(`❌ Falha ao enviar solicitação de inscrição: ${erro?.message || erro}`);
              }
              continue;
            }

            // Usuário é inscrito - continuar com fluxo normal
            this.log(`✅ Usuário inscrito: ${verificacao.nome} (${verificacao.uid})`);

            const textoNormalizado = this.normalizarTexto(texto).trim();
            const inscricoes = await listarInscricoesPorCelular(de);

            const menuOpcoes =
              '📋 Opções disponíveis:\n' +
              '• Meu UID\n' +
              '• Minhas casas\n' +
              '• Como indicar\n' +
              '• Enviar leitura (ex: 123 ou agua 123)';

            // Comandos rápidos
            if (textoNormalizado === 'meu uid') {
              await this.gastosManager.responderMeuUid(de, inscricoes);
              continue;
            }
            if (textoNormalizado === 'minhas casas') {
              await this.gastosManager.responderMinhasCasas(de, inscricoes);
              continue;
            }
            if (textoNormalizado === 'como indicar') {
              await this.gastosManager.responderComoIndicar(de, inscricoes);
              continue;
            }

            // Fluxo de leitura pendente
            if (conversa.pendingLeitura) {
              const { processado } = await this.gastosManager.processarPendingLeitura(
                de,
                texto,
                textoNormalizado,
                conversa.pendingLeitura,
                inscricoes
              );
              if (processado) {
                conversa.pendingLeitura = undefined;
                await this.salvarConversas();
                continue;
              }
            }

            // Interpretar envio de leitura usando GastosManager
            const { leituraValor, leituraTipo, leituraId } = this.gastosManager.parseArLeitura(textoNormalizado);

            if (leituraValor) {
              const { processado, pendingLeitura, erro } = await this.gastosManager.processarLeitura(
                de,
                texto,
                leituraValor,
                leituraTipo,
                leituraId,
                inscricoes
              );

              if (processado) {
                if (pendingLeitura) {
                  conversa.pendingLeitura = pendingLeitura;
                  await this.salvarConversas();
                  if (erro === 'NEED_ID') {
                    const lista = await this.gastosManager.formatarCasas(inscricoes);
                    await this.enviarMensagem(de, `Tenho mais de um imóvel para você. Informe o ID do imóvel:\n${lista}`);
                  } else if (erro === 'NEED_TYPE') {
                    await this.enviarMensagem(de, 'Qual o tipo de monitoramento? Responda com: água, energia ou gás.');
                  }
                }
                continue;
              }
            }

            // Mostrar menu se inscrito
            if (verificacao.inscrito) {
              await this.enviarMensagem(de, menuOpcoes);
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

    const idNormalizado = this.normalizarWaId(id);
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
    const idNormalizado = this.normalizarWaId(id);
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
    const paraNormalizado = this.normalizarWaId(para);
    this.log('📤 Enviando mensagem');
    this.log(`Para: ${paraNormalizado}`);
    this.log(`Texto: "${texto.substring(0, 60)}${texto.length > 60 ? '...' : ''}"`);
    
    try {
      await this.garantirResetAtualizado();
      // Garantir que conversa existe (será criada se não existir)
      this.obterOuCriarConversa(paraNormalizado);
      
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
      
      this.log('❌ Erro capturado');
      this.log(`Mensagem: ${errorMessage}`);
      this.log(`Status HTTP: ${status}`);
      if (errorCode) this.log(`Código: ${errorCode}`);
      if (errorType) this.log(`Tipo: ${errorType}`);
      
      throw erro;
    }
  }

  /**
   * Criar conversa com nome (para novas conversas)
   */
  async criarConversa(telefone: string, nome?: string): Promise<Conversation> {
    const telefoneNormalizado = this.normalizarWaId(telefone);
    this.log(`✨ Criando nova conversa: ${telefoneNormalizado}`);
    if (nome) this.log(`Nome: ${nome}`);
    
    await this.garantirResetAtualizado();
    const existente = this.conversations.get(telefoneNormalizado);
    if (existente) {
      this.log('ℹ️  Conversa já existe, atualizando nome se fornecido');
      if (nome && !existente.name) {
        existente.name = nome;
        await this.salvarConversas();
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
    await this.salvarConversas();
    
    // Recarregar do arquivo para garantir que está salvo
    await this.recarregarConversas();
    this.log('✅ Conversa criada e salva');
    
    // Retornar a conversa recarregada
    return this.conversations.get(telefoneNormalizado)!;
  }

  /**
   * Apagar todas as conversas persistidas
   */
  async limparConversas(): Promise<void> {
    this.conversations.clear();
    const resetAt = Date.now();
    this.resetAt = resetAt;
    await this.salvarMeta({ resetAt });
    await this.salvarNoArmazenamento({});
    this.log('🧹 Todas as conversas foram apagadas');
  }
}
