import 'dotenv/config';

/**
 * Configuração centralizada - lê apenas de variáveis de ambiente
 */
export const config = {
  whatsapp: {
    token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    numberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
    apiVersion: Number(process.env.WHATSAPP_API_VERSION?.replace(/^v/i, '') || '18'),
  },

  // Bulk Messaging
  bulk: {
    delayBetweenMessages: 100,
    batchSize: 10,
    delayBetweenBatches: 5000,
    defaultTemplateName: 'hello_world',
    defaultTemplateLanguage: 'en_US',
    defaultMissionName: 'Missão',
  },
};

/**
 * Validar se as variáveis obrigatórias estão configuradas
 */
export function validateConfig(): boolean {
  const required = [
    { key: 'WHATSAPP_ACCESS_TOKEN', value: config.whatsapp.token },
    { key: 'WHATSAPP_PHONE_NUMBER_ID', value: config.whatsapp.numberId },
    { key: 'WHATSAPP_BUSINESS_ACCOUNT_ID', value: config.whatsapp.accountId },
    { key: 'WHATSAPP_WEBHOOK_TOKEN', value: config.whatsapp.webhookToken },
  ];

  const missing = required.filter((r) => !r.value);
  if (missing.length > 0) {
    console.error('❌ Variáveis de ambiente faltando:');
    missing.forEach((m) => console.error(`   - ${m.key}`));
    return false;
  }

  return true;
}

/**
 * Obter token de acesso (função assíncrona para compatibilidade)
 */
export async function obterAccessToken(): Promise<string> {
  return config.whatsapp.token;
}

