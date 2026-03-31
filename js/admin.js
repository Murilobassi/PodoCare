/* ============================================================
   admin.js — Painel Admin / Master
============================================================ */

let allAppointments = [];
let allProfs        = [];
let realtimeChannel = null;

/* ── Converte o campo time do banco (ex: "15", "15:00", "15:30") para minutos desde meia-noite ── */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const clean = String(timeStr).trim();
  // Formato HH:MM ou H:MM
  if (clean.includes(':')) {
    const [h, m] = clean.split(':').map(Number);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  }
  // Só a hora (ex: "15")
  const h = parseInt(clean, 10);
  return isNaN(h) ? 0 : h * 60;
}

/* ── Retorna os minutos atuais desde meia-noite ── */
function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

async function loadAdminData() {
  const [{ data: apts }, { data: profs }] = await Promise.all([
    sb.from('atendimentos').select('*').order('date', { ascending: false }),
    sb.from('podologos').select('name').eq('active', true),
  ]);

  allAppointments = apts  || [];
  allProfs        = (profs || []).map(b => b.name);

  ['filter-prof', 'agenda-filter-prof'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '';
    const optTodos = document.createElement('option');
    optTodos.value = 'todos'; optTodos.textContent = 'Toda a equipe';
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

function refreshAdmin() {
  const period = document.getElementById('filter-period').value;
  const prof   = document.getElementById('filter-prof').value;
  const today  = todayStr();

  const customDiv = document.getElementById('custom-date-container');
  if (customDiv) customDiv.style.display = (period === 'custom') ? 'flex' : 'none';

  let start = today;
  let isCustom = false;
  if (period === '7dias')  start = daysAgoStr(7);
  if (period === '14dias') start = daysAgoStr(14);
  if (period === '30dias') start = daysAgoStr(30);
  if (period === 'custom') isCustom = true;

  const filtered = allAppointments.filter(a => {
    const d = a.date.split('T')[0];
    let inRange = false;
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

  document.getElementById('admin-revenue').innerHTML =
    '<span style="font-size:28px;font-weight:500;color:inherit;margin-right:4px">R$</span>' + fmtPrice(revenue);
  document.getElementById('admin-ticket').innerHTML =
    '<span style="font-size:22px;font-weight:500;color:inherit;margin-right:4px">R$</span>' + fmtPrice(ticket);

  const countEl = document.getElementById('admin-count-val');
  if (countEl) countEl.textContent = completed.length;
  const countSub = document.getElementById('admin-count');
  if (countSub) countSub.textContent = completed.length + ' atendimento(s)';

  document.getElementById('admin-clients').textContent = unique;

  renderUpcoming(prof, today);
  renderPastList(prof, today);
}

function renderUpcoming(prof, today) {
  const agora = nowMinutes(); // minutos desde meia-noite no momento atual

  const upcoming = allAppointments.filter(a => {
    const d = a.date.split('T')[0];
    const s = (a.status || '').toLowerCase();

    // Cancelados e concluídos nunca aparecem como próximos
    if (s === 'concluido' || s === 'completed' || s === 'cancelado' || s === 'cancelled') return false;

    if (d > today) {
      // Data futura — sempre é próximo
      return true;
    }

    if (d === today) {
      // Hoje: só mostra se o horário ainda não passou
      // Se não tiver horário cadastrado, inclui (não sabemos quando é)
      if (!a.time) return true;
      return timeToMinutes(a.time) > agora;
    }

    // Data passada — não é próximo
    return false;
  }).filter(a => prof === 'todos' || (a.podologa_name || '').trim() === prof.trim());

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
  table.innerHTML = '<thead><tr><th>Horário / Dia</th><th>Paciente</th><th>Procedimento</th><th style="text-align:right">Valor</th></tr></thead>';

  const tbody = document.createElement('tbody');
  upcoming.slice(0, 10).forEach(a => {
    const tr = document.createElement('tr');
    tr.className = 'animate-item';

    const tdTime = document.createElement('td');
    tdTime.setAttribute('data-label', 'Horário / Dia');
    tdTime.innerHTML = '<div class="td-time-box"><span class="td-time"></span><span class="td-date"></span></div>';
    tdTime.querySelector('.td-time').textContent = a.time || '--';
    tdTime.querySelector('.td-date').textContent = fmtDate(a.date);

    const tdClient = document.createElement('td');
    tdClient.setAttribute('data-label', 'Paciente');
    tdClient.innerHTML = '<div class="td-name"></div><div class="td-prof"></div>';
    tdClient.querySelector('.td-name').textContent = a.client_name   || '';
    tdClient.querySelector('.td-prof').textContent = a.podologa_name || '';

    const tdSvc = document.createElement('td');
    tdSvc.setAttribute('data-label', 'Procedimento');
    const badge = document.createElement('span');
    badge.className = 'svc-badge'; badge.textContent = a.service_name || '';
    tdSvc.appendChild(badge);

    const tdPrice = document.createElement('td');
    tdPrice.setAttribute('data-label', 'Valor');
    tdPrice.className = 'td-price'; tdPrice.textContent = 'R$ ' + fmtPrice(a.price);

    tr.append(tdTime, tdClient, tdSvc, tdPrice);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  // Wrapper com scroll horizontal para não vazar em mobile
  const wrapper = document.createElement('div');
  wrapper.className = 'table-scroll-wrapper';
  wrapper.appendChild(table);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function renderPastList(prof, today) {
  const agora = nowMinutes();

  const past = allAppointments.filter(a => {
    const d = a.date.split('T')[0];
    const s = (a.status || '').toLowerCase();

    if (d < today) return true; // dia passado → sempre é recente

    if (d === today) {
      // Hoje: passou se está concluído/cancelado OU se o horário já passou
      const jaConcluido = s === 'concluido' || s === 'completed' || s === 'cancelado' || s === 'cancelled';
      const horaPassou  = a.time ? timeToMinutes(a.time) <= agora : false;
      return jaConcluido || horaPassou;
    }

    return false;
  }).filter(a => prof === 'todos' || (a.podologa_name || '').trim() === prof.trim())
    .slice(0, 6);

  const container = document.getElementById('past-list');

  if (past.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Sem histórico ainda</p></div>';
    return;
  }

  container.innerHTML = '';
  past.forEach(a => {
    const div  = document.createElement('div'); div.className = 'past-item animate-item';
    const left = document.createElement('div'); left.style.minWidth = '0'; left.style.flex = '1';
    const nm   = document.createElement('div'); nm.className = 'past-name'; nm.textContent = a.client_name || '';
    nm.style.fontSize = '20px';
    const mt   = document.createElement('div'); mt.className = 'past-meta';
    mt.textContent = (a.service_name || '') + (a.podologa_name ? ' · ' + a.podologa_name : '');
    mt.style.fontSize = '12px'; mt.style.color = 'var(--teal)'; mt.style.opacity = '0.8'; mt.style.fontWeight = '500';
    left.append(nm, mt);

    const right = document.createElement('div'); right.style.textAlign = 'right'; right.style.flexShrink = '0';
    const pr    = document.createElement('div'); pr.className = 'past-price'; pr.textContent = 'R$ ' + fmtPrice(a.price);
    pr.style.fontSize = '22px';
    const dt    = document.createElement('div');
    dt.style.cssText = 'font-size:11px;color:var(--teal);opacity:0.8;font-weight:600;margin-top:4px;white-space:nowrap;letter-spacing:0.03em';
    dt.textContent   = (a.time || '') + (a.date ? ' · ' + fmtDate(a.date) : '');
    right.append(pr, dt);

    div.append(left, right);
    container.appendChild(div);
  });
}

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

  const prof   = document.getElementById('agenda-filter-prof')?.value || 'todos';
  const term   = document.getElementById('agenda-search')?.value.trim() || '';
  const period = document.getElementById('agenda-filter-period')?.value || 'hoje';
  const today  = todayStr();

  const customDiv = document.getElementById('agenda-custom-date-container');
  if (customDiv) customDiv.style.display = (period === 'custom') ? 'flex' : 'none';

  let start = today;
  let isCustom = false;
  let noLimit = false;

  if (period === '7dias')       start = daysAgoStr(7);
  else if (period === '14dias') start = daysAgoStr(14);
  else if (period === '30dias') start = daysAgoStr(30);
  else if (period === 'custom') isCustom = true;
  else if (period === 'todos')  noLimit = true;

  let list = [...allAppointments];

  if (!noLimit) {
    list = list.filter(a => {
      const d = a.date.split('T')[0];
      if (isCustom) {
        const pStart = document.getElementById('agenda-filter-start')?.value || '1900-01-01';
        const pEnd   = document.getElementById('agenda-filter-end')?.value   || '2100-01-01';
        return d >= pStart && d <= pEnd;
      }
      return period === 'hoje' ? d === today : (d >= start && d <= today);
    });
  }

  if (prof !== 'todos') {
    list = list.filter(a => (a.podologa_name || '').trim() === prof.trim());
  }

  if (term) {
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanTerms = normalize(term).split(/\s+/).filter(Boolean);
    list = list.filter(a => {
      const target = normalize((a.client_name || '') + ' ' + (a.service_name || ''));
      const targetWords = target.split(/[\s\W]+/);
      return cleanTerms.every(t => targetWords.some(w => w.startsWith(t)));
    });
  }

  list = list.slice(0, 80);

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum resultado para os filtros</p></div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(a => {
    const card = document.createElement('div'); card.className = 'apt-card animate-item';

    const timeCol = document.createElement('div'); timeCol.className = 'apt-time-col';
    timeCol.style.display = 'flex'; timeCol.style.flexDirection = 'row'; timeCol.style.alignItems = 'baseline'; timeCol.style.gap = '8px'; timeCol.style.minWidth = '140px';
    const timeEl  = document.createElement('div'); timeEl.className  = 'apt-time';       timeEl.textContent  = a.time || '--';
    const dateEl  = document.createElement('div'); dateEl.className  = 'apt-date-small'; dateEl.textContent  = fmtDate(a.date);
    timeCol.append(timeEl, dateEl);

    const info   = document.createElement('div'); info.className = 'apt-info';
    const nameEl = document.createElement('div'); nameEl.className = 'apt-name'; nameEl.textContent = a.client_name   || '';
    nameEl.style.fontSize = '22px';
    const profEl = document.createElement('div'); profEl.className = 'apt-prof'; profEl.textContent = a.podologa_name || '';
    const svcEl  = document.createElement('span');svcEl.className  = 'apt-svc';  svcEl.textContent  = a.service_name  || '';
    info.append(nameEl, profEl, svcEl);

    const right = document.createElement('div'); right.className = 'apt-right';
    const price = document.createElement('div');
    price.className = 'apt-price';
    price.innerHTML = `<span>R$</span>${fmtPrice(a.price)}`;
    right.append(price);

    card.append(timeCol, info, right);
    container.appendChild(card);
  });
}

function subscribeRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  realtimeChannel = sb.channel('pc-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atendimentos' }, payload => {
      allAppointments.unshift(payload.new);
      const dot = document.getElementById('new-apt-dot');
      if (dot) dot.style.display = 'inline';
      toast('Novo agendamento recebido!', 'info');
      _reloadAfterRealtime();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'atendimentos' }, payload => {
      const idx = allAppointments.findIndex(a => a.id === payload.new.id);
      if (idx >= 0) allAppointments[idx] = payload.new;
      else          allAppointments.unshift(payload.new);
      _reloadAfterRealtime();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'atendimentos' }, payload => {
      allAppointments = allAppointments.filter(a => a.id !== payload.old.id);
      _reloadAfterRealtime();
    })
    .subscribe();
}

function _reloadAfterRealtime() {
  if (currentRole === 'MASTER' || currentRole === 'ADMIN') {
    refreshAdmin();
    renderFullAgenda();
  } else {
    loadPodologaData();
  }
}

function goAdmin() { showPage('admin'); }
async function goSettings() {
  if (currentRole !== 'MASTER') { toast('Acesso restrito ao Master.', 'error'); return; }
  await showPage('settings');
  loadSettings();
}
