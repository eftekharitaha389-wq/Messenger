const API = '';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let socket = null;
let currentChatId = null;
let allUsers = [];

const authPage = document.getElementById('auth-page');
const chatPage = document.getElementById('chat-page');
const adminPage = document.getElementById('admin-page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authError = document.getElementById('auth-error');

tabLogin.onclick = () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  authError.textContent = '';
};
tabRegister.onclick = () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  authError.textContent = '';
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const res = await fetch(API + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    saveAuth(data);
    startApp();
  } catch (err) {
    authError.textContent = err.message;
  }
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const res = await fetch(API + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    saveAuth(data);
    startApp();
  } catch (err) {
    authError.textContent = err.message;
  }
};

function saveAuth(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(currentUser));
}

function startApp() {
  authPage.classList.add('hidden');
  chatPage.classList.remove('hidden');
  adminPage.classList.add('hidden');

  document.getElementById('my-name').textContent = currentUser.name;
  document.getElementById('my-phone').textContent = currentUser.phone;

  if (currentUser.isAdmin) {
    document.getElementById('btn-admin').classList.remove('hidden');
  }

  connectSocket();
  loadMyChats();
  loadUsers();
}

function connectSocket() {
  socket = io({ auth: { token } });

  socket.on('connect', () => console.log('متصل شد'));
  
  socket.on('new-message', (msg) => {
    if (msg.chatId === currentChatId) {
      appendMessage(msg);
      scrollToBottom();
    }
    loadMyChats();
  });

  // آپدیت آنلاین/آفلاین
  socket.on('user-status', (data) => {
    const user = allUsers.find(u => u.id === data.userId);
    if (user) {
      user.isOnline = data.isOnline;
      renderUserList();
      loadMyChats(); // برای آپدیت وضعیت در لیست چت‌ها
    }
  });
}

async function loadUsers() {
  const res = await fetch(API + '/api/users', {
    headers: { Authorization: 'Bearer ' + token }
  });
  allUsers = await res.json();
  renderUserList();
}

function renderUserList() {
  const el = document.getElementById('user-list');
  // این بخش برای جستجو استفاده می‌شه، لیست اصلی پایین‌تره
}

const searchInput = document.getElementById('search-user');
const userListEl = document.getElementById('user-list');

searchInput.oninput = () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    userListEl.style.display = 'none';
    return;
  }
  const filtered = allUsers.filter(u =>
    u.name.toLowerCase().includes(q) || (u.phone && u.phone.includes(q))
  );
  userListEl.innerHTML = filtered.map(u => {
    const status = u.isOnline ? '🟢' : '⚫';
    const phoneText = currentUser.isAdmin && u.phone ? ` (${u.phone})` : '';
    return `<div data-id="\( {u.id}" data-name=" \){u.name}" data-phone="${u.phone || ''}">
      ${status} \( {u.name} \){phoneText}
    </div>`;
  }).join('');
  userListEl.style.display = filtered.length ? 'block' : 'none';
};

userListEl.onclick = async (e) => {
  const div = e.target.closest('div[data-id]');
  if (!div) return;
  const otherId = div.dataset.id;
  const res = await fetch(API + '/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ otherUserId: otherId })
  });
  const chat = await res.json();
  openChat(chat.id, { id: otherId, name: div.dataset.name, phone: div.dataset.phone });
  searchInput.value = '';
  userListEl.style.display = 'none';
  loadMyChats();
};

