import { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';

const configFile = '/tmp/whatsapp-config.json';

interface WhatsAppConfig {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookToken: string;
  timestamp: number;
}

const defaultConfig: WhatsAppConfig = {
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  webhookToken: '',
  timestamp: 0,
};

async function lerConfig(): Promise<WhatsAppConfig> {
  try {
    const data = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultConfig;
  }
}

async function salvarConfig(config: WhatsAppConfig): Promise<void> {
  config.timestamp = Date.now();
  await fs.writeFile(configFile, JSON.stringify(config, null, 2));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Retorna configuração atual (sem token sensível)
  if (req.method === 'GET') {
    const config = await lerConfig();
    res.json({
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      webhookToken: config.webhookToken,
      hasAccessToken: !!config.accessToken,
      timestamp: config.timestamp,
    });
    return;
  }

  // POST - Salva configuração
  if (req.method === 'POST') {
    const { phoneNumberId, businessAccountId, accessToken, webhookToken } = req.body;

    if (!phoneNumberId || !businessAccountId || !accessToken || !webhookToken) {
      res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
      return;
    }

    try {
      const novaConfig: WhatsAppConfig = {
        phoneNumberId,
        businessAccountId,
        accessToken,
        webhookToken,
        timestamp: Date.now(),
      };

      await salvarConfig(novaConfig);

      res.json({
        ok: true,
        mensagem: 'Configuração salva com sucesso',
        config: {
          phoneNumberId,
          businessAccountId,
          webhookToken,
        },
      });
    } catch (erro: any) {
      res.status(500).json({ erro: erro.message });
    }
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}

// Exportar função para ler config em outros módulos
export { lerConfig };
