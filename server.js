const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key-immediately';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '09940355222';

let users = [];
let messages = [];
let chats = [];
const onlineUsers = new Map(); // userId -> socketId

const DATA_FILE = path.join(__dirname, 'data.json');
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    users = data.users || [];
    messages = data.messages || [];
    chats = data.chats || [];
  } catch (e) {}
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users, messages, chats }, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'وارد شوید' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = users.find(u => u.id === decoded.id);
    if (!req.user) return res.status(401).json({ error: 'کاربر یافت نشد' });
    next();
  } catch {
    res.status(401).json({ error: 'توکن نامعتبر' });
  }
}

// ثبت‌نام
app.post('/api/register', async (req, res) => {
  const { phone, name, password } = req.body;
  if (!phone || !password || !name) return res.status(400).json({ error: 'شماره، نام و رمز لازم است' });
  if (users.find(u => u.phone === phone)) return res.status(400).json({ error: 'این شماره قبلاً ثبت شده' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    phone,
    name,
    passwordHash: hash,
    isAdmin: phone === ADMIN_PHONE
  };
  users.push(user);
  saveData();

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ 
    token, 
    user: { id: user.id, phone: user.phone, name: user.name, isAdmin: user.isAdmin }
  });
});

// ورود
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = users.find(u => u.phone === phone);
  if (!user) return res.status(400).json({ error: 'کاربر یافت نشد' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'رمز اشتباه است' });

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ 
    token, 
    user: { id: user.id, phone: user.phone, name: user.name, isAdmin: user.isAdmin }
  });
});

// لیست کاربران (شماره فقط برای ادمین)
app.get('/api/users', authMiddleware, (req, res) => {
  const list = users
    .filter(u => u.id !== req.user.id)
    .map(u => {
      const base = {
        id: u.id,
        name: u.name,
        isOnline: onlineUsers.has(u.id)
      };
      // فقط ادمین شماره رو می‌بینه
      if (req.user.isAdmin) {
        base.phone = u.phone;
      }
      return base;
    });
  res.json(list);
});

// دریافت یا ساخت چت
app.post('/api/chat', authMiddleware, (req, res) => {
  const { otherUserId } = req.body;
  if (!otherUserId) return res.status(400).json({ error: 'کاربر مشخص نشده' });

  let chat = chats.find(c => 
    (c.user1 === req.user.id && c.user2 === otherUserId) ||
    (c.user1 === otherUserId && c.user2 === req.user.id)
  );

  if (!chat) {
    chat = { id: uuidv4(), user1: req.user.id, user2: otherUserId };
    chats.push(chat);
    saveData();
  }
  res.json(chat);
});

// پیام‌های یک چت
app.get('/api/messages/:chatId', authMiddleware, (req, res) => {
  const chat = chats.find(c => c.id === req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'چت یافت نشد' });

  const isParticipant = chat.user1 === req.user.id || chat.user2 === req.user.id;
  if (!isParticipant && !req.user.isAdmin) {
    return res.status(403).json({ error: 'دسترسی ندارید' });
  }

  const msgs = messages
    .filter(m => m.chatId === req.params.chatId)
    .sort((a, b) => a.time - b.time);
  res.json(msgs);
});

// لیست چت‌های من
app.get('/api/my-chats', authMiddleware, (req, res) => {
  const myChats = chats.filter(c => c.user1 === req.user.id || c.user2 === req.user.id);
  const result = myChats.map(c => {
    const otherId = c.user1 === req.user.id ? c.user2 : c.user1;
    const other = users.find(u => u.id === otherId);
    const lastMsg = messages.filter(m => m.chatId === c.id).sort((a,b) => b.time - a.time)[0];
    return {
      chatId: c.id,
      otherUser: other ? { 
        id: other.id, 
        name: other.name, 
        phone: req.user.isAdmin ? other.phone : undefined,
        isOnline: onlineUsers.has(other.id)
      } : null,
      lastMessage: lastMsg || null
    };
  });
  res.json(result);
});

// پنل ادمین
app.get('/api/admin/all-chats', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'فقط ادمین' });

  const result = chats.map(c => {
    const u1 = users.find(u => u.id === c.user1);
    const u2 = users.find(u => u.id === c.user2);
    const msgs = messages.filter(m => m.chatId === c.id).sort((a,b) => a.time - b.time);
    return {
      chatId: c.id,
      user1: u1 ? { id: u1.id, name: u1.name, phone: u1.phone } : null,
      user2: u2 ? { id: u2.id, name: u2.name, phone: u2.phone } : null,
      messages: msgs
    };
  });
  res.json(result);
});

// آپلود فایل
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایلی ارسال نشد' });
  res.json({ 
    url: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    type: req.file.mimetype.startsWith('audio/') ? 'voice' : 'file'
  });
});

// ================== Socket.io ==================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('احراز هویت لازم است'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    if (!user) return next(new Error('کاربر یافت نشد'));
    socket.user = user;
    next();
  } catch {
    next(new Error('توکن نامعتبر'));
  }
});

io.on('connection', (socket) => {
  console.log('وصل شد:', socket.user.name);
  onlineUsers.set(socket.user.id, socket.id);

  // به همه بگو این کاربر آنلاین شد
  io.emit('user-status', { userId: socket.user.id, isOnline: true });

  // عضویت در چت‌های خودش
  const myChats = chats.filter(c => c.user1 === socket.user.id || c.user2 === socket.user.id);
  myChats.forEach(c => socket.join(c.id));

  if (socket.user.isAdmin) {
    chats.forEach(c => socket.join(c.id));
  }

  socket.on('join-chat', (chatId) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const isParticipant = chat.user1 === socket.user.id || chat.user2 === socket.user.id;
    if (isParticipant || socket.user.isAdmin) {
      socket.join(chatId);
    }
  });

  socket.on('send-message', (data) => {
    const { chatId, type, content, fileName } = data;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const isParticipant = chat.user1 === socket.user.id || chat.user2 === socket.user.id;
    if (!isParticipant) return;

    const msg = {
      id: uuidv4(),
      chatId,
      from: socket.user.id,
      fromName: socket.user.name,
      to: chat.user1 === socket.user.id ? chat.user2 : chat.user1,
      type: type || 'text',
      content,
      fileName: fileName || null,
      time: Date.now()
    };
    messages.push(msg);
    saveData();

    io.to(chatId).emit('new-message', msg);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.user.id);
    io.emit('user-status', { userId: socket.user.id, isOnline: false });
    console.log('قطع شد:', socket.user.name);
  });
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

server.listen(PORT, () => {
  console.log(`پیام‌رسان آماده است روی پورت ${PORT}`);
  console.log(`شماره ادمین: ${ADMIN_PHONE}`);
});
