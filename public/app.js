const state = {
  conversations: [],
  selectedId: null,
  filter: '',
};

const conversationList = document.getElementById('conversationList');
const messagesEl = document.getElementById('messages');
const chatHeader = document.getElementById('chatHeader');
const assumeBtn = document.getElementById('assumeBtn');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const searchInput = document.getElementById('searchInput');
const newChatBtn = document.getElementById('newChatBtn');
const statusBadge = document.getElementById('statusBadge');
const apiVersion = document.getElementById('apiVersion');
const newChatModal = document.getElementById('newChatModal');
const newChatForm = document.getElementById('newChatForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const newPhoneInput = document.getElementById('newPhoneInput');
const newNameInput = document.getElementById('newNameInput');
const healthModal = document.getElementById('healthModal');
const closeHealthModalBtn = document.getElementById('closeHealthModalBtn');
const healthDetails = document.getElementById('healthDetails');

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
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name: name || undefined }),
    });

    if (!res.ok) {
      const error = await res.json();
      alert('Erro ao criar conversa: ' + (error.erro || 'Desconhecido'));
      return;
    }

    const { conversa } = await res.json();
    state.selectedId = conversa.id;
    
    newChatModal.close();
    await fetchConversations();
    renderChatUI();
  } catch (err) {
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
    const res = await fetch('/api/conversations');
    if (!res.ok) {
      console.error('Erro ao buscar conversas:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error('Resposta inválida: esperado array, recebido:', typeof data, data);
      return;
    }
    state.conversations = data;
    renderConversationList();

    if (state.selectedId) {
      await fetchConversation(state.selectedId);
    }
  } catch (err) {
    console.error('Erro ao buscar conversas:', err);
  }
}

