// Sistema de Logging
class LogManager {
  constructor() {
    this.logs = [];
    this.logsList = document.getElementById('logsList');
    this.clearLogsBtn = document.getElementById('clearLogsBtn');
    this.clearLogsBtn?.addEventListener('click', () => this.clear());
  }

  add(message, type = 'info', scope = 'UI') {
    const time = new Date().toLocaleTimeString('pt-BR');
    const log = { message, type, time, scope };
    this.logs.push(log);
    
    // Manter apenas os últimos 100 logs
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    
    this.render();
  }

  render() {
    if (!this.logsList) return;
    
    this.logsList.innerHTML = this.logs
      .map((log) => {
        const truncated = log.message.length > 500 ? log.message.substring(0, 500) + '...' : log.message;
        const header = `[${log.scope}] ${log.type.toUpperCase()}`;
        return `<div class="log-item ${log.type}"><span class="log-time">${log.time}</span>${escapeHtml(header)}: ${escapeHtml(truncated)}</div>`;
      })
      .join('');
    
    // Scroll para o último log
    setTimeout(() => {
      this.logsList.scrollTop = this.logsList.scrollHeight;
    }, 0);
  }

  clear() {
    this.logs = [];
    this.render();
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

const logger = new LogManager();
logger.add('Logs inicializados', 'info', 'UI');

const state = {
  conversations: [],
  selectedId: null,
  filter: '',
};

const conversationList = document.getElementById('conversationList');
const messagesEl = document.getElementById('messages');
const chatHeader = document.getElementById('chatHeader');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const searchInput = document.getElementById('searchInput');
const newChatBtn = document.getElementById('newChatBtn');
const newChatModal = document.getElementById('newChatModal');
const newChatForm = document.getElementById('newChatForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const newPhoneInput = document.getElementById('newPhoneInput');
const newNameInput = document.getElementById('newNameInput');
const refreshConversationsBtn = document.getElementById('refreshConversationsBtn');
refreshConversationsBtn?.addEventListener('click', async () => {
  await fetchConversations();
});
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');

let appPassword = sessionStorage.getItem('appPassword') || '';
let isAuthed = false;

async function authFetch(url, options = {}) {
  // Proteger: não fazer requisições sem autenticação
  if (!isAuthed) {
    const err = new Error('Não autenticado - abra o modal de autenticação');
    err.name = 'AuthError';
    throw err;
  }
  const headers = {
    ...(options.headers || {}),
    'x-app-password': appPassword,
  };
  return fetch(url, { ...options, headers, cache: 'no-store' });
}

async function tryAuth() {
  try {
    const headers = { 'x-app-password': appPassword };
    const res = await fetch('/api/conversations', { headers, cache: 'no-store' });
    if (res.ok) {
      isAuthed = true;
      authError.style.display = 'none';
      authModal.close();
      logger.add('✅ Autenticado com sucesso', 'info', 'Auth');
      return true;
    }
  } catch (_err) {
    // ignore
  }
  isAuthed = false;
  authError.style.display = 'block';
  logger.add('❌ Falha na autenticação - verifique a senha', 'error', 'Auth');
  return false;
}

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  appPassword = authPassword.value.trim();
  console.log('[Auth] Senha digitada, length=' + appPassword.length);
  logger.add(`[Auth] Tentando autenticar com senha de ${appPassword.length} caracteres`, 'info', 'Auth');
  sessionStorage.setItem('appPassword', appPassword);
  await tryAuth();
});

// Navegação entre seções
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    btn.classList.add('active');
    const sectionId = btn.dataset.section + '-section';
    document.getElementById(sectionId).classList.add('active');
  });
});

async function checkHealth() {
  if (!statusBadge) return;
  statusBadge.textContent = 'Verificando configuração...';
  statusBadge.className = 'status-badge status-loading';

  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      statusBadge.textContent = 'Configuração indisponível';
      statusBadge.className = 'status-badge status-error';
      return;
    }

    const data = await res.json();
    if (data?.ok) {
      statusBadge.textContent = 'Configuração OK';
      statusBadge.className = 'status-badge status-ok';
    } else {
      statusBadge.textContent = 'Configuração com erro';
      statusBadge.className = 'status-badge status-error';
      console.warn('Detalhes da configuração:', data?.checks);
    }
    
    // Atualizar versão da API
    if (data?.checks?.config?.apiVersion && apiVersion) {
      apiVersion.textContent = data.checks.config.apiVersion;
    }
  } catch (err) {
    statusBadge.textContent = 'Erro ao validar configuração';
    statusBadge.className = 'status-badge status-error';
    console.error('Erro ao validar configuração:', err);
  }
}

// Modal de nova conversa
newChatBtn.addEventListener('click', () => {
  newPhoneInput.value = '';
  newNameInput.value = '';
  newChatModal.showModal();
});

