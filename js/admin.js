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
  if (error) { toast('Не удалось загрузить проекты', 'error'); return; }

  $('projectsWrap').hidden = !data?.length;
  $('projectsEmpty').hidden = !!data?.length;
  $('projectsTable').innerHTML = (data || []).map(p => `
    <tr>
      <td><a href="#" class="link" data-open="${p.id}">${escapeHtml(p.title)}</a></td>
      <td>${escapeHtml(p.profiles?.full_name || '—')}</td>
      <td>${escapeHtml(p.address)}</td>
      <td><span class="badge badge--${p.status}">${statusLabel(PROJECT_STATUSES, p.status)}</span></td>
      <td>${p.progress}%</td>
      <td class="actions">
        <button class="btn btn--small" data-edit="${p.id}">Изменить</button>
        <button class="btn btn--small btn--danger" data-del="${p.id}">Удалить</button>
      </td>
    </tr>`).join('');

  $('projectsTable').querySelectorAll('[data-open]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); openProjectDetail(a.dataset.open); }));
  $('projectsTable').querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => projectForm(b.dataset.edit)));
  $('projectsTable').querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => deleteProject(b.dataset.del)));
}

function clientOptions(selected) {
  return clients.map(c =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.full_name || c.email)}</option>`).join('');
}

function projectForm(id) {
  if (id) {
    supabase.from('projects').select('*').eq('id', id).single().then(({ data: p }) => {
      if (p) renderProjectForm(p);
    });
  } else {
    renderProjectForm(null);
  }
}

function renderProjectForm(p) {
  openModal(p ? 'Редактировать проект' : 'Новый проект', `
    <form id="projectFormEl" class="form" novalidate>
      <div class="field"><label>Название *</label>
        <input name="title" required maxlength="150" value="${escapeHtml(p?.title || '')}"></div>
      <div class="field"><label>Клиент *</label>
        <select name="client_id" required>
          <option value="">— выберите клиента —</option>
          ${clientOptions(p?.client_id)}
        </select></div>
      <div class="field"><label>Адрес</label>
        <input name="address" maxlength="200" value="${escapeHtml(p?.address || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Статус</label>
          <select name="status">${PROJECT_STATUSES.map(s =>
            `<option value="${s.value}" ${p?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        <div class="field"><label>Прогресс, %</label>
          <input type="number" name="progress" min="0" max="100" value="${p?.progress ?? 0}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Дата начала</label>
          <input type="date" name="start_date" value="${p?.start_date || ''}"></div>
        <div class="field"><label>Дата окончания</label>
          <input type="date" name="end_date" value="${p?.end_date || ''}"></div>
      </div>
      <button class="btn btn--primary" type="submit">${p ? 'Сохранить' : 'Создать'}</button>
      <p class="form-error" id="pfError" hidden></p>
    </form>`);

  $('projectFormEl').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = {
      title: f.get('title').trim(),
      client_id: f.get('client_id'),
      address: f.get('address').trim(),
      status: f.get('status'),
      progress: Math.min(100, Math.max(0, Number(f.get('progress')) || 0)),
      start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null,
    };
    const errEl = $('pfError');
    if (!rec.title) { errEl.textContent = 'Укажите название.'; errEl.hidden = false; return; }
    if (!rec.client_id) { errEl.textContent = 'Выберите клиента.'; errEl.hidden = false; return; }

    const q = p
      ? supabase.from('projects').update(rec).eq('id', p.id)
      : supabase.from('projects').insert(rec);
    const { error } = await q;
    if (error) { errEl.textContent = 'Ошибка сохранения: ' + error.message; errEl.hidden = false; return; }

    closeModal();
    toast('Проект сохранён', 'success');
    loadProjects(); loadStats();
  });
}

async function deleteProject(id) {
  if (!confirm('Удалить проект вместе с этапами, фото и платежами?')) return;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) { toast('Не удалось удалить проект', 'error'); return; }
  toast('Проект удалён', 'success');
  loadProjects(); loadStats();
}

