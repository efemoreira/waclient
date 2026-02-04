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
const newChatModal = document.getElementById('newChatModal');
const newChatForm = document.getElementById('newChatForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const newPhoneInput = document.getElementById('newPhoneInput');
const newNameInput = document.getElementById('newNameInput');

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
  
  // Selecionar a conversa (será criada quando enviar mensagem)
  state.selectedId = phone;
  
  // Se houver nome, armazenar para usar depois
  if (name) {
    const existingConv = state.conversations.find(c => c.id === phone);
    if (!existingConv) {
      // Criar conversa vazia com o nome
      state.conversations.unshift({
        id: phone,
        name: name,
        phoneNumber: phone,
        lastMessage: undefined,
        lastTimestamp: undefined,
        unreadCount: 0,
        isHuman: false,
        messages: [],
      });
    }
  }
  
  newChatModal.close();
  await fetchConversations();
  renderChatUI();
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
  const res = await fetch('/api/conversations');
  const data = await res.json();
  state.conversations = data;
  renderConversationList();

  if (state.selectedId) {
    await fetchConversation(state.selectedId);
  }
}

async function fetchConversation(id) {
  const res = await fetch(`/api/conversations?id=${id}`);
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

setInterval(fetchConversations, 3000);
fetchConversations();
