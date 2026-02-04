import { WhatsApp } from '../wabapi';
import type { WebhookPayload, WhatsAppMessage } from '../wabapi/types';
import { config } from '../config';

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

  constructor() {
    this.client = new WhatsApp({
      token: config.whatsapp.token,
      numberId: config.whatsapp.numberId,
    });
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
  private adicionarMensagem(
    waId: string,
    direcao: 'in' | 'out',
    texto: string,
    mensagemId?: string,
    timestamp?: number
  ): void {
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
  }

  /**
   * Processar webhook do WhatsApp
   */
  processarWebhook(payload: WebhookPayload): void {
    console.log('\n🔍 Processando webhook...');

    const entrada = payload.entry?.[0];
    const mudanca = entrada?.changes?.[0];
    const valor = mudanca?.value;

    if (!valor) {
      console.log('❌ Nenhum valor encontrado no webhook');
      return;
    }

    const contato = valor.contacts?.[0];
    const nome = contato?.profile?.name;

    // Processar mensagens
    if (valor.messages && valor.messages.length > 0) {
      console.log(`✅ Processando ${valor.messages.length} mensagem(ns)...`);
      for (const msg of valor.messages) {
        const de = msg.from;
        if (!de) {
          console.log('    ⚠️  Mensagem sem origem');
          continue;
        }

        const texto = this.extrairTexto(msg);
        const timestamp = msg.timestamp
          ? Number(msg.timestamp) * 1000
          : Date.now();
        this.adicionarMensagem(de, 'in', texto, msg.id, timestamp);
        console.log(`    ✅ "${texto}"`);
      }
    }

    // Processar status
    if (valor.statuses && valor.statuses.length > 0) {
      console.log(`ℹ️  Processando ${valor.statuses.length} status(es)`);
    }
  }

  /**
   * Obter todas as conversas ordenadas por recency
   */
  obterConversas(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
      .map((c) => ({
        ...c,
        messages: c.messages.slice(-50), // Limitar últimas 50 mensagens
      }));
  }

  /**
   * Obter conversa específica e marcar como lida
   */
  obterConversa(id: string): Conversation | null {
    const conversa = this.conversations.get(id);
    if (conversa) {
      conversa.unreadCount = 0;
    }
    return conversa || null;
  }

  /**
   * Alternar controle manual da conversa
   */
  alternarControleManual(id: string, ativo: boolean): boolean {
    const conversa = this.conversations.get(id);
    if (!conversa) return false;
    conversa.isHuman = ativo;
    return true;
  }

  /**
   * Enviar mensagem e armazenar registro
   */
  async enviarMensagem(para: string, texto: string): Promise<string> {
    const resposta = await this.client.sendMessage(para, texto);
    const mensagemId = resposta.data?.messages?.[0]?.id;
    this.adicionarMensagem(para, 'out', texto, mensagemId, Date.now());
    return mensagemId || '';
  }
}
