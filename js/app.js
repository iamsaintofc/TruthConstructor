import { supabase, toast, formatMoney, getSessionProfile } from './supabase.js';

const $ = id => document.getElementById(id);
const OPT_KEYS = ['opt_garage', 'opt_terrace', 'opt_porch'];

let configs = null;
let currentCalc = null;

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

/* ---------- Загрузка конфигурации ---------- */
async function loadConfigs() {
  const { data, error } = await supabase
    .from('calculator_configs')
    .select('key, value')
    .eq('is_active', true);
  if (error || !data?.length) return null;
  return Object.fromEntries(data.map(r => [r.key, Number(r.value)]));
}

function num(key) {
  const v = configs?.[key];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

/* ---------- Расчёт ---------- */
function calculate() {
  const area  = Math.min(1000, Math.max(30, Number($('area').value) || 0));
  const floors = Number($('floors').value);

  const perM2 =
    num($('foundation').value) +
    num($('wall').value) +
    num($('roof').value) +
    num($('finish').value);

  const floorCoef = num(`floor_coef_${floors}`) || 1;
  let base = area * perM2 * floorCoef;
  OPT_KEYS.forEach(k => { if ($(k).checked) base += num(k); });

  const min = Math.round(base * (num('price_spread_min') || 0.9));
  const max = Math.round(base * (num('price_spread_max') || 1.15));
  const days = Math.round(
    num('days_base') +
    num('days_per_floor') * (floors - 1) +
    num('days_per_100m2') * Math.floor(area / 100)
  );
  return { min, max, days };
}

/* ---------- События ---------- */
async function init() {
  initNav();

  configs = await loadConfigs();
  if (!configs) {
    $('calcEmpty').hidden = false;
    $('calcForm').hidden = true;
    return;
  }

  $('calcForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('calcError');
    err.hidden = true;

    const area = Number($('area').value);
    if (!area || area < 30 || area > 1000) {
      err.textContent = 'Укажите площадь от 30 до 1000 м².';
      err.hidden = false;
      return;
    }

    const btn = $('calcBtn');
    btn.disabled = true; btn.textContent = 'Считаем…';
    try {
      currentCalc = calculate();
      $('priceMin').textContent = formatMoney(currentCalc.min);
      $('priceMax').textContent = formatMoney(currentCalc.max);
      $('priceDays').textContent = `~${currentCalc.days} дней`;
      $('calcResult').hidden = false;
      $('calcResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      btn.disabled = false; btn.textContent = 'Рассчитать';
    }
  });

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
    if (!currentCalc) { err.textContent = 'Сначала выполните расчёт.'; err.hidden = false; return; }

    const { data: { user } } = await supabase.auth.getUser();

    const btn = $('leadBtn');
    btn.disabled = true; btn.textContent = 'Отправка…';
    const { error } = await supabase.from('calculator_leads').insert({
      name, phone, email, comment,
      calculated_min: currentCalc.min,
      calculated_max: currentCalc.max,
      estimated_days: currentCalc.days,
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

init();
