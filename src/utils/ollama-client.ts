/**
 * Cliente HTTP para a API do Ollama
 *
 * Permite usar um modelo de linguagem local (Ollama) para responder
 * mensagens em linguagem natural quando nenhum comando é reconhecido.
 *
 * Documentação da API: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { logger } from './logger';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
}

export interface OllamaClientOptions {
  /** URL base do servidor Ollama (ex: http://localhost:11434) */
  baseUrl: string;
  /** Nome do modelo a usar (ex: llama3, mistral, phi3) */
  model: string;
  /** Prompt de sistema para contextualizar o modelo */
  systemPrompt: string;
  /** Temperatura de geração (0–1). Menor = mais previsível. Padrão: 0.7 */
  temperature?: number;
  /** Número máximo de tokens na resposta. Padrão: 512 */
  maxTokens?: number;
  /** Timeout em milissegundos para a requisição. Padrão: 30000 */
  timeoutMs?: number;
}

/**
 * Envia uma conversa para o Ollama e retorna a resposta do modelo.
 *
 * @param options   Configurações do cliente Ollama
 * @param messages  Histórico de mensagens da conversa (sem o system prompt)
 * @returns Texto da resposta do modelo, ou null em caso de erro
 */
export async function ollamaChat(
  options: OllamaClientOptions,
  messages: OllamaMessage[]
): Promise<string | null> {
  const { baseUrl, model, systemPrompt, temperature = 0.7, maxTokens = 512, timeoutMs = 30000 } =
    options;

  const body: OllamaChatRequest = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: false,
    options: {
      temperature,
      num_predict: maxTokens,
    },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  logger.info('OllamaClient', `🤖 Enviando para Ollama (model=${model}) — ${messages.length} msg(s)`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.warn(
        'OllamaClient',
        `❌ Ollama respondeu HTTP ${response.status}: ${errorText.substring(0, 200)}`
      );
      return null;
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data?.message?.content?.trim();

    if (!content) {
      logger.warn('OllamaClient', '⚠️  Ollama retornou resposta vazia');
      return null;
    }

    logger.info('OllamaClient', `✅ Resposta recebida (${content.length} chars)`);
    return content;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn('OllamaClient', `⏱️  Timeout ao aguardar resposta do Ollama (${timeoutMs}ms)`);
    } else {
      logger.warn('OllamaClient', `❌ Erro ao chamar Ollama: ${err?.message || err}`);
    }
    return null;
  }
}

/**
 * Verifica se o Ollama está disponível fazendo uma requisição leve à API de tags.
 *
 * @param baseUrl URL base do servidor Ollama
 * @returns true se o servidor respondeu com sucesso
 */
export async function ollamaIsAvailable(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/tags`;
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
