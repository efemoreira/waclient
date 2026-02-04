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
 * POST /api/conversations - Criar nova conversa (body: { phone, name? })
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
    console.log('\n' + '='.repeat(50));
    console.log('📞 GET /api/conversations');
    
    if (id) {
      // Obter conversa específica
      console.log(`  ID solicitado: ${id}`);
      const conversa = conversationManager.obterConversa(id);
      if (!conversa) {
        console.log(`  ❌ Conversa não encontrada`);
        res.status(404).json({ erro: 'Conversa não encontrada' });
        return;
      }
      console.log(`  ✅ Conversa encontrada: ${conversa.name}`);
      console.log(`  📊 Mensagens: ${conversa.messages.length}, Não lidas: ${conversa.unreadCount}`);
      console.log('='.repeat(50) + '\n');
      res.json(conversa);
      return;
    }

    // Listar todas as conversas
    const conversas = conversationManager.obterConversas();
    console.log(`  📊 Total: ${conversas.length} conversa(s)`);
    
    const lista = conversas.map((c) => ({
      id: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lastMessage: c.lastMessage,
      lastTimestamp: c.lastTimestamp,
      unreadCount: c.unreadCount,
      isHuman: c.isHuman,
    }));

    console.log(`  ✅ Retornando lista`);
    console.log('='.repeat(50) + '\n');
    res.json(lista);
    return;
  }

  // POST - Criar nova conversa ou assumir controle
  if (req.method === 'POST') {
    console.log('\n' + '='.repeat(50));
    console.log('📞 POST /api/conversations');
    const { phone, name, isHuman } = req.body as { 
      phone?: string; 
      name?: string; 
      isHuman?: boolean;
    };

    // Modo 1: Criar nova conversa (phone no body)
    if (phone && !id) {
      console.log(`  ✨ Criando nova conversa`);
      console.log(`    Telefone: ${phone}`);
      if (name) console.log(`    Nome: ${name}`);
      
      try {
        const conversa = await conversationManager.criarConversa(phone, name);
        console.log(`  ✅ Conversa criada/atualizada`);
        console.log('='.repeat(50) + '\n');
        res.json({ ok: true, conversa });
        return;
      } catch (erro: any) {
        console.log(`  ❌ Erro ao criar conversa: ${erro?.message || 'Desconhecido'}`);
        console.log('='.repeat(50) + '\n');
        res.status(500).json({ erro: erro?.message || 'Erro ao criar conversa' });
        return;
      }
    }

    // Modo 2: Assumir controle (id em query, isHuman no body)
    if (!id) {
      console.log(`  ❌ ID da conversa não especificado`);
      console.log('='.repeat(50) + '\n');
      res.status(400).json({ erro: 'ID da conversa não especificado' });
      return;
    }

    console.log(`  ID: ${id}`);
    console.log(`  Assumir como humano: ${isHuman}`);

    const sucesso = conversationManager.alternarControleManual(
      id,
      Boolean(isHuman)
    );

    if (!sucesso) {
      console.log(`  ❌ Conversa não encontrada`);
      console.log('='.repeat(50) + '\n');
      res.status(404).json({ erro: 'Conversa não encontrada' });
      return;
    }

    console.log(`  ✅ Controle alterado com sucesso`);
    console.log('='.repeat(50) + '\n');

    res.json({ ok: true, isHuman });
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
