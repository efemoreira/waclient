import { WhatsApp } from '../wabapi';
import type { WebhookPayload, WhatsAppMessage } from '../wabapi/types';
import { config } from '../config';
import { promises as fs } from 'fs';

const CONVERSATIONS_FILE = '/tmp/conversations.json';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const UPSTASH_KEY = 'waclient:conversations';

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
}

/**
 * Gerenciador de conversas e mensagens
 * Responsável por armazenar e processar conversas via webhook
 */
export class ConversationManager {
  private client: WhatsApp;
  private conversations: Map<string, Conversation> = new Map();
  private lastLoadTime: number = 0;
  private loadTimeout: number = 1000; // Recarregar no máximo a cada 1 segundo

  constructor() {
    const versionStr = config.whatsapp.apiVersion.replace(/\.0$/, '');
    const apiVersion = parseInt(versionStr, 10);
    console.log(`🔧 ConversationManager: Usando API v${apiVersion}.0`);
    this.client = new WhatsApp({
      token: config.whatsapp.token,
      numberId: config.whatsapp.numberId,
      version: apiVersion,
    });
    
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
      const conversas = await this.lerDoArmazenamento();
      if (!conversas || typeof conversas !== 'object') {
        console.error('❌ Armazenamento de conversas inválido:', typeof conversas);
        return;
      }
      Object.entries(conversas).forEach(([id, conv]: [string, any]) => {
        this.conversations.set(id, conv);
      });
      console.log(`✅ Carregadas ${this.conversations.size} conversas`);
    } catch (e: any) {
      console.error('❌ Erro ao carregar conversas:', e?.message || e);
    }
  }

  /**
   * Recarregar conversas do arquivo (útil após mudanças)
   */
  async recarregarConversas(): Promise<void> {
    console.log('🔄 Recarregando conversas do arquivo...');
    this.conversations.clear();
    await this.carregarConversas();
  }

  /**
   * Salvar conversas no armazenamento (Upstash ou /tmp)
   */
  private async salvarConversas(): Promise<void> {
    try {
      const data: Record<string, Conversation> = {};
      this.conversations.forEach((conv, id) => {
        data[id] = conv;
      });
      await this.salvarNoArmazenamento(data);
      console.log(`💾 Salvas ${this.conversations.size} conversas`);
    } catch (e) {
      console.error('❌ Erro ao salvar conversas:', e);
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
          console.error(`❌ Upstash GET falhou: ${res.status}`);
          return {};
        }
        const json: any = await res.json();
        if (!json?.result) return {};
        return JSON.parse(json.result);
      } catch (e: any) {
        console.error('❌ Erro ao ler Upstash:', e?.message || e);
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
    const existente = this.conversations.get(waId);
    if (existente) {
      if (nome && !existente.name) existente.name = nome;
      return existente;
    }

    const conversa: Conversation = {
      id: waId,
      name: nome,
      phoneNumber: waId,
      unreadCount: 0,
      isHuman: false,
      messages: [],
    };
    this.conversations.set(waId, conversa);
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
    const conversa = this.obterOuCriarConversa(waId);
    const msg = conversa.messages.find((m) => m.id === mensagemId);
    if (msg) {
      msg.status = status;
      if (timestamp) {
        conversa.lastTimestamp = timestamp;
      }
      await this.salvarConversas();
      console.log(`    ✅ Status atualizado: ${mensagemId} -> ${status}`);
    } else {
      console.log(`    ⚠️  Status recebido para mensagem desconhecida: ${mensagemId}`);
    }
  }

  /**
   * Processar webhook do WhatsApp
   */
  async processarWebhook(payload: WebhookPayload): Promise<void> {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 PROCESSANDO WEBHOOK');
    console.log('='.repeat(50));

    const entries = payload.entry || [];
    if (entries.length === 0) {
      console.log('❌ Webhook sem entry');
      return;
    }

    for (const entrada of entries) {
      const changes = entrada.changes || [];
      for (const mudanca of changes) {
        const valor: any = mudanca?.value;
        if (!valor) {
          console.log('❌ Nenhum value encontrado na change');
          continue;
        }

        const metadata = valor.metadata;
        if (metadata?.phone_number_id) {
          console.log(`📱 Phone Number ID: ${metadata.phone_number_id}`);
        }

        // Erros no nível do value
        if (Array.isArray(valor.errors) && valor.errors.length > 0) {
          console.log(`❌ Erros no webhook (value.errors): ${valor.errors.length}`);
        }

        // Mapear contatos por wa_id
        const contacts = Array.isArray(valor.contacts) ? valor.contacts : [];
        const contatoPorId = new Map<string, string>();
        for (const c of contacts) {
          if (c?.wa_id) {
            contatoPorId.set(c.wa_id, c?.profile?.name || 'Desconhecido');
          }
        }

        // Mensagens recebidas
        if (Array.isArray(valor.messages) && valor.messages.length > 0) {
          console.log(`📨 Processando ${valor.messages.length} mensagem(ns)...`);
          for (const msg of valor.messages) {
            const de = msg?.from;
            if (!de) {
              console.log('    ⚠️  Mensagem sem origem');
              continue;
            }

            if (Array.isArray(msg?.errors) && msg.errors.length > 0) {
              console.log(`    ❌ Mensagem com erro (type=${msg?.type || 'unknown'})`);
            }

            const texto = this.extrairTexto(msg);
            const timestamp = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
            const nome = contatoPorId.get(de);
            if (nome) {
              this.obterOuCriarConversa(de, nome);
            }

            await this.adicionarMensagem(de, 'in', texto, msg.id, timestamp);
            console.log(`    ✅ De ${de}: "${texto.substring(0, 50)}..."`);
          }
        }

        // Status de mensagens enviadas
        if (Array.isArray(valor.statuses) && valor.statuses.length > 0) {
          console.log(`📊 Processando ${valor.statuses.length} status(es)`);
          for (const st of valor.statuses) {
            const recipientId = st?.recipient_id;
            const msgId = st?.id;
            const status = st?.status;
            const ts = st?.timestamp ? Number(st.timestamp) * 1000 : undefined;
            if (recipientId && msgId && status) {
              await this.atualizarStatusMensagem(recipientId, msgId, status, ts);
            }
          }
        }
      }
    }

    console.log('✅ WEBHOOK PROCESSADO\n');
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
    
    console.log(`  🔍 Buscando conversa: ${id}`);
    const conversa = this.conversations.get(id);
    if (conversa) {
      conversa.unreadCount = 0;
      console.log(`    ✅ Encontrada com ${conversa.messages.length} mensagens`);
    } else {
      console.log(`    ❌ Não encontrada`);
    }
    return conversa || null;
  }

  /**
   * Alternar controle manual da conversa
   */
  alternarControleManual(id: string, ativo: boolean): boolean {
    console.log(`  🔄 Alternando controle manual: ${id} -> ${ativo ? '👤 Humano' : '🤖 Bot'}`);
    const conversa = this.conversations.get(id);
    if (!conversa) {
      console.log(`    ❌ Conversa não encontrada`);
      return false;
    }
    conversa.isHuman = ativo;
    console.log(`    ✅ Controle alterado`);
    return true;
  }

  /**
   * Enviar mensagem e armazenar registro
   */
  async enviarMensagem(para: string, texto: string): Promise<string> {
    console.log(`  📤 Enviando mensagem`);
    console.log(`    Para: ${para}`);
    console.log(`    Texto: "${texto.substring(0, 60)}${texto.length > 60 ? '...' : ''}"`);
    
    try {
      // Garantir que conversa existe (será criada se não existir)
      this.obterOuCriarConversa(para);
      
      console.log(`    🔄 Chamando client.sendMessage(${para}, texto)`);
      const resposta = await this.client.sendMessage(para, texto);
      
      // Log status da resposta
      console.log(`    📨 Resposta: status ${resposta.status}, mensagens: ${resposta.data?.messages?.length || 0}`);
      
      const mensagemId = resposta.data?.messages?.[0]?.id;
      
      await this.adicionarMensagem(para, 'out', texto, mensagemId, Date.now());
      console.log(`    ✅ Enviada com ID: ${mensagemId}`);
      
      return mensagemId || '';
    } catch (erro: any) {
      const errorMessage = erro?.message || 'Desconhecido';
      const errorCode = erro?.response?.data?.error?.code || null;
      const errorType = erro?.response?.data?.error?.type || null;
      const status = erro?.response?.status || 'unknown';
      
      console.log(`    ❌ Erro capturado`);
      console.log(`    Mensagem: ${errorMessage}`);
      console.log(`    Status HTTP: ${status}`);
      if (errorCode) console.log(`    Código: ${errorCode}`);
      if (errorType) console.log(`    Tipo: ${errorType}`);
      
      throw erro;
    }
  }

  /**
   * Criar conversa com nome (para novas conversas)
   */
  async criarConversa(telefone: string, nome?: string): Promise<Conversation> {
    console.log(`  ✨ Criando nova conversa: ${telefone}`);
    if (nome) console.log(`    Nome: ${nome}`);
    
    const existente = this.conversations.get(telefone);
    if (existente) {
      console.log(`    ℹ️  Conversa já existe, atualizando nome se fornecido`);
      if (nome && !existente.name) {
        existente.name = nome;
        await this.salvarConversas();
      }
      return existente;
    }

    const conversa: Conversation = {
      id: telefone,
      name: nome,
      phoneNumber: telefone,
      unreadCount: 0,
      isHuman: false,
      messages: [],
    };
    
    this.conversations.set(telefone, conversa);
    await this.salvarConversas();
    
    // Recarregar do arquivo para garantir que está salvo
    await this.recarregarConversas();
    console.log(`    ✅ Conversa criada e salva`);
    
    // Retornar a conversa recarregada
    return this.conversations.get(telefone)!;
  }
}
