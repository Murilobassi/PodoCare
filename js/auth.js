/* ============================================================
   auth.js — Autenticação de usuários
   Responsabilidades:
   - Login com e-mail e senha (com rate limiting)
   - Criação de conta (signup)
   - Logout
   - Verificação de perfil e role no banco
   - Redirecionamento pós-login conforme role
============================================================ */


/* ── ESTADO DE AUTENTICAÇÃO ───────────────────────────────── */
let currentUser = null;
let currentRole = null;

// Proteção contra brute force: bloqueia após tentativas excessivas
let loginAttempts = 0;
let loginLocked   = false;


/* ── TABS DA TELA DE AUTH (Entrar / Criar Conta) ─────────── */
function authTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('auth-' + tab).classList.add('active');
}


/* ── LOGIN ────────────────────────────────────────────────── */
async function doLogin() {
  if (loginLocked) {
    toast('Aguarde antes de tentar novamente.', 'error');
    return;
  }

  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  if (!email || !pass)       { toast('Preencha e-mail e senha.', 'error');  return; }
  if (!isValidEmail(email))  { toast('E-mail inválido.', 'error');           return; }

  const btn = document.getElementById('login-btn');
  btn.disabled    = true;
  btn.textContent = 'Entrando...';

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });

  btn.disabled  = false;
  btn.innerHTML = 'Entrar <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  if (error) {
    loginAttempts++;

    // Backoff progressivo: 5s após 3 tentativas, 15s após 5, 60s após 7
    if (loginAttempts >= 3) {
      const delay = loginAttempts >= 7 ? 60000 : loginAttempts >= 5 ? 15000 : 5000;
      loginLocked   = true;
      btn.disabled  = true;
      toast(`Muitas tentativas. Aguarde ${Math.round(delay / 1000)}s.`, 'error');
      setTimeout(() => { loginLocked = false; btn.disabled = false; }, delay);
    } else {
      toast(error.message || 'Erro ao entrar.', 'error');
    }
  } else {
    loginAttempts = 0;
  }
}


/* ── SIGNUP (criar conta) ─────────────────────────────────── */
async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;

  if (!name || !email || !pass)  { toast('Preencha todos os campos.', 'error');         return; }
  if (!isValidEmail(email))      { toast('E-mail inválido.', 'error');                   return; }
  if (pass.length < 8)           { toast('Senha: mínimo 8 caracteres.', 'error');        return; }
  if (!/[A-Z]/.test(pass))       { toast('Senha precisa de uma letra maiúscula.', 'error'); return; }
  if (!/[0-9]/.test(pass))       { toast('Senha precisa de um número.', 'error');         return; }

  const btn = document.getElementById('signup-btn');
  btn.disabled    = true;
  btn.textContent = 'Criando...';

  const { error } = await sb.auth.signUp({
    email,
    password: pass,
    options:  { data: { full_name: name } },
  });

  btn.disabled    = false;
  btn.textContent = 'Criar Conta';

  if (error) { toast(error.message || 'Erro ao criar conta.', 'error'); return; }
  toast('Conta criada! Verifique seu e-mail.', 'success');
}


/* ── ONBOARDING (Completar Convite) ───────────────────────── */
async function doOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  const pass = document.getElementById('ob-password').value;

  if (!name || !pass) { toast('Preencha os campos.', 'error'); return; }
  if (pass.length < 8) { toast('Senha de no mínimo 8 caracteres.', 'error'); return; }

  const btn = document.getElementById('ob-btn');
  btn.disabled = true;
  btn.textContent = 'Aguarde...';

  // Salva no Authentication do Supabase
  const { error: authErr } = await sb.auth.updateUser({
    password: pass,
    data: { full_name: name }
  });

  // Salva no Perfil (banco de dados)
  if (currentUser) {
    await sb.from('profiles').update({ full_name: name }).eq('id', currentUser.id);
  }

  btn.disabled = false;
  btn.textContent = 'Salvar e Entrar';

  if (authErr) { toast(authErr.message || 'Erro ao definir senha.', 'error'); return; }

  toast('Pronto! Conta ativada.', 'success');
  
  // Remove tipo invite da URL para não repetir
  window.history.replaceState(null, null, window.location.pathname);

  // Força reload completo da sessão para pegar os novos nomes e entrar.
  const { data } = await sb.auth.getSession();
  initSession(data.session);
}


/* ── LOGOUT ───────────────────────────────────────────────── */
async function doLogout() {
  try { await sb.auth.signOut(); } catch(e) {}
  currentUser = null;
  currentRole = null;
  if (typeof allAppointments !== 'undefined') allAppointments = [];
  const btn = document.getElementById('nav-settings-btn');
  if (btn) btn.style.display = 'none';
  showPage('auth');
}


/* ── VERIFICAÇÃO DE PERFIL E ROLE ─────────────────────────── */
async function fetchProfile(uid) {
  const { data, error } = await sb
    .from('profiles')
    .select('role, full_name')
    .eq('id', uid)
    .single();

  if (error || !data) {
    await sb.auth.signOut();
    showPage('auth');
    toast('Erro ao verificar permissões.', 'error');
    return null;
  }

  // Garante que o role retornado é um valor conhecido (nunca confia cegamente no banco)
  const rolesValidos = ['MASTER', 'ADMIN', 'PODOLOGA'];
  if (!rolesValidos.includes(data.role)) {
    await sb.auth.signOut();
    showPage('auth');
    toast('Perfil inválido.', 'error');
    return null;
  }

  return data;
}


/* ── INICIALIZAÇÃO DE SESSÃO (chamada pelo config.js) ─────── */
async function initSession(session) {
  if (!session) { showPage('auth'); return; }

  currentUser = session.user;

  // Interceptador de Convites
  // O Supabase v2 costuma limpar as '#hash' de magic links da URL muito rápido
  // A verificação mais confiável é checar a ausência do metadata 'full_name' 
  // (presente em todos os cadastros normais, mas ausentes em convites)
  const hasName = !!currentUser.user_metadata?.full_name;
  
  if (!hasName) {
    document.getElementById('ob-name').value = '';
    document.getElementById('ob-password').value = '';
    showPage('auth');
    document.querySelector('.auth-tabs').style.display = 'none'; // esconde abas normais
    authTab('onboarding', null);
    return; // Para o fluxo aqui!
  } else {
    // Restaura as abas se foi um fluxo normal
    const tabs = document.querySelector('.auth-tabs');
    if (tabs) tabs.style.display = 'flex';
  }

  const profile = await fetchProfile(currentUser.id);
  if (!profile) return;

  currentRole = profile.role;
  const name  = profile.full_name
    || currentUser.user_metadata?.full_name
    || currentUser.email;

  // Redireciona conforme o role
  if (currentRole === 'MASTER' || currentRole === 'ADMIN') {
    document.getElementById('admin-user-chip').innerHTML = esc(name.split(' ')[0]) + ' ' + roleBadge(currentRole);
    document.getElementById('nav-settings-btn').style.display = (currentRole === 'MASTER') ? 'flex' : 'none';
    await loadAdminData();
    showPage('admin');
  } else {
    document.getElementById('podologa-user-chip').innerHTML = esc(name.split(' ')[0]) + ' ' + roleBadge(currentRole);
    document.getElementById('podologa-welcome').textContent = `Olá, ${name.split(' ')[0]}! 👋`;
    await loadPodologaData(profile.full_name);
    showPage('podologa');
  }

  subscribeRealtime();
  initScrollShadows();
}
