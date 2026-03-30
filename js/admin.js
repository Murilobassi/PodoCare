/* ============================================================
   admin.js — Painel Admin / Master
   Responsabilidades:
   - Carregar todos os agendamentos e podólogas
   - Dashboard de performance (faturamento, ticket médio, etc.)
   - Agenda completa com filtros
   - Realtime via Supabase Channels
============================================================ */


/* ── ESTADO DO ADMIN ──────────────────────────────────────── */
let allAppointments = [];
let allProfs        = [];
let realtimeChannel = null;


/* ── CARREGAMENTO INICIAL ─────────────────────────────────── */
async function loadAdminData() {
  const [{ data: apts }, { data: profs }] = await Promise.all([
    sb.from('atendimentos').select('*').order('date', { ascending: false }),
    sb.from('podologos').select('name').eq('active', true),
  ]);

  allAppointments = apts  || [];
  allProfs        = (profs || []).map(b => b.name);

  // Popula os selects de filtro de forma segura (sem innerHTML com dados externos)
  ['filter-prof', 'agenda-filter-prof'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '';

    const optTodos = document.createElement('option');
    optTodos.value       = 'todos';
    optTodos.textContent = 'Toda a equipe';
    sel.appendChild(optTodos);

    allProfs.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });

    if (valorAtual && valorAtual !== 'todos') sel.value = valorAtual;
  });

  refreshAdmin();
}


/* ── ALTERNÂNCIA DE ABAS (Performance / Agenda) ──────────── */
function adminTab(tab, btn) {
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active-tab'));
  document.querySelectorAll('.header-nav .nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active-tab');
  btn.classList.add('active');

  if (tab === 'agenda') {
    renderFullAgenda();
    const dot = document.getElementById('new-apt-dot');
    if (dot) dot.style.display = 'none';
  }
}


/* ── DASHBOARD: CARDS DE ESTATÍSTICAS ────────────────────── */
function refreshAdmin() {
  const period = document.getElementById('filter-period').value;
  const prof   = document.getElementById('filter-prof').value;
  const today  = todayStr();

  const customDiv = document.getElementById('custom-date-container');
  if (customDiv) {
    customDiv.style.display = (period === 'custom') ? 'flex' : 'none';
  }

  // Define o intervalo de datas conforme o filtro
  let start = today;
  let isCustom = false;

  if (period === '7dias')  start = daysAgoStr(7);
  if (period === '14dias') start = daysAgoStr(14);
  if (period === '30dias') start = daysAgoStr(30);
  if (period === 'custom') isCustom = true;

  // Filtra agendamentos pelo período e podóloga
  const filtered = allAppointments.filter(a => {
    const d       = a.date.split('T')[0];
    let inRange   = false;

    if (isCustom) {
      const pStart = document.getElementById('filter-start')?.value || '1900-01-01';
      const pEnd   = document.getElementById('filter-end')?.value   || '2100-01-01';
      inRange = d >= pStart && d <= pEnd;
    } else {
      inRange = period === 'hoje' ? d === today : (d >= start && d <= today);
    }

    return inRange && (prof === 'todos' || (a.podologa_name || '').trim() === prof.trim());
  });

  const completed = filtered.filter(a => isRevenue(a.status));
  const revenue   = completed.reduce((s, a) => s + parsePrice(a.price), 0);
  const ticket    = completed.length > 0 ? revenue / completed.length : 0;
  const unique    = new Set(completed.map(a => a.client_name + '-' + (a.client_phone || ''))).size;

  // Atualiza os cards de stats
  document.getElementById('admin-revenue').innerHTML =
    '<span style="font-size:16px;color:var(--accent);font-weight:700">R$&nbsp;</span>' + fmtPrice(revenue);
  document.getElementById('admin-ticket').innerHTML =
    '<span style="font-size:16px;color:var(--accent);font-weight:700">R$&nbsp;</span>' + fmtPrice(ticket);
  document.getElementById('admin-count').textContent   = completed.length;
  document.getElementById('admin-clients').textContent = unique;

  renderUpcoming(prof, today);
  renderPastList(prof, today);
}


