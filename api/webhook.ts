import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';

const conversationManager = new ConversationManager();

// Último webhook recebido (para debug)
let lastWebhookInfo: {
  receivedAt: string;
  hasEntry: boolean;
  entryCount: number;
  messageCount: number;
  statusCount: number;
} | null = null;

// Tokens da variável de ambiente
const WEBHOOK_TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || 'seu-token-aqui';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';

/**
 * Webhook do WhatsApp
 * GET: Verificação do webhook (desafio)
 * POST: Receber mensagens
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('\n' + '='.repeat(60));
  console.log('📨 WEBHOOK REQUEST - ' + req.method);
  console.log('='.repeat(60));
  
  // GET - Debug de webhook
  if (req.method === 'GET' && req.query?.debug === '1' && !req.query['hub.mode']) {
    res.status(200).json({
      ok: true,
      lastWebhook: lastWebhookInfo,
    });
    return;
  }

  // GET - Verificação de webhook
  if (req.method === 'GET') {
    const modo = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const desafio = req.query['hub.challenge'] as string;

    console.log('🔍 WEBHOOK VERIFICATION');
    console.log('  Mode:', modo);
    console.log('  Token match:', token === WEBHOOK_TOKEN ? '✅ YES' : '❌ NO');
    console.log('  Challenge present:', desafio ? '✅ YES' : '❌ NO');

    if (modo === 'subscribe' && token === WEBHOOK_TOKEN && desafio) {
      console.log('✅ WEBHOOK VERIFIED SUCCESSFULLY\n');
      res.status(200).send(desafio);
      return;
    }

    console.log('❌ WEBHOOK VERIFICATION FAILED\n');
    res.status(403).json({ erro: 'Token inválido ou parâmetros faltando' });
    return;
  }

  // POST - Receber webhook
  if (req.method === 'POST') {
    console.log('📥 WEBHOOK POST - Processando...');

    try {
      const payload = req.body as WebhookPayload;
      const entryCount = payload?.entry?.length || 0;
      const change = payload?.entry?.[0]?.changes?.[0]?.value;
      const messageCount = change?.messages?.length || 0;
      const statusCount = change?.statuses?.length || 0;

      lastWebhookInfo = {
        receivedAt: new Date().toISOString(),
        hasEntry: entryCount > 0,
        entryCount,
        messageCount,
        statusCount,
      };

      console.log('📦 Payload entrada:', JSON.stringify(payload).substring(0, 200) + '...');
      console.log(`📊 Resumo: entries=${entryCount}, messages=${messageCount}, statuses=${statusCount}`);

      await conversationManager.processarWebhook(payload);
      console.log('✅ WEBHOOK PROCESSADO COM SUCESSO\n');
      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('❌ ERRO ao processar webhook:');
      console.error('   Message:', error?.message);
      console.error('   Stack:', error?.stack);
      res.status(200).json({ ok: true }); // Sempre retornar 200
    }
    return;
  }

  console.log('❌ MÉTODO NÃO PERMITIDO:', req.method);
  res.status(405).json({ erro: 'Método não permitido' });
}
