/**
 * Conversation storage utilities for persisting conversations
 * Supports both local file storage and Upstash Redis
 *
 * Cada conversa é guardada numa chave própria (`<namespace>:conversation:<id>`)
 * em vez de um único blob com todas as conversas. Isso evita que a escrita de
 * uma conversa (read-modify-write) sobrescreva, por race condition, alterações
 * concorrentes feitas em OUTRA conversa por uma requisição/instância paralela —
 * o que causava perda de `militanciaStage` (bot "confuso" sobre o fluxo atual).
 */

import { promises as fs } from 'fs';
import type { Conversation } from '../inbox/ConversationManager';

const APP_NAMESPACE = process.env.APP_NAMESPACE || 'waclient';
const CONVERSATIONS_DIR = `/tmp/${APP_NAMESPACE}_conversations`;
const CONVERSATIONS_META_FILE = `/tmp/${APP_NAMESPACE}_conversations.meta.json`;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const UPSTASH_IDS_KEY = `${APP_NAMESPACE}:conversation_ids`;
const UPSTASH_META_KEY = `${APP_NAMESPACE}:meta`;

function conversationKey(id: string): string {
  return `${APP_NAMESPACE}:conversation:${id}`;
}

function conversationFile(id: string): string {
  return `${CONVERSATIONS_DIR}/${encodeURIComponent(id)}.json`;
}

function upstashHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` };
}

/**
 * Check if Upstash Redis is configured
 */
export function isUpstashConfigured(): boolean {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Read a single conversation from storage (Upstash or file)
 */
export async function lerConversa(id: string): Promise<Conversation | null> {
  if (isUpstashConfigured()) {
    try {
      const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(conversationKey(id))}`;
      const res = await fetch(url, { headers: upstashHeaders() });
      if (!res.ok) {
        throw new Error(`Upstash GET failed: ${res.status}`);
      }
      const data: any = await res.json();
      if (data?.result != null) {
        const raw = data.result;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      return null;
    } catch (err: any) {
      console.warn(`⚠️  Erro ao ler conversa ${id} do Upstash:`, err?.message || err);
    }
  }

  try {
    const content = await fs.readFile(conversationFile(id), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save a single conversation to storage (Upstash and file)
 */
export async function salvarConversa(id: string, conv: Conversation): Promise<void> {
  const json = JSON.stringify(conv);

  if (isUpstashConfigured()) {
    try {
      const setUrl = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(conversationKey(id))}`;
      const setRes = await fetch(setUrl, {
        method: 'POST',
        headers: upstashHeaders(),
        body: json,
      });
      if (!setRes.ok) {
        throw new Error(`Upstash SET failed: ${setRes.status}`);
      }
      const saddUrl = `${UPSTASH_REDIS_REST_URL}/sadd/${encodeURIComponent(UPSTASH_IDS_KEY)}/${encodeURIComponent(id)}`;
      await fetch(saddUrl, { method: 'POST', headers: upstashHeaders() });
    } catch (err: any) {
      console.warn(`⚠️  Erro ao salvar conversa ${id} no Upstash:`, err?.message || err);
    }
  }

  try {
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
    await fs.writeFile(conversationFile(id), json, 'utf-8');
  } catch (err: any) {
    console.error(`❌ Erro ao salvar arquivo da conversa ${id}:`, err?.message || err);
  }
}

/**
 * List all known conversation ids
 */
export async function listarConversaIds(): Promise<string[]> {
  if (isUpstashConfigured()) {
    try {
      const url = `${UPSTASH_REDIS_REST_URL}/smembers/${encodeURIComponent(UPSTASH_IDS_KEY)}`;
      const res = await fetch(url, { headers: upstashHeaders() });
      if (!res.ok) {
        throw new Error(`Upstash SMEMBERS failed: ${res.status}`);
      }
      const data: any = await res.json();
      if (Array.isArray(data?.result)) return data.result;
    } catch (err: any) {
      console.warn('⚠️  Erro ao listar ids de conversas no Upstash:', err?.message || err);
    }
  }

  try {
    const files = await fs.readdir(CONVERSATIONS_DIR);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => decodeURIComponent(f.replace(/\.json$/, '')));
  } catch {
    return [];
  }
}

/**
 * Read every conversation from storage, keyed by id
 */
export async function lerTodasConversas(): Promise<Record<string, Conversation>> {
  const ids = await listarConversaIds();
  const result: Record<string, Conversation> = {};
  await Promise.all(
    ids.map(async (id) => {
      const conv = await lerConversa(id);
      if (conv) result[id] = conv;
    })
  );
  return result;
}

/**
 * Delete every conversation from storage
 */
export async function apagarTodasConversas(): Promise<void> {
  const ids = await listarConversaIds();

  if (isUpstashConfigured()) {
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${UPSTASH_REDIS_REST_URL}/del/${encodeURIComponent(conversationKey(id))}`, {
            method: 'POST',
            headers: upstashHeaders(),
          })
        )
      );
      await fetch(`${UPSTASH_REDIS_REST_URL}/del/${encodeURIComponent(UPSTASH_IDS_KEY)}`, {
        method: 'POST',
        headers: upstashHeaders(),
      });
    } catch (err: any) {
      console.warn('⚠️  Erro ao apagar conversas no Upstash:', err?.message || err);
    }
  }

  await Promise.all(
    ids.map((id) => fs.rm(conversationFile(id), { force: true }).catch(() => undefined))
  );
}

/**
 * Read metadata from storage
 */
export async function lerMeta(): Promise<{ resetAt?: number }> {
  // Try Upstash first
  if (isUpstashConfigured()) {
    try {
      const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(UPSTASH_META_KEY)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      });
      if (!res.ok) {
        console.warn(
          `⚠️  Erro de resposta do Upstash ao ler meta: status ${res.status} ${res.statusText || ''}`.trim(),
        );
      } else {
        const data: any = await res.json();
        if (data?.result != null) {
          const raw = data.result;
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
      }
    } catch (err: any) {
      console.warn('⚠️  Erro ao ler meta do Upstash:', err?.message || err);
    }
  }

  // Fallback to file
  try {
    const content = await fs.readFile(CONVERSATIONS_META_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save metadata to storage
 */
export async function salvarMeta(meta: { resetAt: number }): Promise<void> {
  const json = JSON.stringify(meta);

  // Save to Upstash
  if (isUpstashConfigured()) {
    try {
      const url = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(UPSTASH_META_KEY)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        },
        body: json,
      });
      if (!res.ok) {
        throw new Error(`Upstash SET failed: ${res.status}`);
      }
    } catch (err: any) {
      console.warn('⚠️  Erro ao salvar meta no Upstash:', err?.message || err);
    }
  }

  // Save to file
  try {
    await fs.writeFile(CONVERSATIONS_META_FILE, json, 'utf-8');
  } catch (err: any) {
    console.error('❌ Erro ao salvar meta em arquivo:', err?.message || err);
  }
}
