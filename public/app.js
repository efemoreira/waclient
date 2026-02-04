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

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR');
}

async function fetchConversations() {
  const res = await fetch('/api/conversations');
  const data = await res.json();
  state.conversations = data;
  renderConversationList();

  if (state.selectedId) {
    await fetchConversation(state.selectedId);
  }
}

async function fetchConversation(id) {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) return;
  const conv = await res.json();
  renderConversation(conv);
}

function renderConversationList() {
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
  conv.messages.forEach((m) => {
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

  await fetch(`/api/conversations/${state.selectedId}/assume`, {
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

  await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: state.selectedId, text }),
  });

  messageInput.value = '';
  await fetchConversation(state.selectedId);
  await fetchConversations();
});

searchInput.addEventListener('input', (e) => {
  state.filter = e.target.value;
  renderConversationList();
});

newChatBtn.addEventListener('click', async () => {
  const phone = prompt('Digite o número com DDI + DDD (ex: 5511999999999)');
  if (!phone) return;
  state.selectedId = phone;
  await fetchConversations();
});

// Envio Direto
const directNumberInput = document.getElementById('directNumber');
const directMessageInput = document.getElementById('directMessage');
const directTemplateSelect = document.getElementById('directTemplate');
const directLanguageSelect = document.getElementById('directLanguage');
const directCustomTemplateInput = document.getElementById('directCustomTemplate');
const directCustomTemplateGroup = document.getElementById('directCustomTemplateGroup');
const sendDirectBtn = document.getElementById('sendDirectBtn');
const directResult = document.getElementById('directResult');
const directResultText = document.getElementById('directResultText');

// Mostrar/ocultar campo de template customizado
directTemplateSelect.addEventListener('change', () => {
  const messageOptional = document.getElementById('directMessageOptional');
  
  if (directTemplateSelect.value === 'custom') {
    directCustomTemplateGroup.style.display = 'block';
    messageOptional.style.display = 'inline';
  } else if (directTemplateSelect.value === 'text') {
    directCustomTemplateGroup.style.display = 'none';
    messageOptional.style.display = 'none';
  } else {
    directCustomTemplateGroup.style.display = 'none';
    messageOptional.style.display = 'inline';
  }
});

function formatPhoneNumber(phone) {
  // Remove tudo que não é número
  const cleaned = phone.replace(/\D/g, '');
  return cleaned;
}

sendDirectBtn.addEventListener('click', async () => {
  const phone = directNumberInput.value.trim();
  const message = directMessageInput.value.trim();
  let template = directTemplateSelect.value;

  if (!phone) {
    directResultText.textContent = '⚠️ Preencha o número';
    directResult.classList.remove('hidden');
    return;
  }

  // Se for texto livre, mensagem é obrigatória
  if (template === 'text' && !message) {
    directResultText.textContent = '⚠️ Preencha a mensagem';
    directResult.classList.remove('hidden');
    return;
  }

  if (template === 'custom') {
    template = directCustomTemplateInput.value.trim();
    if (!template) {
      directResultText.textContent = '⚠️ Especifique o nome do template';
      directResult.classList.remove('hidden');
      return;
    }
  }

  const formattedPhone = formatPhoneNumber(phone);
  if (formattedPhone.length < 10) {
    directResultText.textContent = '❌ Número inválido (mínimo 10 dígitos)';
    directResult.classList.remove('hidden');
    return;
  }

  sendDirectBtn.disabled = true;
  directResultText.textContent = '⏳ Enviando...';
  directResult.classList.remove('hidden');

  try {
    const payload = {
      to: formattedPhone,
    };

    // Adicionar mensagem se for texto livre
    if (template === 'text') {
      payload.text = message;
    }

    // Adicionar template e language se não for texto livre
    if (template !== 'text') {
      payload.template = template;
      payload.language = directLanguageSelect.value;
      // Se houver mensagem, adiciona também
      if (message) {
        payload.text = message;
      }
    }

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      directResultText.textContent = `✅ Mensagem enviada com sucesso! ID: ${data.mensagemId}`;
      directNumberInput.value = '';
      directMessageInput.value = '';
      directCustomTemplateInput.value = '';
      directTemplateSelect.value = 'text';
      directCustomTemplateGroup.style.display = 'none';
    } else {
      directResultText.textContent = `❌ Erro: ${data.erro}`;
    }
  } catch (erro) {
    directResultText.textContent = `❌ Erro ao enviar: ${erro.message}`;
  } finally {
    sendDirectBtn.disabled = false;
  }
});

setInterval(fetchConversations, 3000);
fetchConversations();
