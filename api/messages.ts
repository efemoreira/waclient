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
    console.log('❌ POST /api/messages - Método não permitido: ' + req.method);
    res.status(405).json({ erro: 'Método não permitido' });
    return;
  }

  console.log('\n' + '='.repeat(50));
  console.log('💬 POST /api/messages');

  const { to, text } = req.body as { to?: string; text?: string };

  if (!to || !text) {
    console.log('  ❌ Parâmetros inválidos');
    console.log('  Para: ' + (to || 'vazio'));
    console.log('  Texto: ' + (text ? 'presente' : 'vazio'));
    console.log('='.repeat(50) + '\n');
    res.status(400).json({ erro: 'Parâmetros inválidos (to, text)' });
    return;
  }

  try {
    console.log(`  📱 Para: ${to}`);
    console.log(`  ✏️  Texto: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    const mensagemId = await conversationManager.enviarMensagem(to, text);
    
    console.log(`  ✅ Mensagem enviada com ID: ${mensagemId}`);
    console.log('='.repeat(50) + '\n');
    
    try {
      res.json({ ok: true, mensagemId });
    } catch (jsonErr) {
      console.error('ERRO ao serializar resposta de sucesso:', jsonErr);
      res.status(500).json({ erro: 'Erro ao serializar resposta' });
    }
  } catch (erro: any) {
    try {
      const mensagem = (erro?.message ? String(erro.message) : 'Erro ao enviar mensagem');
      const status = (erro?.response?.status && typeof erro.response.status === 'number') ? erro.response.status : 500;
      const errorCode = (erro?.response?.data?.error?.code && typeof erro.response.data.error.code === 'number') ? erro.response.data.error.code : null;
      const errorType = (erro?.response?.data?.error?.type && typeof erro.response.data.error.type === 'string') ? String(erro.response.data.error.type) : null;
      const fbtrace = (erro?.response?.data?.error?.fbtrace_id && typeof erro.response.data.error.fbtrace_id === 'string') ? String(erro.response.data.error.fbtrace_id) : null;
      
      console.log(`  ❌ ERRO: ${mensagem}`);
      console.log(`  Status HTTP: ${status}`);
      if (errorCode) console.log(`  Código do erro: ${errorCode}`);
      if (errorType) console.log(`  Tipo: ${errorType}`);
      if (fbtrace) console.log(`  Trace ID: ${fbtrace}`);
      console.log('='.repeat(50) + '\n');
      
      const responseBody: Record<string, any> = { erro: mensagem };
      
      if (errorCode) responseBody.codigoErro = errorCode;
      if (errorType) responseBody.type = errorType;
      if (fbtrace) responseBody.fbtrace_id = fbtrace;
      
      res.status(status).json(responseBody);
    } catch (handlerErr) {
      console.error('ERRO CRÍTICO no tratamento de erro:', handlerErr);
      res.status(500).json({ erro: 'Erro no servidor' });
    }
  }
}