/* ── DASHBOARD: PRÓXIMOS ATENDIMENTOS ────────────────────── */
function renderUpcoming(prof, today) {
  const upcoming = allAppointments.filter(a => {
    const d = a.date.split('T')[0];
    const s = (a.status || '').toLowerCase();
    const futuro = d > today || (d === today && s !== 'concluido' && s !== 'completed' && s !== 'cancelado' && s !== 'cancelled');
    return futuro && (prof === 'todos' || (a.podologa_name || '').trim() === prof.trim());
  });

  document.getElementById('upcoming-count').textContent = upcoming.length + ' agendados';

  const container = document.getElementById('upcoming-table');

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>Agenda está vazia</p>
      </div>`;
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>Horário</th><th>Paciente</th><th>Procedimento</th><th style="text-align:right">Valor</th></tr></thead>';

  const tbody = document.createElement('tbody');
  upcoming.slice(0, 10).forEach(a => {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.innerHTML = '<div class="td-time"></div><div class="td-date"></div>';
    tdTime.querySelector('.td-time').textContent = a.time || '';
    tdTime.querySelector('.td-date').textContent = fmtDate(a.date);

    const tdClient = document.createElement('td');
    tdClient.innerHTML = '<div class="td-name"></div><div class="td-prof"></div>';
    tdClient.querySelector('.td-name').textContent = a.client_name   || '';
    tdClient.querySelector('.td-prof').textContent = a.podologa_name || '';

    const tdSvc   = document.createElement('td');
    const badge   = document.createElement('span');
    badge.className   = 'svc-badge';
    badge.textContent = a.service_name || '';
    tdSvc.appendChild(badge);

    const tdPrice = document.createElement('td');
    tdPrice.className   = 'td-price';
    tdPrice.textContent = 'R$ ' + fmtPrice(a.price);

    tr.append(tdTime, tdClient, tdSvc, tdPrice);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}


/* ── DASHBOARD: ATENDIMENTOS RECENTES ────────────────────── */
function renderPastList(prof, today) {
  const past = allAppointments.filter(a => {
    const d = a.date.split('T')[0];
    const s = (a.status || '').toLowerCase();
    const passou = d < today || (d === today && (s === 'concluido' || s === 'completed' || s === 'cancelado' || s === 'cancelled'));
    return passou && (prof === 'todos' || (a.podologa_name || '').trim() === prof.trim());
  }).slice(0, 6);

  const container = document.getElementById('past-list');

  if (past.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Sem histórico ainda</p></div>';
    return;
  }

  container.innerHTML = '';
  past.forEach(a => {
    const div   = document.createElement('div');  div.className = 'past-item';
    const left  = document.createElement('div');
    const nm    = document.createElement('div');  nm.className = 'past-name'; nm.textContent = a.client_name || '';
    const mt    = document.createElement('div');  mt.className = 'past-meta';
    mt.textContent = (a.service_name || '') + (a.podologa_name ? ' · ' + a.podologa_name : '');
    left.append(nm, mt);

    const right = document.createElement('div');  right.style.textAlign = 'right';
    const pr    = document.createElement('div');  pr.className = 'past-price'; pr.textContent = 'R$ ' + fmtPrice(a.price);
    const dt    = document.createElement('div');
    dt.style.cssText = 'font-size:10px;color:var(--muted);margin-top:2px';
    dt.textContent   = (a.time || '') + (a.date ? ' · ' + fmtDate(a.date) : '');
    right.append(pr, dt);

    div.append(left, right);
    container.appendChild(div);
  });
}


/* ── AGENDA COMPLETA (com filtros) ───────────────────────── */
function renderFullAgenda() {
  const container = document.getElementById('full-agenda-list');

  if (allAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>Nenhum atendimento registrado</p>
      </div>`;
    return;
  }

  const prof   = document.getElementById('agenda-filter-prof')?.value   || 'todos';
  const status = document.getElementById('agenda-filter-status')?.value || 'todos';

  let list = [...allAppointments];
  if (prof   !== 'todos') list = list.filter(a => (a.podologa_name || '').trim() === prof.trim());
  if (status !== 'todos') list = list.filter(a => (a.status || '').toLowerCase().includes(status));
  list = list.slice(0, 80);

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum resultado para os filtros</p></div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(a => {
    const card    = document.createElement('div'); card.className = 'apt-card';

    const timeCol = document.createElement('div'); timeCol.className = 'apt-time-col';
    const timeEl  = document.createElement('div'); timeEl.className  = 'apt-time';       timeEl.textContent  = a.time || '--';
    const dateEl  = document.createElement('div'); dateEl.className  = 'apt-date-small'; dateEl.textContent  = fmtDate(a.date);
    timeCol.append(timeEl, dateEl);

    const info   = document.createElement('div'); info.className = 'apt-info';
    const nameEl = document.createElement('div'); nameEl.className = 'apt-name'; nameEl.textContent = a.client_name   || '';
    const profEl = document.createElement('div'); profEl.className = 'apt-prof'; profEl.textContent = a.podologa_name || '';
    const svcEl  = document.createElement('span');svcEl.className  = 'apt-svc';  svcEl.textContent  = a.service_name  || '';
    info.append(nameEl, profEl, svcEl);

    const right  = document.createElement('div'); right.className = 'apt-right';
    const price  = document.createElement('div'); price.className = 'apt-price'; price.textContent = 'R$ ' + fmtPrice(a.price);
    const pill   = document.createElement('div'); pill.className  = 'status-pill ' + statusClass(a.status); pill.textContent = statusLabel(a.status);
    right.append(price, pill);

    card.append(timeCol, info, right);
    container.appendChild(card);
  });
}


/* ── REALTIME (Supabase Channels) ─────────────────────────── */
function subscribeRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  realtimeChannel = sb.channel('pc-changes')
    // Novo agendamento inserido
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atendimentos' }, payload => {
      allAppointments.unshift(payload.new);
      const dot = document.getElementById('new-apt-dot');
      if (dot) dot.style.display = 'inline';
      toast('Novo agendamento recebido!', 'info');
      _reloadAfterRealtime();
    })
    // Agendamento atualizado
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'atendimentos' }, payload => {
      const idx = allAppointments.findIndex(a => a.id === payload.new.id);
      if (idx >= 0) allAppointments[idx] = payload.new;
      else          allAppointments.unshift(payload.new);
      _reloadAfterRealtime();
    })
    // Agendamento deletado
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'atendimentos' }, payload => {
      allAppointments = allAppointments.filter(a => a.id !== payload.old.id);
      _reloadAfterRealtime();
    })
    .subscribe();
}

// Recarrega a view correta dependendo de quem está logado
function _reloadAfterRealtime() {
  if (currentRole === 'MASTER' || currentRole === 'ADMIN') {
    refreshAdmin();
    renderFullAgenda();
  } else {
    loadPodologaData();
  }
}


/* ── NAVEGAÇÃO ────────────────────────────────────────────── */
function goAdmin()    { showPage('admin'); }
function goSettings() {
  if (currentRole !== 'MASTER') { toast('Acesso restrito ao Master.', 'error'); return; }
  loadSettings();
  showPage('settings');
}
