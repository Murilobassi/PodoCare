/* ============================================================
   podologa.js — Painel da Podóloga
   Responsabilidades:
   - Carregar agendamentos e serviços da podóloga logada
   - Exibir agenda do dia e histórico recente
   - Cards financeiros (ganhos hoje / total acumulado)
   - Gerenciar serviços próprios (adicionar / remover)
============================================================ */


/* ── CARREGAMENTO PRINCIPAL ───────────────────────────────── */
async function loadPodologaData(nomeCompleto) {
  // Usa o nome vindo do banco (profile.full_name) como chave de busca
  const name = nomeCompleto || currentUser?.user_metadata?.full_name || currentUser?.email || '';

  const [{ data: apts }, { data: svcs }] = await Promise.all([
    sb.from('atendimentos').select('*').eq('podologa_name', name).order('date', { ascending: false }),
    sb.from('servicos').select('*').order('name'),
  ]);

  const today        = todayStr();
  const appointments = apts || [];
  const services     = svcs || [];

  // Segmenta os agendamentos de hoje
  const todayApts      = appointments.filter(a => a.date.split('T')[0] === today);
  const completedToday = todayApts.filter(a => isRevenue(a.status));
  const revenueToday   = completedToday.reduce((s, a) => s + parsePrice(a.price), 0);

  // Atualiza os mini-cards de stats do topo
  document.getElementById('b-today-revenue').textContent = 'R$ ' + fmtPrice(revenueToday);
  document.getElementById('b-today-count').textContent   = todayApts.filter(a => {
    const s = (a.status || '').toLowerCase();
    return s === 'confirmado' || s === 'confirmed';
  }).length;
  document.getElementById('b-today-clients').textContent = completedToday.length;

  renderTodayApts(todayApts);
  renderHistory(appointments, today);
  renderFinanceiro(appointments, completedToday, revenueToday);
  renderServices(services);
}


