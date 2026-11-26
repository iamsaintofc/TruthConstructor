import {
  supabase, requireRole, signPhotoUrl, toast, BUCKET,
  formatMoney, formatDate, statusLabel, escapeHtml,
  PROJECT_STATUSES, STAGE_STATUSES, PAYMENT_STATUSES,
} from './supabase.js';

const $ = id => document.getElementById(id);
let clients = [];
let currentProjectId = null;

/* ================= Инициализация ================= */
async function init() {
  const ctx = await requireRole('admin');
  if (!ctx) return;

  $('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'index.html';
  });

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  $('backToProjects').addEventListener('click', showProjectsList);

  const { data } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'client').order('full_name');
  clients = data || [];

  await Promise.all([loadStats(), loadProjects(), loadLeads()]);
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
  $(`panel-${tab}`).hidden = false;
}

/* ================= Модалка ================= */
function openModal(title, bodyHtml) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; }

/* ================= Статистика ================= */
async function loadStats() {
  const [{ count: total }, { count: active }, { count: leads }, { data: paid }] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('calculator_leads').select('id', { count: 'exact', head: true }),
    supabase.from('payments').select('amount').eq('status', 'paid'),
  ]);
  $('statProjects').textContent = total ?? 0;
  $('statActive').textContent = active ?? 0;
  $('statLeads').textContent = leads ?? 0;
  $('statPaid').textContent = formatMoney((paid || []).reduce((s, p) => s + Number(p.amount), 0));
}

/* ================= Проекты ================= */
async function loadProjects() {
  $('projectsLoading').hidden = false;
  const { data, error } = await supabase
    .from('projects').select('*, profiles(full_name)')
    .order('created_at', { ascending: false });
  $('projectsLoading').hidden = true;
  if (error) { toast('Не удалось загрузить проекты', 'error
