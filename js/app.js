import { supabase, toast, getSessionProfile } from './supabase.js';

const $ = id => document.getElementById(id);

/* ---------- Навигация / сессия ---------- */
async function initNav() {
  const { user, profile } = await getSessionProfile();
  document.querySelectorAll('[data-auth-only]').forEach(el => { el.hidden = !user; });
  document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = !!user; });
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = profile?.role !== 'admin'; });

  $('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  const burger = $('burger'), nav = $('nav');
  burger.addEventListener('click', () => nav.classList.toggle('open'));
  nav.addEventListener('click', e => { if (e.target.tagName === 'A') nav.classList.remove('open'); });
}

/* ---------- Форма заявки ---------- */
function initLeadForm() {
  $('leadForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('leadError'), ok = $('leadSuccess');
    err.hidden = true; ok.hidden = true;

    const name = $('leadName').value.trim();
    const phone = $('leadPhone').value.trim();
    const email = $('leadEmail').value.trim();
    const comment = $('leadComment').value.trim();

    if (name.length < 2) { err.textContent = 'Введите имя (минимум 2 символа).'; err.hidden = false; return; }
    if (!/^[+0-9()\-\s]{10,20}$/.test(phone)) { err.textContent = 'Введите корректный телефон.'; err.hidden = false; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Введите корректный email.'; err.hidden = false; return; }

    const { data: { user } } = await supabase.auth.getUser();

    const btn = $('leadBtn');
    btn.disabled = true; btn.textContent = 'Отправка…';
    const { error } = await supabase.from('calculator_leads').insert({
      name, phone, email, comment,
      client_id: user?.id ?? null,
    });
    btn.disabled = false; btn.textContent = 'Отправить заявку';

    if (error) {
      err.textContent = 'Не удалось отправить заявку. Попробуйте позже.';
      err.hidden = false;
      return;
    }
    ok.hidden = false;
    $('leadForm').reset();
    toast('Заявка отправлена', 'success');
  });
}

initNav();
initLeadForm();
