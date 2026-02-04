import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';
import { config, validateConfig, lerConfigSalva } from '../src/config';
import { promises as fs } from 'fs';

// Validar config
if (!validateConfig()) {
  console.error('⚠️ Configuração pode estar incompleta');
}

const conversationManager = new ConversationManager();

/**
 * Ler token do webhook (com fallback)
 */
async function obterVerifyToken(): Promise<string> {
  try {
    const configSalva = await lerConfigSalva();
    if (configSalva?.webhookToken) {
      return configSalva.webhookToken;
    }
  } catch (e) {
    // ignorar
  }
  return process.env.WHATSAPP_WEBHOOK_TOKEN || '';
}

/**
 * Webhook do WhatsApp
 * GET: Verificação do webhook (desafio)
 * POST: Receber mensagens
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const verifyToken = await obterVerifyToken();

  // GET - Verificação de webhook
  if (req.method === 'GET') {
    const modo = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const desafio = req.query['hub.challenge'] as string;

    console.log('🔍 Webhook validation attempt:');
    console.log('  modo:', modo);
    console.log('  token recebido:', token);
    console.log('  token esperado:', verifyToken);
    console.log('  desafio:', desafio ? 'presente' : 'ausente');

    if (modo === 'subscribe' && token === verifyToken && desafio) {
      console.log('✅ Webhook verificado com sucesso');
      res.status(200).send(desafio);
      return;
    }

    console.log('❌ Webhook validation failed');
    res.status(403).json({ erro: 'Token inválido' });
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
