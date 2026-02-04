import 'dotenv/config';
import { promises as fs } from 'fs';

const configFile = '/tmp/whatsapp-config.json';

interface SavedConfig {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookToken: string;
  timestamp: number;
}

let cachedConfig: SavedConfig | null = null;

/**
 * Ler configurações salvas via web
 */
async function lerConfigSalva(): Promise<SavedConfig | null> {
  if (cachedConfig) return cachedConfig;
  
  try {
    const data = await fs.readFile(configFile, 'utf-8');
    cachedConfig = JSON.parse(data);
    return cachedConfig;
  } catch {
    return null;
  }
}

/**
 * Obter token de acesso (com sincronização)
 */
let tokenPromise: Promise<string> | null = null;
async function obterAccessToken(): Promise<string> {
  if (tokenPromise) return tokenPromise;
  
  tokenPromise = (async () => {
    // Tentar ler da configuração salva
    try {
      const configSalva = await lerConfigSalva();
      if (configSalva?.accessToken) {
        return configSalva.accessToken;
      }
    } catch (e) {
      // Ignorar erro
    }
    
    // Fallback para variável de ambiente
    return process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '';
  })();
  
  return tokenPromise;
}

/**
 * Configuração centralizada da aplicação
 */
let config: any = {
  // WhatsApp API (será preenchido dinamicamente)
  whatsapp: {
    token: process.env.WHATSAPP_API_TOKEN || '',
    numberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: Number(process.env.WHATSAPP_API_VERSION?.replace(/^v/i, '') || '18'),
  },

  // Inbox/Servidor
  server: {
    port: Number(process.env.INBOX_PORT || 3000),
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  },

  // Bulk Messaging
  bulk: {
    // Rate limiting - não exceder limites da API
    delayBetweenMessages: 100, // 100ms entre mensagens
    batchSize: 10, // Processar em lotes de 10
    delayBetweenBatches: 5000, // 5 segundos entre lotes

    // Template padrão (pode ser sobrescrito por argumento)
    defaultTemplateName: 'hello_world',
    defaultTemplateLanguage: 'en_US',
    defaultMissionName: 'Missão',
  },
};

/**
 * Inicializar configuração (ler da web se disponível)
 */
async function inicializarConfig(): Promise<void> {
  try {
    const configSalva = await lerConfigSalva();
    if (configSalva) {
      config.whatsapp.token = configSalva.accessToken;
      config.whatsapp.numberId = configSalva.phoneNumberId;
      config.server.verifyToken = configSalva.webhookToken;
    }
  } catch (e) {
    // Ignorar erro, usar fallback
  }
}

// Inicializar ao importar
inicializarConfig().catch(console.error);

export { config, obterAccessToken, lerConfigSalva };

/**
 * Validar configuração necessária
 */
export function validateConfig(): boolean {
  const required = [
    { key: 'WHATSAPP_API_TOKEN', value: config.whatsapp.token },
    { key: 'WHATSAPP_PHONE_NUMBER_ID', value: config.whatsapp.numberId },
    { key: 'WHATSAPP_VERIFY_TOKEN', value: config.server.verifyToken },
  ];

  const missing = required.filter((r) => !r.value);
  if (missing.length > 0) {
    console.error('❌ Variáveis de ambiente faltando:');
    missing.forEach((m) => console.error(`   - ${m.key}`));
    return false;
  }

  return true;
}
