import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';

const conversationManager = new ConversationManager();

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
  // GET - Verificação de webhook
  if (req.method === 'GET') {
    const modo = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const desafio = req.query['hub.challenge'] as string;

    console.log('🔍 Webhook validation:');
    console.log('  Token recebido:', token);
    console.log('  Token esperado:', WEBHOOK_TOKEN);
    console.log('  Match:', token === WEBHOOK_TOKEN);

    if (modo === 'subscribe' && token === WEBHOOK_TOKEN && desafio) {
      console.log('✅ Webhook verificado com sucesso');
      res.status(200).send(desafio);
      return;
    }

    console.log('❌ Webhook validation failed');
    res.status(403).json({ erro: 'Token inválido ou parâmetros faltando' });
    return;
  }

  // POST - Receber webhook
  if (req.method === 'POST') {
    console.log('\n=== WEBHOOK POST ===');

    try {
      const payload = req.body as WebhookPayload;
      await conversationManager.processarWebhook(payload);
      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('❌ Erro ao processar webhook:', error?.message);
      res.status(200).json({ ok: true }); // Sempre retornar 200
    }
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