closeModalBtn.addEventListener('click', () => {
  newChatModal.close();
});


newChatModal.addEventListener('click', (e) => {
  if (e.target === newChatModal) {
    newChatModal.close();
  }
});

newChatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const phone = newPhoneInput.value.trim();
  const name = newNameInput.value.trim();
  
  if (!phone) {
    alert('Digite um número WhatsApp válido');
    return;
  }
  
  // Criar conversa no servidor
  try {
    const res = await authFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name: name || undefined }),
    });

    if (!res.ok) {
      const error = await res.json();
      if (res.status === 401) {
        isAuthed = false;
        appPassword = '';
        sessionStorage.removeItem('appPassword');
        authModal.showModal();
        alert('Sessão expirada - faça login novamente');
        return;
      }
      alert('Erro ao criar conversa: ' + (error.erro || 'Desconhecido'));
      return;
    }

    const { conversa } = await res.json();
    state.selectedId = conversa.id;
    
    newChatModal.close();
    await fetchConversations();
    renderChatUI();
  } catch (err) {
    if (err.name === 'AuthError') {
      logger.add('❌ Não autenticado - faça login novamente', 'error', 'Auth');
      authModal.showModal();
      return;
    }
    alert('Erro de conexão: ' + err.message);
  }
});

function renderChatUI() {
  const conv = state.conversations.find(c => c.id === state.selectedId);
  if (conv) {
    renderConversation(conv);
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR');
}

async function fetchConversations() {
  try {
    logger.add('➡️ GET /api/conversations');
    const res = await authFetch('/api/conversations');
    if (!res.ok) {
      logger.add(`❌ Erro ao buscar conversas (${res.status})`, 'error');
      if (res.status === 401) {
        isAuthed = false;
        appPassword = '';
        sessionStorage.removeItem('appPassword');
        authModal.showModal();
      }
      console.error('Erro ao buscar conversas:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      logger.add('❌ Resposta inválida ao buscar conversas', 'error');
      console.error('Resposta inválida: esperado array, recebido:', typeof data, data);
      return;
    }
    logger.add(`✅ Conversas carregadas (${data.length})`);
    state.conversations = data;
    renderConversationList();

    if (state.selectedId) {
      await fetchConversation(state.selectedId);
    } else {
      logger.add('ℹ️ Nenhuma conversa selecionada');
    }
  } catch (err) {
    if (err.name === 'AuthError') {
      logger.add('❌ Não autenticado - faça login novamente', 'error', 'Auth');
      authModal.showModal();
      return;
    }
    logger.add('❌ Erro ao buscar conversas (exceção)', 'error');
    console.error('Erro ao buscar conversas:', err);
  }
}

async function fetchConversation(id) {
  try {
    logger.add(`➡️ GET /api/conversations?id=${id}`);
    const res = await authFetch(`/api/conversations?id=${id}`);
    if (!res.ok) {
      logger.add(`❌ Conversa não encontrada (${res.status})`, 'error');
      if (res.status === 401) {
        isAuthed = false;
        appPassword = '';
        sessionStorage.removeItem('appPassword');
        authModal.showModal();
      }
      console.error('Conversa não encontrada:', res.status);
      return;
    }
    const conv = await res.json();
    const total = Array.isArray(conv?.messages) ? conv.messages.length : 0;
    logger.add(`✅ Conversa carregada (${total} mensagens)`);
    renderConversation(conv);
  } catch (err) {
    if (err.name === 'AuthError') {
      logger.add('❌ Não autenticado - faça login novamente', 'error', 'Auth');
      authModal.showModal();
      return;
    }
    logger.add('❌ Erro ao buscar conversa (exceção)', 'error');
    console.error('Erro ao buscar conversa:', err);
  }
}

function renderConversationList() {
  if (!Array.isArray(state.conversations)) {
    console.warn('state.conversations não é um array:', state.conversations);
    conversationList.innerHTML = '<div style="padding: 16px; color: var(--muted);">Erro ao carregar conversas</div>';
    return;
  }
  
  const filtered = state.conversations.filter((c) => {
    if (!state.filter) return true;
    const text = `${c.name || ''} ${c.phoneNumber || ''}`.toLowerCase();
    return text.includes(state.filter.toLowerCase());
  });

  conversationList.innerHTML = '';
  filtered.forEach((c) => {
    const item = document.createElement('div');
    item.className = `conversation ${state.selectedId === c.id ? 'active' : ''}`;
    item.addEventListener('click', () => {
      state.selectedId = c.id;
      fetchConversation(c.id);
      renderConversationList();
    });

    item.innerHTML = `
      <div class="name">${c.name || c.phoneNumber}</div>
      <div class="last">${c.lastMessage || 'Sem mensagens ainda'}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <span class="last">${c.lastTimestamp ? formatTime(c.lastTimestamp) : ''}</span>
        ${c.unreadCount > 0 ? `<span class="badge">${c.unreadCount}</span>` : ''}
      </div>
    `;

    conversationList.appendChild(item);
  });
}

function renderConversation(conv) {
  chatHeader.querySelector('h2').textContent = conv.name || conv.phoneNumber;
  chatHeader.querySelector('.subtitle').textContent = conv.phoneNumber;

  messageInput.disabled = false;
  messageForm.querySelector('button').disabled = false;

  messagesEl.innerHTML = '';
  const msgs = Array.isArray(conv.messages) ? conv.messages : [];
  logger.add(`💬 Renderizando conversa (${msgs.length} mensagens)`);
  msgs.forEach((m) => {
    const el = document.createElement('div');
    el.className = `message ${m.direction}`;
    el.innerHTML = `
      <div>${m.text}</div>
      <span class="meta">${formatTime(m.timestamp)}</span>
    `;
    messagesEl.appendChild(el);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}


messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !state.selectedId) return;

  messageInput.disabled = true;
  messageForm.querySelector('button').disabled = true;

  const payload = { to: state.selectedId, text };
  logger.add(`➡️ POST /api/messages payload: ${JSON.stringify(payload)}`);
  logger.add(`📤 Enviando para ${state.selectedId}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

  // Debug: verificar estado ANTES de fazer POST
  console.log('[POST submit] Estado ANTES de authFetch:', {
    isAuthed,
    appPasswordLength: appPassword?.length,
    appPassword: appPassword?.substring(0, 3) + '***',
    sessionStorageAppPassword: sessionStorage.getItem('appPassword')?.length,
  });
  logger.add(`[POST Debug] isAuthed=${isAuthed}, pwdLen=${appPassword?.length}`, 'debug', 'POST');

  try {
    const startTime = Date.now();
    const res = await authFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const duration = Date.now() - startTime;

    if (!res.ok) {
      const error = await res.json();
      let mensagem = error.erro || 'Desconhecido';
      
      console.error('[POST /api/messages] ❌ Erro 401', {
        status: res.status,
        duration,
        mensagem,
        appPasswordLength: appPassword?.length,
        isAuthed,
        fullError: error,
      });
      
      logger.add(`❌ Erro (${res.status}) após ${duration}ms: ${mensagem}`, 'error');
      
      // Se for 401, mostrar modal de login novamente
      if (res.status === 401) {
        console.warn('[POST /api/messages] 401 - Resetando autenticação');
        isAuthed = false;
        appPassword = '';
        sessionStorage.removeItem('appPassword');
        authModal.showModal();
        mensagem = 'Sessão expirada ou senha incorreta. Digite a senha novamente.';
      }
      
      // Erro específico #133010
      if (error.codigoErro === 133010) {
        mensagem = `${mensagem}\n\n⚠️ Sua Business Account não está registrada para enviar mensagens.\n\nVeja ERROR_133010.md ou acesse /api/debug para mais informações.`;
      }
      
      alert('Erro ao enviar:\n\n' + mensagem);
    } else {
      const data = await res.json();
      logger.add(`✅ Mensagem enviada com sucesso em ${duration}ms\nID: ${data.mensagemId}`);
      messageInput.value = '';
      await fetchConversation(state.selectedId);
      await fetchConversations();
    }
  } catch (err) {
    if (err.name === 'AuthError') {
      logger.add('❌ Não autenticado - faça login novamente', 'error', 'Auth');
      authModal.showModal();
      logger.add(`❌ Erro (401): Não autenticado`, 'error');
      alert('Sessão expirada - faça login novamente');
    } else {
      alert('Erro de conexão: ' + err.message);
    }
  } finally {
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
  }
});

searchInput.addEventListener('input', (e) => {
  state.filter = e.target.value;
  renderConversationList();
});

// Auto-polling: atualiza lista a cada 8s e conversa ativa a cada 5s
let pollingListInterval = null;
let pollingConvInterval = null;

function startPolling() {
  if (pollingListInterval) clearInterval(pollingListInterval);
  if (pollingConvInterval) clearInterval(pollingConvInterval);

  pollingListInterval = setInterval(async () => {
    if (!isAuthed) return;
    try {
      const res = await authFetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      state.conversations = data;
      renderConversationList();
    } catch (_) { /* silencioso */ }
  }, 8000);

  pollingConvInterval = setInterval(async () => {
    if (!isAuthed || !state.selectedId) return;
    try {
      const res = await authFetch(`/api/conversations?id=${state.selectedId}`);
      if (!res.ok) return;
      const conv = await res.json();
      renderConversation(conv);
    } catch (_) { /* silencioso */ }
  }, 5000);
}

tryAuth().then((ok) => {
  if (ok) {
    fetchConversations();
    startPolling();
  } else {
    logger.add('⚠️ Autenticação necessária - abra o modal de login', 'warn', 'Init');
    authModal.showModal();
  }
});

