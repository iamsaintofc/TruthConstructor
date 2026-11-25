import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

export const BUCKET = 'stage-photos';

export const PROJECT_STATUSES = [
  { value: 'draft',   label: 'Проект' },
  { value: 'active',  label: 'В работе' },
  { value: 'paused',  label: 'Приостановлен' },
  { value: 'done',    label: 'Завершён' },
];

export const STAGE_STATUSES = [
  { value: 'planned',     label: 'Запланирован' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done',        label: 'Выполнен' },
];

export const PAYMENT_STATUSES = [
  { value: 'pending',   label: 'Ожидает' },
  { value: 'paid',      label: 'Оплачен' },
  { value: 'cancelled', label: 'Отменён' },
];

export async function getSessionProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();
  return { user, profile };
}

export async function requireRole(role, redirect = 'auth.html') {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) { location.href = redirect; return null; }
  if (profile.role !== role) { location.href = profile.role === 'admin' ? 'admin.html' : 'cabinet.html'; return null; }
  return { user, profile };
}

export function formatMoney(n) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' ₽';
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

export function statusLabel(list, value) {
  return (list.find(s => s.value === value) || {}).label || value || '—';
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'info') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

export async function signPhotoUrl(path) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
