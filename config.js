/* ============================================================
   config.js — Configuração do Supabase e boot do sistema
   Responsabilidades:
   - Ler/salvar/limpar credenciais (sessionStorage)
   - Criar o cliente Supabase (sb)
   - Iniciar o listener de sessão (startApp)
   - Chamar initSession após login
============================================================ */


/* ── CREDENCIAIS (sessionStorage — não persiste após fechar aba) ── */

function getConfig() {
  return {
    url: sessionStorage.getItem('pc_url') || '',
    key: sessionStorage.getItem('pc_key') || '',
  };
}

function saveConfig(url, key) {
  sessionStorage.setItem('pc_url', url.trim());
  sessionStorage.setItem('pc_key', key.trim());
}

function clearConfig() {
  sessionStorage.removeItem('pc_url');
  sessionStorage.removeItem('pc_key');
}

function hasConfig() {
  const c = getConfig();
  return c.url.startsWith('https://') && c.key.length > 10;
}


/* ── CLIENTE SUPABASE ─────────────────────────────────────── */
let sb = null; // instância global, usada por todos os módulos

function initClient() {
  const { url, key } = getConfig();
  sb = supabase.createClient(url, key, {
    auth: {
      storage:          sessionStorage,
      persistSession:   true,
      autoRefreshToken: true,
    },
  });
}


/* ── TELA DE SETUP (primeira configuração) ────────────────── */

function saveAndConnect() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();

  if (!url.startsWith('https://')) { toast('URL inválida.', 'error'); return; }
  if (key.length < 20)             { toast('Chave inválida.', 'error'); return; }

  saveConfig(url, key);
  initClient();
  startApp();
}

function resetConfig() {
  if (sb) sb.auth.signOut().catch(() => {});
  clearConfig();
  currentUser = null;
  currentRole = null;
  sb = null;
  showPage('setup');
}


/* ── BOOT PRINCIPAL ───────────────────────────────────────── */

function startApp() {
  // Observa mudanças de sessão em tempo real
  sb.auth.onAuthStateChange((event, session) => {
    if      (event === 'SIGNED_IN')    initSession(session);
    else if (event === 'SIGNED_OUT')   { currentUser = null; currentRole = null; showPage('auth'); }
    else if (event === 'USER_UPDATED') initSession(session);
  });

  // Verifica se já existe sessão ativa (ex: recarregou a página)
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session) initSession(session);
    else         showPage('auth');
  });
}


/* ── INICIALIZAÇÃO AUTOMÁTICA ─────────────────────────────── */
// Executa ao carregar a página:
// - Se já tem credenciais salvas → conecta direto
// - Caso contrário → mostra tela de setup
(function boot() {
  if (hasConfig()) {
    initClient();
    startApp();
  } else {
    showPage('setup');
  }
})();
