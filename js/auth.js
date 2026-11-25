import { supabase, getSessionProfile } from './supabase.js';

const $ = id => document.getElementById(id);

/* Если уже авторизован — сразу в кабинет */
(async () => {
  const { user, profile } = await getSessionProfile();
  if (user && profile) {
    location.href = profile.role === 'admin' ? 'admin.html' : 'cabinet.html';
  }
})();

/* Переключение вкладок */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    $('loginForm').hidden = tab !== 'login';
    $('registerForm').hidden = tab !== 'register';
  });
});

function setError(elId, msg) {
  const el = $(elId);
  el.textContent = msg;
  el.hidden = !msg;
}

/* Вход */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  setError('loginError', '');

  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('loginError', 'Введите корректный email.'); return; }
  if (password.length < 6) { setError('loginError', 'Пароль — минимум 6 символов.'); return; }

  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = 'Входим…';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Войти';

  if (error) { setError('loginError', 'Неверный email или пароль.'); return; }

  const { profile } = await getSessionProfile();
  location.href = profile?.role === 'admin' ? 'admin.html' : 'cabinet.html';
});

/* Регистрация */
$('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  setError('regError', '');
  $('regSuccess').hidden = true;

  const fullName = $('regName').value.trim();
  const phone = $('regPhone').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;

  if (fullName.length < 2) { setError('regError', 'Введите ФИО (минимум 2 символа).'); return; }
  if (!/^[+0-9()\-\s]{10,20}$/.test(phone)) { setError('regError', 'Введите корректный телефон.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('regError', 'Введите корректный email.'); return; }
  if (password.length < 6) { setError('regError', 'Пароль — минимум 6 символов.'); return; }

  const btn = $('regBtn');
  btn.disabled = true; btn.textContent = 'Регистрируем…';
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });
  btn.disabled = false; btn.textContent = 'Зарегистрироваться';

  if (error) {
    setError('regError', error.message === 'User already registered'
      ? 'Пользователь с таким email уже зарегистрирован.'
      : 'Не удалось зарегистрироваться. Попробуйте позже.');
    return;
  }
  $('regSuccess').hidden = false;
  $('registerForm').reset();
});