/* ── AGENDA DO DIA ────────────────────────────────────────── */
function renderTodayApts(todayApts) {
  const container = document.getElementById('b-today-apts');

  if (todayApts.length === 0) {
    container.innerHTML = `
      <div style="background:var(--bg3);border:1.5px dashed var(--border2);border-radius:var(--radius2);padding:40px;text-align:center;color:var(--muted)">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 12px;display:block;opacity:.35">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p style="font-size:13px;font-weight:500">Nenhum atendimento para hoje</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  todayApts.forEach(a => {
    const card = document.createElement('div'); card.className = 'apt-card';

    const tc = document.createElement('div'); tc.className = 'apt-time-col';
    const te = document.createElement('div'); te.className = 'apt-time'; te.textContent = a.time || '';
    tc.appendChild(te);

    const inf = document.createElement('div'); inf.className = 'apt-info';
    const nm  = document.createElement('div'); nm.className  = 'apt-name'; nm.textContent = a.client_name || '';
    const sv  = document.createElement('span');sv.className  = 'apt-svc';
    sv.textContent = (a.service_name || '') + (a.duration ? ` · ${a.duration} min` : '');
    inf.append(nm, sv);

    const rt = document.createElement('div'); rt.className = 'apt-right';
    const pr = document.createElement('div'); pr.className = 'apt-price'; pr.textContent = 'R$ ' + fmtPrice(a.price);
    const pi = document.createElement('div'); pi.className = 'status-pill ' + statusClass(a.status); pi.textContent = statusLabel(a.status);
    rt.append(pr, pi);

    card.append(tc, inf, rt);
    container.appendChild(card);
  });
}


/* ── HISTÓRICO RECENTE ────────────────────────────────────── */
function renderHistory(appointments, today) {
  const container = document.getElementById('b-history');
  const history   = appointments.filter(a => a.date.split('T')[0] !== today).slice(0, 4);

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Sem histórico recente</p></div>';
    return;
  }

  container.innerHTML = '';
  history.forEach(a => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--bg3);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:16px;margin-bottom:8px;border:1px solid var(--border)';

    const datePart  = document.createElement('div');
    datePart.style.cssText = 'min-width:76px;border-right:1px solid var(--border);padding-right:14px';
    const dateLabel = document.createElement('div');
    dateLabel.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)';
    dateLabel.textContent = fmtDate(a.date);
    const timeLabel = document.createElement('div');
    timeLabel.style.cssText = 'font-weight:700;color:var(--primary);font-size:15px';
    timeLabel.textContent = a.time || '';
    datePart.append(dateLabel, timeLabel);

    const infoPart  = document.createElement('div'); infoPart.style.flex = '1';
    const clientName= document.createElement('div');
    clientName.style.cssText = 'font-weight:600;font-size:13px';
    clientName.textContent = a.client_name || '';
    const svcName   = document.createElement('div');
    svcName.style.cssText = 'font-size:11px;color:var(--muted)';
    svcName.textContent = a.service_name || '';
    infoPart.append(clientName, svcName);

    const pricePart = document.createElement('div');
    pricePart.style.cssText = 'font-weight:700;color:var(--green);font-size:13px';
    pricePart.textContent = 'R$ ' + fmtPrice(a.price);

    div.append(datePart, infoPart, pricePart);
    container.appendChild(div);
  });
}


/* ── FINANCEIRO ───────────────────────────────────────────── */
function renderFinanceiro(appointments, completedToday, revenueToday) {
  const totalAll   = appointments.filter(a => isRevenue(a.status)).reduce((s, a) => s + parsePrice(a.price), 0);
  const totalCount = appointments.filter(a => isRevenue(a.status)).length;

  // Monta os cards via innerHTML (conteúdo estático, sem dados externos)
  document.getElementById('b-fin-cards').innerHTML = `
    <div class="fin-card">
      <div class="fin-card-head">
        <div class="fin-icon" style="background:var(--green-light)">
          <svg width="18" height="18" fill="none" stroke="var(--green)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div>
          <div class="fin-label">Ganhos Hoje</div>
          <div class="fin-value" id="fin-today-val">—</div>
        </div>
      </div>
      <div class="fin-desc" id="fin-today-desc"></div>
    </div>
    <div class="fin-card">
      <div class="fin-card-head">
        <div class="fin-icon" style="background:var(--primary-light)">
          <svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        </div>
        <div>
          <div class="fin-label">Total Acumulado</div>
          <div class="fin-value" id="fin-total-val">—</div>
        </div>
      </div>
      <div class="fin-desc" id="fin-total-desc"></div>
    </div>`;

  // Preenche os valores com textContent (seguro contra XSS)
  document.getElementById('fin-today-val').textContent  = 'R$ ' + fmtPrice(revenueToday);
  document.getElementById('fin-today-desc').textContent = `${completedToday.length} atendimento(s) concluído(s) hoje`;
  document.getElementById('fin-total-val').textContent  = 'R$ ' + fmtPrice(totalAll);
  document.getElementById('fin-total-desc').textContent = `${totalCount} atendimento(s) concluído(s) no total`;
}


/* ── LISTA DE SERVIÇOS ────────────────────────────────────── */
function renderServices(services) {
  const container = document.getElementById('b-services-list');

  if (services.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum serviço cadastrado</p></div>';
    return;
  }

  container.innerHTML = '';
  services.forEach(s => {
    const row  = document.createElement('div'); row.className = 'svc-row';

    const left = document.createElement('div'); left.style.display = 'flex'; left.style.alignItems = 'center';
    const icon = document.createElement('div'); icon.className = 'svc-icon';
    icon.innerHTML = '<svg width="15" height="15" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    const info = document.createElement('div');
    const nm   = document.createElement('div'); nm.className = 'svc-name'; nm.textContent = s.name || '';
    const mt   = document.createElement('div'); mt.className = 'svc-meta'; mt.textContent = `⏱ ${s.duration || 0} min`;
    info.append(nm, mt);
    left.append(icon, info);

    const right = document.createElement('div'); right.style.cssText = 'display:flex;align-items:center;gap:8px';
    const pr    = document.createElement('span'); pr.className = 'svc-price'; pr.textContent = 'R$ ' + fmtPrice(s.price);

    right.append(pr);

    row.append(left, right);
    container.appendChild(row);
  });
}


/* Formulários e exclusão de serviços delegados exclusivamente ao Master via painel de configurações */


/* ── ALTERNÂNCIA DE ABAS (Agenda / Financeiro / Serviços) ─── */
function podologaTab(tab, btn) {
  document.querySelectorAll('#page-podologa .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-podologa .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
}
