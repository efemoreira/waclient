import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConversationManager } from '../../src/inbox/ConversationManager';
import { config, validateConfig } from '../../src/config';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

const conversationManager = new ConversationManager();

/**
 * API de Conversa Específica
 * GET /api/conversations/[id] - Obter conversa
 * POST /api/conversations/[id]/assume - Assumir controle
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ erro: 'ID não especificado' });
    return;
  }

  // GET - Obter conversa específica
  if (req.method === 'GET') {
    const conversa = conversationManager.obterConversa(id);
    if (!conversa) {
      res.status(404).json({ erro: 'Conversa não encontrada' });
      return;
    }
    res.json(conversa);
    return;
  }

  // POST - Assumir controle
  if (req.method === 'POST') {
    const { isHuman } = req.body as { isHuman?: boolean };

    const sucesso = conversationManager.alternarControleManual(
      id,
      Boolean(isHuman)
    );

    if (!sucesso) {
      res.status(404).json({ erro: 'Conversa não encontrada' });
      return;
    }

    res.json({ ok: true, isHuman });
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
