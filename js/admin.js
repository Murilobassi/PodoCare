/* ============================================================
   admin.js — Painel Admin / Master
============================================================ */

let allAppointments = [];
let allProfs        = [];
let realtimeChannel = null;

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

  // [FIX] id correto no HTML é admin-count-val para o número, admin-count para o sub
  const countEl = document.getElementById('admin-count-val');
  if (countEl) countEl.textContent = completed.length;
  const countSub = document.getElementById('admin-count');
  if (countSub) countSub.textContent = completed.length + ' atendimento(s)';

  document.getElementById('admin-clients').textContent = unique;

  renderUpcoming(prof, today);
  renderPastList(prof, today);
}

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
  table.innerHTML = '<thead><tr><th>Horário / Dia</th><th>Paciente</th><th>Procedimento</th><th style="text-align:right">Valor</th></tr></thead>';

  const tbody = document.createElement('tbody');
  upcoming.slice(0, 10).forEach(a => {
    const tr = document.createElement('tr');
    tr.className = 'animate-item';

    const tdTime = document.createElement('td');
    tdTime.setAttribute('data-label', 'Horário / Dia');
    tdTime.innerHTML = '<div class="td-time-box"><div class="td-time"></div><div class="td-date"></div></div>';
    tdTime.querySelector('.td-time').textContent = a.time || '--:--';
    tdTime.querySelector('.td-date').textContent = fmtDate(a.date);

    const tdClient = document.createElement('td');
    tdClient.setAttribute('data-label', 'Paciente');
    tdClient.innerHTML = '<div class="td-name"></div><div class="td-prof"></div>';
    const tdName = tdClient.querySelector('.td-name');
    tdName.textContent = a.client_name   || '';
    tdName.style.fontSize = '20px';
    tdClient.querySelector('.td-prof').textContent = a.podologa_name || '';

    const tdSvc = document.createElement('td');
    tdSvc.setAttribute('data-label', 'Procedimento');
    const badge = document.createElement('span');
    badge.className = 'svc-badge'; badge.textContent = a.service_name || '';
    tdSvc.appendChild(badge);

    const tdPrice = document.createElement('td');
    tdPrice.setAttribute('data-label', 'Valor');
    tdPrice.className = 'td-price'; 
    tdPrice.textContent = 'R$ ' + fmtPrice(a.price);
    tdPrice.style.fontSize = '26px';
    tdPrice.style.fontFamily = 'var(--font-serif)';
    tdPrice.style.fontWeight = '600';

    tr.append(tdTime, tdClient, tdSvc, tdPrice);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  // [FIX] Wrapper com scroll horizontal para a tabela não vazar em mobile/tablet
  const wrapper = document.createElement('div');
  wrapper.className = 'table-scroll-wrapper';
  wrapper.appendChild(table);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

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

  // Controle de visibilidade do container de data personalizada
  const customDiv = document.getElementById('agenda-custom-date-container');
  if (customDiv) customDiv.style.display = (period === 'custom') ? 'flex' : 'none';

  let start = today;
  let isCustom = false;
  let noLimit = false;

  if (period === '7dias')  start = daysAgoStr(7);
  else if (period === '14dias') start = daysAgoStr(14);
  else if (period === '30dias') start = daysAgoStr(30);
  else if (period === 'custom') isCustom = true;
  else if (period === 'todos')  noLimit = true;

  let list = [...allAppointments];

  // Filtro de DATA
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

  // Filtro de PODÓLOGA
  if (prof !== 'todos') {
    list = list.filter(a => (a.podologa_name || '').trim() === prof.trim());
  }

  // Filtro de BUSCA (Texto)
  if (term) {
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanTerms = normalize(term).split(/\s+/).filter(Boolean);
    
    list = list.filter(a => {
      const target = normalize((a.client_name || '') + ' ' + (a.service_name || ''));
      const targetWords = target.split(/[\s\W]+/); // separa por espaços ou pontuações
      
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
    const price = document.createElement('div'); price.className = 'apt-price'; price.textContent = 'R$ ' + fmtPrice(a.price);
    price.style.fontSize = '28px';
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

function goAdmin()    { showPage('admin'); }
async function goSettings() {
  if (currentRole !== 'MASTER') { toast('Acesso restrito ao Master.', 'error'); return; }
  await showPage('settings');
  loadSettings();
}
