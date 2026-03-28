/* ============================================================
   settings.js — Configurações da Clínica (acesso exclusivo Master)
   Responsabilidades:
   - Listar e remover podólogas da equipe
   - Convidar nova podóloga por e-mail
   - Listar, adicionar e remover serviços globais da clínica
============================================================ */


/* ── ALTERNÂNCIA DE ABAS (Podólogas / Serviços) ──────────── */
function settingsTab(tab, btn) {
  document.querySelectorAll('#page-settings .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-settings .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-' + tab).classList.add('active');
  btn.classList.add('active');
}


/* ── CARREGAMENTO INICIAL ─────────────────────────────────── */
async function loadSettings() {
  // Dupla verificação de role no frontend (a RLS do Supabase garante no backend)
  if (currentRole !== 'MASTER') {
    toast('Acesso negado.', 'error');
    goAdmin();
    return;
  }

  const [{ data: profs }, { data: services }] = await Promise.all([
    sb.from('podologos').select('*').order('name'),
    sb.from('servicos').select('*').order('name'),
  ]);

  renderProfs(profs || []);
  renderServicesSettings(services || []);
}


/* ── LISTA DE PODÓLOGAS ───────────────────────────────────── */
function renderProfs(list) {
  const container = document.getElementById('profs-list');

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nenhuma podóloga cadastrada ainda</p></div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(b => {
    const row  = document.createElement('div'); row.className = 'item-row';
    const info = document.createElement('div');
    const nm   = document.createElement('div'); nm.className = 'item-name'; nm.textContent = b.name || '';
    const mt   = document.createElement('div'); mt.className = 'item-meta'; mt.textContent = 'Cadastrada em ' + fmtDate(b.created_at);
    info.append(nm, mt);

    // Botão usa addEventListener (ID em closure, sem interpolação em onclick)
    const btn = document.createElement('button'); btn.className = 'btn btn-danger btn-sm btn-icon';
    btn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
    btn.addEventListener('click', () => deleteProf(b.id, b.name));

    row.append(info, btn);
    container.appendChild(row);
  });
}


/* ── CONVIDAR NOVA PODÓLOGA ───────────────────────────────── */
async function inviteProf() {
  if (currentRole !== 'MASTER') { toast('Acesso negado.', 'error'); return; }

  const name  = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();

  if (!name || !email)      { toast('Preencha nome e e-mail.', 'error'); return; }
  if (!isValidEmail(email)) { toast('E-mail inválido.', 'error');         return; }
  const nameErr = validateProfName(name);
  if (nameErr) { toast(nameErr, 'error'); return; }

  const btn = document.querySelector('.invite-form .btn-primary');
  btn.disabled    = true;
  btn.textContent = 'Enviando...';

  // Cadastra a podóloga na tabela de podologos
  const { error: profErr } = await sb.from('podologos').insert([{ name }]);

  btn.disabled  = false;
  btn.innerHTML = `
    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.33 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.97-.85a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
    Enviar Convite por E-mail`;

  if (profErr) { toast('Erro ao cadastrar podóloga.', 'error'); return; }

  // Informa que o convite deve ser enviado manualmente pelo Supabase Auth
  toast(`"${name}" cadastrada! Acesse Supabase → Auth → Users → Invite User para enviar o convite para ${email}.`, 'info');

  document.getElementById('invite-name').value  = '';
  document.getElementById('invite-email').value = '';

  loadSettings();
  loadAdminData();
}


/* ── REMOVER PODÓLOGA ─────────────────────────────────────── */
async function deleteProf(id, name) {
  showConfirmModal(
    'Remover Podóloga?',
    `Isso removerá "${name}" da equipe. Os atendimentos não serão apagados.`,
    async () => {
      const { error } = await sb.from('podologos').delete().eq('id', id);
      if (error) { toast('Erro ao remover.', 'error'); return; }
      toast('Podóloga removida.', 'success');
      loadSettings();
      loadAdminData();
    }
  );
}


/* ── LISTA DE SERVIÇOS (painel de configurações) ──────────── */
function renderServicesSettings(list) {
  const container = document.getElementById('services-list');

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nenhum serviço cadastrado</p></div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(s => {
    const row  = document.createElement('div'); row.className = 'item-row';
    const info = document.createElement('div');
    const nm   = document.createElement('div'); nm.className = 'item-name'; nm.textContent = s.name || '';
    const mt   = document.createElement('div'); mt.className = 'item-meta'; mt.textContent = `R$ ${fmtPrice(s.price)} · ${s.duration || 0} min`;
    info.append(nm, mt);

    const btn = document.createElement('button'); btn.className = 'btn btn-danger btn-sm btn-icon';
    btn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
    btn.addEventListener('click', () => deleteServiceSettings(s.id, s.name));

    row.append(info, btn);
    container.appendChild(row);
  });
}


/* ── ADICIONAR SERVIÇO (painel de configurações) ──────────── */
async function addServiceSettings() {
  if (currentRole !== 'MASTER' && currentRole !== 'ADMIN') {
    toast('Acesso negado.', 'error');
    return;
  }

  const name  = document.getElementById('s-svc-name').value.trim();
  const price = document.getElementById('s-svc-price').value;
  const dur   = document.getElementById('s-svc-duration').value;

  const inputErr = validateServiceInput(name, price, dur);
  if (inputErr) { toast(inputErr, 'error'); return; }

  const { error } = await sb.from('servicos').insert([{
    name,
    price:    parseFloat(price),
    duration: parseInt(dur),
  }]);

  if (error) { toast('Erro ao adicionar serviço.', 'error'); return; }

  document.getElementById('s-svc-name').value     = '';
  document.getElementById('s-svc-price').value    = '';
  document.getElementById('s-svc-duration').value = '';

  toast('Serviço adicionado!', 'success');
  loadSettings();
}


/* ── REMOVER SERVIÇO (painel de configurações) ────────────── */
async function deleteServiceSettings(id, name) {
  showConfirmModal(
    'Remover Serviço?',
    `Isso removerá "${name}" permanentemente.`,
    async () => {
      const { error } = await sb.from('servicos').delete().eq('id', id);
      if (error) { toast('Erro ao remover serviço.', 'error'); return; }
      toast('Serviço removido.', 'success');
      loadSettings();
    }
  );
}
