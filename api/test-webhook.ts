import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint de teste para simular webhooks
 * POST /api/test-webhook - Simular uma mensagem recebida
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Apenas POST permitido' });
  }

  try {
    const body = req.body;
    const { phone, message, name } = body as Record<string, any>;

    if (!phone || !message) {
      return res.status(400).json({ erro: 'phone e message são obrigatórios' });
    }

    console.log('✅ Teste recebido:', { phone, message, name });

    // Responder com sucesso imediatamente
    return res.status(200).json({
      ok: true,
      message: `✅ Teste recebido: ${message}`,
    });
  } catch (error: any) {
    console.error('❌ Erro:', error?.message || error);
    return res.status(500).json({
      ok: false,
      erro: error?.message || 'Erro interno',
    });
  }
}