async function fetchConversation(id) {
  try {
    const res = await fetch(`/api/conversations?id=${id}`);
    if (!res.ok) {
      console.error('Conversa não encontrada:', res.status);
      return;
    }
    const conv = await res.json();
    renderConversation(conv);
  } catch (err) {
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
  assumeBtn.disabled = false;
  assumeBtn.classList.toggle('active', conv.isHuman);
  assumeBtn.textContent = conv.isHuman ? 'Em controle' : 'Assumir controle';

  messageInput.disabled = false;
  messageForm.querySelector('button').disabled = false;

  messagesEl.innerHTML = '';
  const msgs = Array.isArray(conv.messages) ? conv.messages : [];
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

assumeBtn.addEventListener('click', async () => {
  if (!state.selectedId) return;
  const current = state.conversations.find((c) => c.id === state.selectedId);
  const next = !current?.isHuman;

  await fetch(`/api/conversations?id=${state.selectedId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isHuman: next }),
  });

  await fetchConversations();
});

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !state.selectedId) return;

  messageInput.disabled = true;
  messageForm.querySelector('button').disabled = true;

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.selectedId, text }),
    });

    if (!res.ok) {
      const error = await res.json();
      alert('Erro ao enviar: ' + (error.erro || 'Desconhecido'));
    } else {
      messageInput.value = '';
      await fetchConversation(state.selectedId);
      await fetchConversations();
    }
  } catch (err) {
    alert('Erro de conexão: ' + err.message);
  } finally {
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
  }
});

searchInput.addEventListener('input', (e) => {
  state.filter = e.target.value;
  renderConversationList();
});

// Health Modal handlers
statusBadge?.addEventListener('click', () => {
  if (healthModal) {
    healthModal.showModal();
  }
});

closeHealthModalBtn?.addEventListener('click', () => {
  if (healthModal) {
    healthModal.close();
  }
});

// Close modal when clicking outside the content
healthModal?.addEventListener('click', (e) => {
  if (e.target === healthModal) {
    healthModal.close();
  }
});

// Function to format and display health details
function displayHealthDetails(health) {
  if (!healthDetails) return;

  let html = '<div class="health-details-container">';
  
  // Status geral
  const statusClass = health.status === 'ok' ? 'status-ok' : health.status === 'warning' ? 'status-warn' : 'status-error';
  const statusText = {
    ok: '✅ Configuração OK',
    warning: '⚠️ Avisos',
    error: '❌ Erros'
  }[health.status] || health.status;

  html += `
    <div class="health-status ${statusClass}">
      <h2>${statusText}</h2>
    </div>
    
    <div class="health-section">
      <h3>Telefone WhatsApp</h3>
      <div class="health-field">
        <span class="label">Número:</span>
        <span class="value">${health.phoneNumber?.display_phone_number || 'N/A'}</span>
      </div>
      <div class="health-field">
        <span class="label">Nome Verificado:</span>
        <span class="value">${health.phoneNumber?.verified_name || 'Não verificado'}</span>
      </div>
      <div class="health-field">
        <span class="label">Status de Verificação:</span>
        <span class="value ${health.phoneNumber?.code_verification_status === 'VERIFIED' ? 'verified' : ''}">${health.phoneNumber?.code_verification_status || 'N/A'}</span>
      </div>
    </div>
  `;

  // Webhook configuration
  if (health.phoneNumber?.webhook_configuration) {
    const webhookUrl = health.phoneNumber.webhook_configuration.application;
    const webhookOk = health.webhookOk;
    const webhookClass = webhookOk ? 'webhook-ok' : 'webhook-error';
    
    html += `
      <div class="health-section">
        <h3>Webhook</h3>
        <div class="health-field">
          <span class="label">URL:</span>
          <span class="value">${webhookUrl}</span>
        </div>
        <div class="health-field">
          <span class="label">Status:</span>
          <span class="value ${webhookClass}">${webhookOk ? '✅ Configurado' : '❌ ' + (health.webhookMessage || 'Erro')}</span>
        </div>
      </div>
    `;
  }

  // Business Account
  if (health.checks?.businessAccount?.ok) {
    const ba = health.checks.businessAccount;
    html += `
      <div class="health-section">
        <h3>Business Account</h3>
        <div class="health-field">
          <span class="label">Nome:</span>
          <span class="value">${ba.name || 'N/A'}</span>
        </div>
        <div class="health-field">
          <span class="label">ID:</span>
          <span class="value" style="font-family: monospace; font-size: 12px;">${ba.id || 'N/A'}</span>
        </div>
        ${ba.timezoneId ? `
        <div class="health-field">
          <span class="label">Timezone:</span>
          <span class="value">${ba.timezoneId}</span>
        </div>
        ` : ''}
        ${ba.messageTemplateNamespace ? `
        <div class="health-field">
          <span class="label">Template Namespace:</span>
          <span class="value" style="font-family: monospace; font-size: 11px;">${ba.messageTemplateNamespace}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  if (health.error) {
    html += `
      <div class="health-error">
        <strong>Erro:</strong> ${health.error}
        ${health.errorHint ? `<div class="error-hint">💡 ${health.errorHint}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  healthDetails.innerHTML = html;
}

// Fetch health on load
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const health = await res.json();
    
    // Update badge
    const statusClass = health.status === 'ok' ? 'status-ok' : health.status === 'warning' ? 'status-warn' : 'status-error';
    const statusText = {
      ok: '✅ Configuração OK',
      warning: '⚠️ Avisos',
      error: '❌ Erros'
    }[health.status] || health.status;
    
    statusBadge?.classList.remove('status-ok', 'status-warn', 'status-error');
    statusBadge?.classList.add(statusClass);
    statusBadge.textContent = statusText;
    
    // Display version
    if (health.version && apiVersion) {
      apiVersion.textContent = `API v${health.version}`;
    }
    
    // Store health data for modal display
    displayHealthDetails(health);
    
    console.log('Health check:', health);
  } catch (err) {
    console.error('Health check error:', err);
    statusBadge?.classList.remove('status-ok', 'status-warn', 'status-error');
    statusBadge?.classList.add('status-error');
    statusBadge.textContent = '❌ Erro na Config';
  }
}

setInterval(fetchConversations, 3000);
fetchConversations();
checkHealth();
