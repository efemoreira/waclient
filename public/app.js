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

// Botão de teste para adicionar mensagem simulada
const testBtn = document.getElementById('testBtn');
testBtn.addEventListener('click', async () => {
  const phone = prompt('Número para teste (ex: 5511999999999):', '5511987654321');
  if (!phone) return;

  const message = prompt('Mensagem de teste:', 'Olá! Essa é uma mensagem de teste.');
  if (!message) return;

  const name = prompt('Nome (opcional):', 'Contato Teste');

  try {
    const res = await fetch('/api/test/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        message,
        name: name || undefined,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      await fetchConversations();
    } else {
      alert(`❌ Erro: ${data.erro}`);
    }
  } catch (error) {
    alert(`❌ Erro: ${error.message}`);
  }
});

setInterval(fetchConversations, 3000);
fetchConversations();
