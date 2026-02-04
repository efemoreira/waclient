import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import type { WebhookPayload } from '../src/wabapi/types';

const conversationManager = new ConversationManager();

/**
 * Endpoint de teste para simular webhooks
 * POST /api/test/webhook - Simular uma mensagem recebida
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Apenas POST permitido' });
    return;
  }

  try {
    const { phone, message, name } = req.body as {
      phone?: string;
      message?: string;
      name?: string;
    };

    if (!phone || !message) {
      res.status(400).json({ erro: 'Parâmetros obrigatórios: phone, message' });
      return;
    }

    // Criar payload simulado do webhook
    const timestamp = Math.floor(Date.now() / 1000);
    const payload: WebhookPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '5585999999999',
                  phone_number_id: '123456789',
                },
                contacts: [
                  {
                    profile: {
                      name: name || `Contato ${phone}`,
                    },
                    wa_id: phone,
                  },
                ],
                messages: [
                  {
                    from: phone,
                    id: `msg_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
                    timestamp: timestamp.toString(),
                    type: 'text',
                    text: {
                      body: message,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // Processar o webhook
    await conversationManager.processarWebhook(payload);

    res.json({
      ok: true,
      message: `✅ Mensagem de teste adicionada da conversa ${phone}`,
    });
  } catch (error: any) {
    console.error('❌ Erro no test webhook:', error?.message);
    res.status(500).json({
      erro: error?.message || 'Erro ao processar mensagem de teste',
    });
  }
}
