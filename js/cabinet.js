import {
  supabase, requireRole, signPhotoUrl, toast,
  formatMoney, formatDate, statusLabel,
  STAGE_STATUSES, PAYMENT_STATUSES,
} from './supabase.js';

const $ = id => document.getElementById(id);
let ctx = null;
let stages = [];

async function init() {
  ctx = await requireRole('client');
  if (!ctx) return;
  $('welcomeTitle').textContent = `Здравствуйте, ${ctx.profile.full_name || 'клиент'}`;

  $('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'index.html';
  });
  $('backBtn').addEventListener('click', showList);

  await loadProjects();
}

/* ---------- Список проектов ---------- */
async function loadProjects() {
  $('loading').hidden = false;
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  $('loading').hidden = true;
  if (error) { toast('Не удалось загрузить проекты', 'error'); return; }

  if (!data?.length) {
    $('emptyState').hidden = false;
    $('projectsList').hidden = true;
    return;
  }

  $('projectsList').hidden = false;
  $('projectCards').innerHTML = data.map(p => `
    <div class="card project-card" data-id="${p.id}" tabindex="0" role="button">
      <h3>${escapeHtml(p.title)}</h3>
      <p class="muted">${escapeHtml(p.address) || 'Адрес не указан'}</p>
      <span class="badge badge--${p.status}">${statusLabel(PROJECT_STATUSES, p.status)}</span>
      <div class="progress"><div class="progress__bar" style="width:${p.progress}%"></div></div>
      <p class="muted muted--small">Готовность: ${p.progress}%</p>
    </div>`).join('');

  $('projectCards').querySelectorAll('.project-card').forEach(el => {
    el.addEventListener('click', () => openProject(el.dataset.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') openProject(el.dataset.id); });
  });
}

/* ---------- Просмотр проекта ---------- */
async function openProject(id) {
  $('loading').hidden = false;
  $('projectsList').hidden = true;

  const { data: project, error } = await supabase
    .from('projects').select('*').eq('id', id).single();
  if (error) {
    $('loading').hidden = true;
    toast('Не удалось открыть проект', 'error');
    showList();
    return;
  }

  $('pvTitle').textContent = project.title;
  $('pvAddress').textContent = project.address || '';
  $('pvProgress').style.width = `${project.progress}%`;
  $('pvProgressText').textContent = `${project.progress}%`;
  document.title = `${project.title} — ДомСтрой`;

  /* Этапы с фото */
  const { data: stagesData } = await supabase
    .from('project_stages')
    .select('*, stage_photos(*)')
    .eq('project_id', id)
    .order('sort_order', { ascending: true });
  stages = stagesData || [];
  renderStages();

  /* Платежи */
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('project_id', id)
    .order('payment_date', { ascending: false });

  $('paymentsTable').innerHTML = (payments || []).map(p => `
    <tr>
      <td>${formatDate(p.payment_date)}</td>
      <td>${escapeHtml(p.purpose)}</td>
      <td>${formatMoney(p.amount)}</td>
      <td><span class="badge badge--${p.status}">${statusLabel(PAYMENT_STATUSES, p.status)}</span></td>
    </tr>`).join('');
  $('paymentsWrap').hidden = !(payments || []).length;
  $('paymentsEmpty').hidden = !!(payments || []).length;

  $('loading').hidden = true;
  $('projectView').hidden = false;
  window.scrollTo(0, 0);
}

function renderStages() {
  if (!stages.length) {
    $('stagesList').innerHTML = '<div class="empty">Этапы пока не добавлены.</div>';
    return;
  }
  $('stagesList').innerHTML = stages.map((s, i) => `
    <div class="card stage">
      <div class="stage__head" data-toggle="${s.id}">
        <span class="badge badge--${s.status}">${statusLabel(STAGE_STATUSES, s.status)}</span>
        <h4>${escapeHtml(s.title)}</h4>
        <span class="muted muted--small">${formatDate(s.start_date)} — ${formatDate(s.end_date)}</span>
        <span class="stage__chevron">▾</span>
      </div>
      <div class="stage__body" id="stage-body-${s.id}" hidden>
        ${s.comment ? `<p>${escapeHtml(s.comment)}</p>` : ''}
        <div class="photos" id="photos-${s.id}">
          ${(s.stage_photos || []).length
            ? s.stage_photos.map(ph => `
                <figure class="photo">
                  <img data-path="${ph.storage_path}" alt="${escapeHtml(ph.caption || 'Фото этапа')}" loading="lazy">
                  ${ph.caption ? `<figcaption>${escapeHtml(ph.caption)}</figcaption>` : ''}
                </figure>`).join('')
            : '<p class="muted muted--small">Фото пока не добавлены.</p>'}
        </div>
      </div>
    </div>`).join('');

  /* аккордеон */
  $('stagesList').querySelectorAll('.stage__head').forEach(head => {
    head.addEventListener('click', () => {
      const body = $(`stage-body-${head.dataset.toggle}`);
      body.hidden = !body.hidden;
      if (!body.hidden) body.querySelectorAll('img[data-path]').forEach(loadPhoto);
    });
  });
}

/* Подписанные URL для фото (приватный bucket) */
async function loadPhoto(img) {
  if (img.src) return;
  const url = await signPhotoUrl(img.dataset.path);
  if (url) img.src = url;
}

function showList() {
  $('projectView').hidden = true;
  $('projectsList').hidden = false;
  document.title = 'Личный кабинет — ДомСтрой';
  window.scrollTo(0, 0);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