async function loadMyChats() {
  const res = await fetch(API + '/api/my-chats', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const list = await res.json();
  const el = document.getElementById('chat-list');
  el.innerHTML = list.map(c => {
    const last = c.lastMessage;
    const preview = last
      ? (last.type === 'text' ? last.content : (last.type === 'voice' ? '🎤 ویس' : '📎 فایل'))
      : 'شروع گفتگو';
    const status = c.otherUser?.isOnline ? '🟢' : '⚫';
    return `
      <div class="chat-item ${c.chatId === currentChatId ? 'active' : ''}" 
           data-chat="${c.chatId}" 
           data-name="${c.otherUser?.name || ''}" 
           data-phone="${c.otherUser?.phone || ''}">
        <strong>${status} ${c.otherUser?.name || 'ناشناس'}</strong>
        <small>${preview}</small>
      </div>`;
  }).join('');
}

document.getElementById('chat-list').onclick = (e) => {
  const item = e.target.closest('.chat-item');
  if (!item) return;
  openChat(item.dataset.chat, {
    name: item.dataset.name,
    phone: item.dataset.phone
  });
};

async function openChat(chatId, otherUser) {
  currentChatId = chatId;
  document.getElementById('no-chat').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('chat-with-name').textContent = otherUser.name || '';
  document.getElementById('chat-with-phone').textContent = currentUser.isAdmin ? (otherUser.phone || '') : '';

  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chat === chatId);
  });

  socket.emit('join-chat', chatId);

  const res = await fetch(API + '/api/messages/' + chatId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const msgs = await res.json();
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(appendMessage);
  scrollToBottom();
}

function appendMessage(msg) {
  const div = document.createElement('div');
  div.className = 'message ' + (msg.from === currentUser.id ? 'me' : 'other');
  let content = '';
  if (msg.type === 'text') {
    content = escapeHtml(msg.content);
  } else {
    content = `<a href="\( {msg.content}" target="_blank"> \){msg.type === 'voice' ? '🎤 پخش ویس' : '📎 دانلود فایل'} (${msg.fileName || ''})</a>`;
  }
  div.innerHTML = content + `<span class="time">${new Date(msg.time).toLocaleTimeString('fa-IR')}</span>`;
  document.getElementById('messages').appendChild(div);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function scrollToBottom() {
  const el = document.getElementById('messages');
  el.scrollTop = el.scrollHeight;
}

document.getElementById('btn-send').onclick = sendText;
document.getElementById('message-input').onkeydown = (e) => {
  if (e.key === 'Enter') sendText();
};

function sendText() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  socket.emit('send-message', {
    chatId: currentChatId,
    type: 'text',
    content: text
  });
  input.value = '';
}

document.getElementById('file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;

  const form = new FormData();
  form.append('file', file);

  const res = await fetch(API + '/api/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'خطا در آپلود');

  socket.emit('send-message', {
    chatId: currentChatId,
    type: data.type,
    content: data.url,
    fileName: data.fileName
  });
  e.target.value = '';
};

document.getElementById('btn-logout').onclick = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.reload();
};

document.getElementById('btn-admin').onclick = async () => {
  chatPage.classList.add('hidden');
  adminPage.classList.remove('hidden');
  const res = await fetch(API + '/api/admin/all-chats', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  const container = document.getElementById('admin-chats');
  container.innerHTML = data.map(c => `
    <div class="admin-chat-card">
      <h3>${c.user1?.name || '?'} ↔ ${c.user2?.name || '?'}</h3>
      <small>${c.user1?.phone} — ${c.user2?.phone}</small>
      <div style="margin-top:12px;max-height:200px;overflow-y:auto">
        ${c.messages.map(m => `
          <div class="admin-msg">
            <span class="from">${m.fromName}:</span>
            ${m.type === 'text' ? escapeHtml(m.content) : (m.type === 'voice' ? '🎤 ویس' : '📎 فایل')}
            <small style="opacity:0.6"> ${new Date(m.time).toLocaleString('fa-IR')}</small>
          </div>
        `).join('') || '<p style="color:#71717a">هنوز پیامی نیست</p>'}
      </div>
    </div>
  `).join('') || '<p>هیچ گفتگویی وجود ندارد</p>';
};

document.getElementById('btn-back-chat').onclick = () => {
  adminPage.classList.add('hidden');
  chatPage.classList.remove('hidden');
};

if (token && currentUser) {
  startApp();
}