/* ---------- Детали проекта: этапы + платежи ---------- */
async function openProjectDetail(id) {
  currentProjectId = id;
  const { data: p } = await supabase.from('projects').select('*, profiles(full_name)').eq('id', id).single();
  if (!p) return;
  $('pdTitle').textContent = p.title;
  $('pdMeta').textContent = `${p.profiles?.full_name || ''} · ${p.address || ''} · ${statusLabel(PROJECT_STATUSES, p.status)} · ${p.progress}%`;

  $('projectsWrap').hidden = true; $('projectsEmpty').hidden = true;
  $('projectDetail').hidden = false;
  await Promise.all([loadStages(id), loadPayments(id)]);
}

function showProjectsList() {
  $('projectDetail').hidden = true;
  loadProjects();
  switchTab('projects');
}

async function loadStages(projectId) {
  const { data } = await supabase
    .from('project_stages').select('*, stage_photos(*)')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  $('adminStages').innerHTML = (data || []).map(s => `
    <div class="card stage">
      <div class="stage__head" data-toggle="${s.id}">
        <span class="badge badge--${s.status}">${statusLabel(STAGE_STATUSES, s.status)}</span>
        <h4>${escapeHtml(s.title)}</h4>
        <span class="muted muted--small">${(s.stage_photos || []).length} фото</span>
        <span class="stage__chevron">▾</span>
      </div>
      <div class="stage__body" id="admin-stage-${s.id}" hidden>
        <div class="actions">
          <button class="btn btn--small" data-edit-stage="${s.id}">Изменить</button>
          <button class="btn btn--small btn--danger" data-del-stage="${s.id}">Удалить</button>
          <button class="btn btn--small" data-add-photo="${s.id}">+ Фото</button>
        </div>
        ${s.comment ? `<p>${escapeHtml(s.comment)}</p>` : ''}
        <div class="photos">
          ${(s.stage_photos || []).map(ph => `
            <figure class="photo">
              <img data-path="${ph.storage_path}" alt="${escapeHtml(ph.caption || '')}" loading="lazy">
              <figcaption>
                ${escapeHtml(ph.caption || '')}
                <button class="btn btn--small btn--danger" data-del-photo="${ph.id}" data-path-del="${ph.storage_path}">✕</button>
              </figcaption>
            </figure>`).join('') || '<p class="muted muted--small">Фото нет.</p>'}
        </div>
      </div>
    </div>`).join('') || '<div class="empty">Этапов нет.</div>';

  $('adminStages').querySelectorAll('.stage__head').forEach(h => {
    h.addEventListener('click', () => {
      const body = $(`admin-stage-${h.dataset.toggle}`);
      body.hidden = !body.hidden;
      if (!body.hidden) body.querySelectorAll('img[data-path]').forEach(async img => {
        if (!img.src) { const u = await signPhotoUrl(img.dataset.path); if (u) img.src = u; }
      });
    });
  });
  $('adminStages').querySelectorAll('[data-edit-stage]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); stageForm(b.dataset.editStage); }));
  $('adminStages').querySelectorAll('[data-del-stage]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); deleteStage(b.dataset.delStage); }));
  $('adminStages').querySelectorAll('[data-add-photo]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); photoForm(b.dataset.addPhoto); }));
  $('adminStages').querySelectorAll('[data-del-photo]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); deletePhoto(b.dataset.delPhoto, b.dataset.pathDel); }));
}

function stageForm(stageId) {
  const render = (s) => openModal(s ? 'Редактировать этап' : 'Новый этап', `
    <form id="stageFormEl" class="form" novalidate>
      <div class="field"><label>Название *</label>
        <input name="title" required maxlength="150" value="${escapeHtml(s?.title || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Статус</label>
          <select name="status">${STAGE_STATUSES.map(st =>
            `<option value="${st.value}" ${s?.status === st.value ? 'selected' : ''}>${st.label}</option>`).join('')}</select></div>
        <div class="field"><label>Порядок</label>
          <input type="number" name="sort_order" value="${s?.sort_order ?? 0}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Дата начала</label>
          <input type="date" name="start_date" value="${s?.start_date || ''}"></div>
        <div class="field"><label>Дата окончания</label>
          <input type="date" name="end_date" value="${s?.end_date || ''}"></div>
      </div>
      <div class="field"><label>Комментарий</label>
        <textarea name="comment" rows="3">${escapeHtml(s?.comment || '')}</textarea></div>
      <button class="btn btn--primary" type="submit">${s ? 'Сохранить' : 'Создать'}</button>
      <p class="form-error" id="sfError" hidden></p>
    </form>`);

  if (stageId) {
    supabase.from('project_stages').select('*').eq('id', stageId).single().then(({ data }) => render(data));
  } else render(null);

  document.addEventListener('submit', async function h(e) {
    if (e.target.id !== 'stageFormEl') return;
    document.removeEventListener('submit', h);
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = {
      project_id: currentProjectId,
      title: f.get('title').trim(),
      status: f.get('status'),
      sort_order: Number(f.get('sort_order')) || 0,
      start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null,
      comment: f.get('comment').trim(),
    };
    const errEl = $('sfError');
    if (!rec.title) { errEl.textContent = 'Укажите название этапа.'; errEl.hidden = false; return; }

    const q = stageId
      ? supabase.from('project_stages').update(rec).eq('id', stageId)
      : supabase.from('project_stages').insert(rec);
    const { error } = await q;
    if (error) { errEl.textContent = 'Ошибка: ' + error.message; errEl.hidden = false; return; }
    closeModal(); toast('Этап сохранён', 'success'); loadStages(currentProjectId);
  });
}

async function deleteStage(id) {
  if (!confirm('Удалить этап и его фото?')) return;
  const { error } = await supabase.from('project_stages').delete().eq('id', id);
  if (error) { toast('Не удалось удалить этап', 'error'); return; }
  toast('Этап удалён', 'success'); loadStages(currentProjectId);
}

/* ---------- Фото ---------- */
function photoForm(stageId) {
  openModal('Загрузить фото', `
    <form id="photoFormEl" class="form" novalidate>
      <div class="field"><label>Файл * (jpg, png, webp; до 10 МБ)</label>
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></div>
      <div class="field"><label>Подпись</label>
        <input name="caption" maxlength="200"></div>
      <button class="btn btn--primary" type="submit">Загрузить</button>
      <p class="form-error" id="phError" hidden></p>
    </form>`);

  document.addEventListener('submit', async function h(e) {
    if (e.target.id !== 'photoFormEl') return;
    document.removeEventListener('submit', h);
    e.preventDefault();
    const errEl = $('phError');
    const file = e.target.file.files[0];
    if (!file) { errEl.textContent = 'Выберите файл.'; errEl.hidden = false; return; }
    if (file.size > 10 * 1024 * 1024) { errEl.textContent = 'Файл больше 10 МБ.'; errEl.hidden = false; return; }

    const path = `${currentProjectId}/${stageId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600' });
    if (up.error) { errEl.textContent = 'Ошибка загрузки: ' + up.error.message; errEl.hidden = false; return; }

    const { error } = await supabase.from('stage_photos').insert({
      stage_id: stageId, storage_path: path, caption: e.target.caption.value.trim(),
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      errEl.textContent = 'Ошибка сохранения: ' + error.message; errEl.hidden = false; return;
    }
    closeModal(); toast('Фото загружено', 'success'); loadStages(currentProjectId);
  });
}

async function deletePhoto(photoId, path) {
  if (!confirm('Удалить фото?')) return;
  const { error } = await supabase.from('stage_photos').delete().eq('id', photoId);
  if (error) { toast('Не удалось удалить фото', 'error'); return; }
  await supabase.storage.from(BUCKET).remove([path]);
  toast('Фото удалено', 'success'); loadStages(currentProjectId);
}

/* ---------- Платежи ---------- */
async function loadPayments(projectId) {
  const { data } = await supabase.from('payments').select('*')
    .eq('project_id', projectId).order('payment_date', { ascending: false });
  $('paymentsWrap').hidden = !(data || []).length;
  $('paymentsEmpty').hidden = !!(data || []).length;
  $('paymentsTable').innerHTML = (data || []).map(p => `
    <tr>
      <td>${formatDate(p.payment_date)}</td>
      <td>${escapeHtml(p.purpose)}</td>
      <td>${formatMoney(p.amount)}</td>
      <td><span class="badge badge--${p.status}">${statusLabel(PAYMENT_STATUSES, p.status)}</span></td>
      <td class="actions">
        <button class="btn btn--small" data-edit-pay="${p.id}">Изменить</button>
        <button class="btn btn--small btn--danger" data-del-pay="${p.id}">Удалить</button>
      </td>
    </tr>`).join('');

  $('paymentsTable').querySelectorAll('[data-edit-pay]').forEach(b =>
    b.addEventListener('click', () => paymentForm(b.dataset.editPay)));
  $('paymentsTable').querySelectorAll('[data-del-pay]').forEach(b =>
    b.addEventListener('click', () => deletePayment(b.dataset.delPay)));
}

function paymentForm(payId) {
  const render = (p) => openModal(p ? 'Редактировать платёж' : 'Новый платёж', `
    <form id="payFormEl" class="form" novalidate>
      <div class="field"><label>Сумма, ₽ *</label>
        <input type="number" name="amount" min="1" step="0.01" required value="${p?.amount ?? ''}"></div>
      <div class="field-row">
        <div class="field"><label>Дата *</label>
          <input type="date" name="payment_date" required value="${p?.payment_date || new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Статус</label>
          <select name="status">${PAYMENT_STATUSES.map(s =>
            `<option value="${s.value}" ${p?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Назначение</label>
        <input name="purpose" maxlength="200" value="${escapeHtml(p?.purpose || '')}"></div>
      <button class="btn btn--primary" type="submit">${p ? 'Сохранить' : 'Создать'}</button>
      <p class="form-error" id="payError" hidden></p>
    </form>`);

  if (payId) {
    supabase.from('payments').select('*').eq('id', payId).single().then(({ data }) => render(data));
  } else render(null);

  document.addEventListener('submit', async function h(e) {
    if (e.target.id !== 'payFormEl') return;
    document.removeEventListener('submit', h);
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = {
      project_id: currentProjectId,
      amount: Number(f.get('amount')),
      payment_date: f.get('payment_date'),
      status: f.get('status'),
      purpose: f.get('purpose').trim(),
    };
    const errEl = $('payError');
    if (!rec.amount || rec.amount <= 0) { errEl.textContent = 'Укажите сумму.'; errEl.hidden = false; return; }
    if (!rec.payment_date) { errEl.textContent = 'Укажите дату.'; errEl.hidden = false; return; }

    const q = payId
      ? supabase.from('payments').update(rec).eq('id', payId)
      : supabase.from('payments').insert(rec);
    const { error } = await q;
    if (error) { errEl.textContent = 'Ошибка: ' + error.message; errEl.hidden = false; return; }
    closeModal(); toast('Платёж сохранён', 'success');
    loadPayments(currentProjectId); loadStats();
  });
}

async function deletePayment(id) {
  if (!confirm('Удалить платёж?')) return;
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) { toast('Не удалось удалить платёж', 'error'); return; }
  toast('Платёж удалён', 'success');
  loadPayments(currentProjectId); loadStats();
}

$('addProjectBtn').addEventListener('click', () => projectForm(null));
$('addStageBtn').addEventListener('click', () => stageForm(null));
$('addPaymentBtn').addEventListener('click', () => paymentForm(null));

/* ================= Заявки ================= */
async function loadLeads() {
  $('leadsLoading').hidden = false;
  const { data, error } = await supabase.from('calculator_leads')
    .select('*').order('created_at', { ascending: false });
  $('leadsLoading').hidden = true;
  if (error) { toast('Не удалось загрузить заявки', 'error'); return; }

  $('leadsWrap').hidden = !data?.length;
  $('leadsEmpty').hidden = !!data?.length;
  $('leadsTable').innerHTML = (data || []).map(l => `
    <tr>
      <td>${formatDate(l.created_at)}</td>
      <td>${escapeHtml(l.name)}</td>
      <td><a href="tel:${escapeHtml(l.phone)}">${escapeHtml(l.phone)}</a></td>
      <td><a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a></td>
      <td>${escapeHtml(l.comment) || '—'}</td>
      <td class="actions">
        <button class="btn btn--small btn--danger" data-del-lead="${l.id}">Удалить</button>
      </td>
    </tr>`).join('');

  $('leadsTable').querySelectorAll('[data-del-lead]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Удалить заявку?')) return;
      const { error } = await supabase.from('calculator_leads').delete().eq('id', b.dataset.delLead);
      if (error) { toast('Не удалось удалить заявку', 'error'); return; }
      toast('Заявка удалена', 'success'); loadLeads(); loadStats();
    }));
}

init();
