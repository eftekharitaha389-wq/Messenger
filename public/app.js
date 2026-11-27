const API = '';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let socket = null;
let currentChatId = null;
let allUsers = [];

// عناصر صفحه
const authPage = document.getElementById('auth-page');
const chatPage = document.getElementById('chat-page');
const adminPage = document.getElementById('admin-page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authError = document.getElementById('auth-error');

// تب‌ها
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

// ورود
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(API + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ورود');
    saveAuth(data);
    startApp();
  } catch (err) {
    authError.textContent = err.message;
  }
};

// ثبت‌نام
registerForm.onsubmit = async (e) => {
  e.preventDefault();
  authError.textContent = '';
  
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!name || !phone || !password) {
    authError.textContent = 'همه فیلدها الزامی هستند';
    return;
  }

  try {
    const res = await fetch(API + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'خطا در ثبت‌نام');
    }
    
    saveAuth(data);
    startApp();
  } catch (err
