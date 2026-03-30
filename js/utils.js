/* ============================================================
   utils.js — Funções utilitárias compartilhadas
   Usadas por todos os outros módulos.
   Não acessa o Supabase diretamente.
============================================================ */


/* ── ESCAPE DE HTML (prevenção de XSS) ───────────────────── */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}


/* ── FORMATAÇÃO DE MOEDA ──────────────────────────────────── */
function fmtPrice(v) {
  const n = Number(String(v).replace('R$', '').replace(',', '.').trim());
  return isNaN(n) ? '0,00' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function parsePrice(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace('R$', '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}


/* ── FORMATAÇÃO DE DATA ───────────────────────────────────── */
function fmtDate(s) {
  if (!s) return '';
  const p = s.split('T')[0].split('-');
  if (p.length !== 3) return s;
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${p[2]} de ${meses[parseInt(p[1]) - 1]}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


/* ── STATUS DOS AGENDAMENTOS ──────────────────────────────── */

// Retorna true se o status conta como receita
function isRevenue(s) {
  const v = (s || '').toLowerCase();
  return v === 'completed' || v === 'confirmed' || v === 'concluido' || v === 'confirmado';
}

// Retorna a classe CSS correta para o status
function statusClass(s) {
  const v = (s || '').toLowerCase();
  if (v === 'confirmed'  || v === 'confirmado') return 'status-confirmed';
  if (v === 'completed'  || v === 'concluido')  return 'status-completed';
  if (v === 'cancelled'  || v === 'cancelado')  return 'status-cancelled';
  return 'status-confirmed';
}

// Retorna o label em português para exibição
function statusLabel(s) {
  const v = (s || '').toLowerCase();
  if (v === 'confirmed'  || v === 'confirmado') return 'Confirmado';
  if (v === 'completed'  || v === 'concluido')  return 'Concluído';
  if (v === 'cancelled'  || v === 'cancelado')  return 'Cancelado';
  return s || '—';
}


/* ── ROLE BADGE (HTML) ────────────────────────────────────── */
function roleBadge(r) {
  const badges = {
    MASTER:   '<span class="role-badge role-master">Master</span>',
    ADMIN:    '<span class="role-badge role-admin">Admin</span>',
    PODOLOGA: '<span class="role-badge role-podologa">Podóloga</span>',
  };
  return badges[r] || '';
}


/* ── VALIDAÇÕES ───────────────────────────────────────────── */

// Usa a API nativa do browser para validar e-mail (sem regex frágil)
function isValidEmail(email) {
  const inp = document.createElement('input');
  inp.type = 'email';
  inp.value = email;
  return inp.checkValidity();
}

// Valida que um valor é número positivo (e opcional: dentro de um limite)
function isPositiveNumber(v, max) {
  const n = parseFloat(v);
  return !isNaN(n) && n > 0 && (max === undefined || n <= max);
}

// Valida inputs de serviço (nome, preço, duração) — retorna mensagem de erro ou null
function validateServiceInput(name, price, duration) {
  if (!name || name.length < 2)    return 'Nome deve ter no mínimo 2 caracteres.';
  if (name.length > 100)           return 'Nome muito longo (máximo 100 caracteres).';
  if (/<[^>]*>/.test(name))        return 'Nome não pode conter HTML.';
  const p = parseFloat(price);
  if (isNaN(p) || p <= 0)          return 'Preço deve ser maior que zero.';
  if (p > 9999.99)                 return 'Preço máximo: R$ 9.999,99.';
  const d = parseInt(duration);
  if (isNaN(d) || d < 1 || d > 480) return 'Duração deve ser entre 1 e 480 minutos.';
  return null;
}

// Valida nome de profissional
function validateProfName(name) {
  if (!name || name.length < 2)    return 'Nome deve ter no mínimo 2 caracteres.';
  if (name.length > 100)           return 'Nome muito longo (máximo 100 caracteres).';
  if (/<[^>]*>/.test(name))        return 'Nome não pode conter HTML.';
  return null;
}


/* ── NAVEGAÇÃO ENTRE PÁGINAS ──────────────────────────────── */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
}


/* ── TOAST (notificações) ─────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = {
    success: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"   viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"   viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  const el      = document.createElement('div'); el.className = 'toast ' + type;
  const iconSpan= document.createElement('span'); iconSpan.innerHTML = icons[type] || '';
  const msgSpan = document.createElement('span'); msgSpan.textContent = msg;
  el.appendChild(iconSpan);
  el.appendChild(msgSpan);
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}


/* ── MODAL DE CONFIRMAÇÃO ─────────────────────────────────── */
function showConfirmModal(title, desc, cb) {
  document.getElementById('modal-title').textContent   = title;
  document.getElementById('modal-desc').textContent    = desc;
  document.getElementById('modal-confirm').onclick     = () => { closeModal(); cb(); };
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}
