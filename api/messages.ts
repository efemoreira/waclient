import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import { config, validateConfig } from '../src/config';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

const conversationManager = new ConversationManager();

/**
 * Enviar mensagem
 * POST /api/messages
 * Body: { to: string, text: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido' });
    return;
  }

  const { to, text } = req.body as { to?: string; text?: string };

  if (!to || !text) {
    res.status(400).json({ erro: 'Parâmetros inválidos (to, text)' });
    return;
  }

  try {
    const mensagemId = await conversationManager.enviarMensagem(to, text);
    res.json({ ok: true, mensagemId });
  } catch (erro: any) {
    res.status(500).json({
      erro:
        erro?.response?.data?.error?.message ||
        erro?.message ||
        'Erro ao enviar mensagem',
    });
  }
}
