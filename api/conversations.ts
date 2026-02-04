import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../src/inbox/ConversationManager';
import { config, validateConfig } from '../src/config';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

const conversationManager = new ConversationManager();

/**
 * API de Conversas
 * GET /api/conversations - Listar todas
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Listar todas as conversas
  if (req.method === 'GET') {
    const conversas = conversationManager.obterConversas();
    const lista = conversas.map((c) => ({
      id: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lastMessage: c.lastMessage,
      lastTimestamp: c.lastTimestamp,
      unreadCount: c.unreadCount,
      isHuman: c.isHuman,
    }));

    res.json(lista);
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
