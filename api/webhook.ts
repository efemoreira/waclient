/**
 * api/webhook.ts — Endpoint do Webhook do WhatsApp
 * ─────────────────────────────────────────────────────────────────────────────
 * Este arquivo é uma Vercel Serverless Function. Cada request HTTP vira uma
 * chamada a essa função.
 *
 * GET  /api/webhook → Verificação do webhook pela Meta.
 *   Quando você cadastra o webhook no painel do Meta for Developers, a Meta
 *   faz um GET com os parâmetros hub.mode, hub.verify_token e hub.challenge.
 *   Se o token bater com WHATSAPP_WEBHOOK_TOKEN, respondemos com hub.challenge
 *   para confirmar que somos o dono da URL.
 *
 * POST /api/webhook → Receber mensagens e eventos.
 *   Cada vez que alguém envia mensagem para o número do WhatsApp, a Meta faz
 *   um POST aqui com o payload JSON. Repassamos para o ConversationManager.
 *
 * Segurança: a Meta não usa um header de autenticação no POST — a segurança é
 * feita pelo verify_token no GET. Para maior segurança em produção, considere
 * validar a assinatura HMAC (X-Hub-Signature-256).
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';
import { logger } from '../src/utils/logger';

// Uma única instância reutilizada enquanto o container Vercel está "quente".
// Em ambientes serverless, o container pode ser criado a cada request (cold start)
// ou reutilizado entre requests próximos (warm start).
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
  logger.info('Webhook', `REQUEST ${req.method}`);
  

  // GET - Verificação de webhook
  if (req.method === 'GET') {
    const modo = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const desafio = req.query['hub.challenge'] as string;

    logger.info('Webhook', `VERIFICATION mode=${modo || 'missing'}`);
    logger.info('Webhook', `Token match: ${token === WEBHOOK_TOKEN ? 'YES' : 'NO'}`);
    logger.info('Webhook', `Challenge present: ${desafio ? 'YES' : 'NO'}`);

    if (modo === 'subscribe' && token === WEBHOOK_TOKEN && desafio) {
      logger.info('Webhook', 'VERIFIED');
      res.status(200).send(desafio);
      return;
    }

    logger.warn('Webhook', 'VERIFICATION FAILED');
    res.status(403).json({ erro: 'Token inválido ou parâmetros faltando' });
    return;
  }

  // POST - Receber webhook
  if (req.method === 'POST') {
    logger.info('Webhook', 'POST - Processando');

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

      logger.debug('Webhook', 'Payload entrada (parcial)', JSON.stringify(payload).substring(0, 200) + '...');
      console.log(`📊 Resumo: entries=${entryCount}, messages=${messageCount}, statuses=${statusCount}`);

      await conversationManager.processarWebhook(payload);
      logger.info('Webhook', 'PROCESSADO COM SUCESSO');
      res.status(200).json({ ok: true });
    } catch (error: any) {
      logger.error('Webhook', 'ERRO ao processar webhook', {
        message: error?.message,
        stack: error?.stack,
      });
      res.status(200).json({ ok: true }); // Sempre retornar 200
    }
    return;
  }

  logger.warn('Webhook', `MÉTODO NÃO PERMITIDO: ${req.method}`);
  res.status(405).json({ erro: 'Método não permitido' });
}
