import { WhatsApp } from '../wabapi';
import type { WebhookPayload, WhatsAppMessage } from '../wabapi/types';
import { config } from '../config';
import { promises as fs } from 'fs';

const CONVERSATIONS_FILE = '/tmp/conversations.json';

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
    
    // Carregar conversas do arquivo
    this.carregarConversas().catch(console.error);
  }

  /**
   * Carregar conversas do arquivo
   */
  private async carregarConversas(): Promise<void> {
    try {
      const data = await fs.readFile(CONVERSATIONS_FILE, 'utf-8');
      const conversas = JSON.parse(data);
      Object.entries(conversas).forEach(([id, conv]: [string, any]) => {
        this.conversations.set(id, conv);
      });
      console.log(`✅ Carregadas ${this.conversations.size} conversas`);
    } catch (e) {
      // Arquivo não existe ainda, será criado na primeira conversa
      console.log('📝 Nenhuma conversa anterior encontrada');
    }
  }

  /**
   * Salvar conversas no arquivo
   */
  private async salvarConversas(): Promise<void> {
    try {
      const data: Record<string, Conversation> = {};
      this.conversations.forEach((conv, id) => {
        data[id] = conv;
      });
      await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`💾 Salvas ${this.conversations.size} conversas em ${CONVERSATIONS_FILE}`);
    } catch (e) {
      console.error('❌ Erro ao salvar conversas:', e);
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
   * Processar webhook do WhatsApp
   */
  async processarWebhook(payload: WebhookPayload): Promise<void> {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 PROCESSANDO WEBHOOK');
    console.log('='.repeat(50));

    const entrada = payload.entry?.[0];
    const mudanca = entrada?.changes?.[0];
    const valor = mudanca?.value;

    if (!valor) {
      console.log('❌ Nenhum valor encontrado no webhook');
      return;
    }

    const contato = valor.contacts?.[0];
    const nome = contato?.profile?.name;
    console.log(`👤 Contato: ${nome || 'Desconhecido'}`);

    // Processar mensagens
    if (valor.messages && valor.messages.length > 0) {
      console.log(`📨 Processando ${valor.messages.length} mensagem(ns)...`);
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
        await this.adicionarMensagem(de, 'in', texto, msg.id, timestamp);
        console.log(`    ✅ De ${de}: "${texto.substring(0, 50)}..."`);
      }
    }

    // Processar status
    if (valor.statuses && valor.statuses.length > 0) {
      console.log(`📊 Processando ${valor.statuses.length} status(es)`);
    }

    console.log('✅ WEBHOOK PROCESSADO\n');
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
      
      const resposta = await this.client.sendMessage(para, texto);
      const mensagemId = resposta.data?.messages?.[0]?.id;
      
      await this.adicionarMensagem(para, 'out', texto, mensagemId, Date.now());
      console.log(`    ✅ Enviada com ID: ${mensagemId}`);
      
      return mensagemId || '';
    } catch (erro: any) {
      console.log(`    ❌ Erro: ${erro?.message || 'Desconhecido'}`);
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
    console.log(`    ✅ Conversa criada e salva`);
    return conversa;
  }
}
