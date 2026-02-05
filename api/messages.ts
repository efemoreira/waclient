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
    res.json({ ok: true, mensagemId });
  } catch (erro: any) {
    const mensagem =
      (typeof erro?.response?.data?.error?.message === 'string' ? erro.response.data.error.message : '') ||
      (typeof erro?.message === 'string' ? erro.message : '') ||
      'Erro ao enviar mensagem';
    
    const status = typeof erro?.response?.status === 'number' ? erro.response.status : 500;
    const errorCode = typeof erro?.response?.data?.error?.code === 'number' ? erro.response.data.error.code : null;
    const errorType = typeof erro?.response?.data?.error?.type === 'string' ? erro.response.data.error.type : null;
    const fbtrace = typeof erro?.response?.data?.error?.fbtrace_id === 'string' ? erro.response.data.error.fbtrace_id : null;
    
    console.log(`  ❌ ERRO: ${mensagem}`);
    console.log(`  Status HTTP: ${status}`);
    if (errorCode) console.log(`  Código do erro: ${errorCode}`);
    if (errorType) console.log(`  Tipo: ${errorType}`);
    if (fbtrace) console.log(`  Trace ID: ${fbtrace}`);
    console.log('='.repeat(50) + '\n');
    
    const responseBody: any = { erro: String(mensagem) };
    
    if (errorCode || errorType || fbtrace) {
      responseBody.detalhes = {};
      if (errorCode) responseBody.detalhes.code = Number(errorCode);
      if (errorType) responseBody.detalhes.type = String(errorType);
      if (fbtrace) responseBody.detalhes.fbtrace_id = String(fbtrace);
    }
    
    if (errorCode) responseBody.codigoErro = Number(errorCode);
    
    res.status(status).json(responseBody);
  }
}
