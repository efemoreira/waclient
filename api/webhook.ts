import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';
import { config, validateConfig } from '../src/config';

// Validar config
if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

const conversationManager = new ConversationManager();

/**
 * Webhook do WhatsApp
 * GET: Verificação do webhook (desafio)
 * POST: Receber mensagens
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const verifyToken = config.server.verifyToken;

  // GET - Verificação de webhook
  if (req.method === 'GET') {
    const modo = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const desafio = req.query['hub.challenge'] as string;

    if (modo === 'subscribe' && token === verifyToken && desafio) {
      console.log('✅ Webhook verificado');
      res.status(200).send(desafio);
      return;
    }

    console.log('❌ Falha na verificação do webhook');
    res.status(403).send('Forbidden');
    return;
  }

  // POST - Receber webhook
  if (req.method === 'POST') {
    console.log('\n=== WEBHOOK POST ===');

    try {
      const payload = req.body as WebhookPayload;
      conversationManager.processarWebhook(payload);
      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('❌ Erro ao processar webhook:', error?.message);
      res.status(200).json({ ok: true }); // Sempre retornar 200
    }
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
