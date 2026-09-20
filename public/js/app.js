/* Shell: routing, navigation, session */
const ROUTES = {
  dashboard: { mod: () => Dashboard, label: 'Dashboard', icon: '📊', group: 'Overview' },
  employees: { mod: () => Employees, label: 'Employees', icon: '👥', group: 'Records' },
  devices: { mod: () => Devices, label: 'Devices', icon: '💻', group: 'Records' },
  reports: { mod: () => Reports, label: 'Reports', icon: '📑', group: 'Analysis' },
  diagrams: { mod: () => Diagrams, label: 'Network Diagrams', icon: '🗺️', group: 'Analysis' },
  import: { mod: () => Importer, label: 'Import from Excel', icon: '📥', group: 'Data' },
  masters: { mod: () => Masters, label: 'Master Data', icon: '🏢', group: 'Data' },
  admin: { mod: () => Admin, label: 'Users & Activity', icon: '🔐', group: 'Data', adminOnly: true },
};

const App = {
  route: 'dashboard',
  params: {},

  async boot() {
    const { user } = await api('/session').catch(() => ({ user: null }));
    if (!user) return this.showLogin();
    State.user = user;
    await this.start();
  },

  showLogin() {
    State.user = null;
    $('#shell').classList.add('hidden');
    $('#login').classList.remove('hidden');
  },

  async start() {
    $('#login').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    $('#whoami').innerHTML = `<b>${esc(State.user.full_name || State.user.username)}</b><br>${esc(State.user.role === 'admin' ? 'Admin · full access' : 'Viewer · read only')}`;
    await this.loadMeta();
    this.buildNav();
    window.onhashchange = () => this.route_from_hash();
    this.route_from_hash();
  },

  async loadMeta() { State.meta = await api('/meta'); },

  buildNav() {
    const nav = $('#nav');
    nav.innerHTML = '';
    let group = null;
    Object.entries(ROUTES).forEach(([key, r]) => {
      if (r.adminOnly && !isAdmin()) return;
      if (r.group !== group) { group = r.group; nav.appendChild(el('div', { class: 'grp' }, group)); }
      const a = el('a', { href: '#/' + key, 'data-route': key }, `<span>${r.icon}</span> ${esc(r.label)}`);
      nav.appendChild(a);
    });
  },

  go(hash) { location.hash = hash; },

  route_from_hash() {
    const raw = (location.hash || '#/dashboard').slice(2);
    const [name, qs] = raw.split('?');
    this.route = ROUTES[name] ? name : 'dashboard';
    this.params = Object.fromEntries(new URLSearchParams(qs || ''));
    this.render();
  },

  async render() {
    const r = ROUTES[this.route];
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === this.route));
    $('#page-title').textContent = r.label;
    $('#topbar-actions').innerHTML = '';
    $('.sidebar').classList.remove('open');
    const view = $('#view');
    view.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    try { await r.mod().render(view, this.params); }
    catch (e) { view.innerHTML = `<div class="card"><div class="card-b" style="color:var(--bad)">${esc(e.message)}</div></div>`; }
  },
};

/* login form */
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  $('#login-err').textContent = '';
  try {
    const { user } = await api('/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } });
    State.user = user;
    f.reset();
    await App.start();
  } catch (err) { $('#login-err').textContent = err.message; }
};
$('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); location.hash = '#/dashboard'; App.showLogin(); };
$('#menu-toggle').onclick = () => $('.sidebar').classList.toggle('open');

App.boot();
