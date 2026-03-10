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
    apiVersion: process.env.WHATSAPP_API_VERSION?.replace(/^v/i, '') || '24.0',
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

  // Ollama — LLM local para respostas em linguagem natural
  ollama: {
    /** URL base do servidor Ollama. Ex: http://localhost:11434 */
    baseUrl: process.env.OLLAMA_BASE_URL || '',
    /** Modelo a utilizar. Ex: llama3, mistral, phi3 */
    model: process.env.OLLAMA_MODEL || 'llama3',
    /** Temperatura de geração (0–1). Menor = mais determinístico. */
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
    /** Número máximo de tokens na resposta. */
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '512', 10),
    /** Timeout em ms para aguardar resposta do Ollama. */
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
    /** Prompt de sistema que contextualiza o modelo sobre o bot. */
    systemPrompt:
      process.env.OLLAMA_SYSTEM_PROMPT ||
      'Você é um assistente virtual simpático de um sistema de monitoramento de consumo' +
      ' (água, energia e gás) via WhatsApp. Responda de forma concisa e amigável em português' +
      ' brasileiro. Quando o usuário perguntar sobre comandos disponíveis, mencione: ajuda,' +
      ' meu uid, minhas casas, status, como enviar, adicionar casa. Nunca invente dados de' +
      ' leituras ou imóveis — indique ao usuário para usar os comandos corretos.',
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
  
  console.log('\n' + '='.repeat(50));
  console.log('⚙️  CONFIGURAÇÃO DO SISTEMA');
  console.log('='.repeat(50));
  
  if (missing.length > 0) {
    console.error('❌ ERRO - Variáveis de ambiente faltando:');
    missing.forEach((m) => console.error(`   - ${m.key}`));
    console.log('='.repeat(50) + '\n');
    return false;
  }

  console.log('✅ VARIÁVEIS DE AMBIENTE:');
  console.log(`  ✓ WHATSAPP_PHONE_NUMBER_ID: ${config.whatsapp.numberId.substring(0, 5)}...`);
  console.log(`  ✓ WHATSAPP_BUSINESS_ACCOUNT_ID: ${config.whatsapp.accountId.substring(0, 5)}...`);
  console.log(`  ✓ WHATSAPP_ACCESS_TOKEN: presente`);
  console.log(`  ✓ WHATSAPP_WEBHOOK_TOKEN: presente`);
  console.log(`  API Version: v${config.whatsapp.apiVersion}`);
  console.log('='.repeat(50) + '\n');

  return true;
}

/**
 * Obter token de acesso (função assíncrona para compatibilidade)
 */
export async function obterAccessToken(): Promise<string> {
  return config.whatsapp.token;
}

