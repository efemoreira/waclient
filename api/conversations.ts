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
 * GET /api/conversations?id=xxx - Obter específica
 * POST /api/conversations?id=xxx&action=assume - Assumir controle
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

  // Extrair ID da URL ou query
  const urlParts = req.url?.split('/') || [];
  const idFromUrl = urlParts[urlParts.length - 1]?.split('?')[0];
  const { id: idFromQuery, action } = req.query;
  const id = idFromUrl && idFromUrl !== 'conversations' ? idFromUrl : (idFromQuery as string);

  // GET - Listar conversas ou obter específica
  if (req.method === 'GET') {
    if (id) {
      // Obter conversa específica
      const conversa = conversationManager.obterConversa(id);
      if (!conversa) {
        res.status(404).json({ erro: 'Conversa não encontrada' });
        return;
      }
      res.json(conversa);
      return;
    }

    // Listar todas as conversas
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

  // POST - Assumir controle da conversa
  if (req.method === 'POST') {
    const { isHuman } = req.body as { isHuman?: boolean };

    if (!id) {
      res.status(400).json({ erro: 'ID da conversa não especificado' });
      return;
    }

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
