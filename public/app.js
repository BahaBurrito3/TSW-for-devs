/* ============================================================
   Roball — FotMob-style frontend for Roblox football leagues.
   Public read-only views; admin actions are delegated to
   admin.js and hidden for visitors.
   ============================================================ */
const API = window.__HATCHABLE__.api;
const $content = document.getElementById('content');
const $topNav = document.getElementById('topNav');
const $tabBar = document.getElementById('tabBar');
const $modalRoot = document.getElementById('modalRoot');
const $searchRoot = document.getElementById('searchRoot');
const $toastRoot = document.getElementById('toastRoot');

/* ---------- Core helpers ---------- */
async function api(path, method, body) {
  const res = await fetch(API + path, {
    method: method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
  return data;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt1(n) { return n === null || n === undefined ? '—' : Number(n).toFixed(1); }
function initials(name) {
  return String(name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function crest(url, name, size) {
  size = size || 22;
  if (url) return `<img class="crest" style="width:${size}px;height:${size}px" src="${esc(url)}" alt="" loading="lazy">`;
  return `<span class="crest placeholder" style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size * 0.4))}px">${esc(initials(name))}</span>`;
}
function avatar(url, name, size) {
  size = size || 24;
  if (url) return `<img class="avatar" style="width:${size}px;height:${size}px" src="${esc(url)}" alt="" loading="lazy">`;
  return `<span class="avatar placeholder" style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size * 0.38))}px">${esc(initials(name))}</span>`;
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return esc(String(ts).slice(0, 10));
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return esc(ts);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return fmtDate(ts);
}
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  $toastRoot.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
function closeModal() { $modalRoot.innerHTML = ''; }
function openModal(html, wide) {
  $modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal>
    <div class="modal" style="${wide ? 'max-width:640px' : ''}">${html}</div>
  </div>`;
  $modalRoot.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close-modal')) closeModal();
  });
}
function confirmModal(title, sub, confirmLabel, onConfirm, danger) {
  openModal(`
    <h3>${esc(title)}</h3>
    <p class="modal-sub">${sub}</p>
    <div class="field"><label>Type ${esc(confirmLabel.toUpperCase())} to confirm</label><input id="confirmWord" autocomplete="off"></div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" data-close-modal>Cancel</button>
      <button type="button" class="btn ${danger ? 'danger' : 'primary'}" id="confirmBtn" disabled>${esc(confirmLabel)}</button>
    </div>
  `);
  const word = document.getElementById('confirmWord');
  const btn = document.getElementById('confirmBtn');
  word.addEventListener('input', () => { btn.disabled = word.value.trim().toUpperCase() !== confirmLabel.toUpperCase(); });
  btn.addEventListener('click', async () => {
    try { await onConfirm(word.value.trim()); } catch (err) { toast(err.message, 'error'); }
  });
}
function emptyState(title, sub) {
  return `<div class="card"><div class="empty"><h3>${esc(title)}</h3><p>${esc(sub || '')}</p></div></div>`;
}
function groupBy(arr, key) {
  const out = [];
  const idx = {};
  arr.forEach(x => {
    const k = x[key];
    if (!idx[k]) { idx[k] = { key: k, items: [] }; out.push(idx[k]); }
    idx[k].items.push(x);
  });
  return out;
}

/* ---------- Country flags (typographic, no emoji) ---------- */
const COUNTRY_CODES = {
  england: 'ENG', scotland: 'SCO', wales: 'WAL', ireland: 'IRE', uk: 'GBR', usa: 'USA',
  france: 'FRA', germany: 'GER', spain: 'ESP', italy: 'ITA', portugal: 'POR', netherlands: 'NED', belgium: 'BEL',
  brazil: 'BRA', argentina: 'ARG', colombia: 'COL', uruguay: 'URU', mexico: 'MEX', chile: 'CHI', peru: 'PER',
  nigeria: 'NGA', ghana: 'GHA', senegal: 'SEN', morocco: 'MAR', algeria: 'ALG', egypt: 'EGY', 'south africa': 'RSA',
  japan: 'JPN', 'south korea': 'KOR', china: 'CHN', india: 'IND', australia: 'AUS', 'new zealand': 'NZL',
  sweden: 'SWE', norway: 'NOR', denmark: 'DEN', finland: 'FIN', poland: 'POL', ukraine: 'UKR', turkey: 'TUR',
  greece: 'GRE', croatia: 'CRO', serbia: 'SRB', switzerland: 'SUI', austria: 'AUT', 'czech republic': 'CZE',
  canada: 'CAN', jamaica: 'JAM', 'costa rica': 'CRC', ecuador: 'ECU', 'saudi arabia': 'KSA', qatar: 'QAT', uae: 'UAE',
  iran: 'IRN', russia: 'RUS', romania: 'ROU', hungary: 'HUN', iceland: 'ISL', cameroon: 'CMR', 'ivory coast': 'CIV',
  mali: 'MLI', tunisia: 'TUN', kenya: 'KEN', tanzania: 'TAN', uganda: 'UGA', zambia: 'ZAM', zimbabwe: 'ZIM'
};
function flagCode(country) {
  if (!country) return '';
  const c = String(country).toLowerCase();
  if (COUNTRY_CODES[c]) return COUNTRY_CODES[c];
  const exact = Object.keys(COUNTRY_CODES).find(k => c.startsWith(k) || k.startsWith(c));
  return exact ? COUNTRY_CODES[exact] : String(country).slice(0, 3).toUpperCase();
}
function flagChip(country) {
  const code = flagCode(country);
  return code ? `<span class="badge faint flag-chip">${code}</span>` : '';
}

const POSITIONS = ['GK', 'RB', 'CB', 'LB', 'CM', 'ST'];
const POS_LABEL = { GK: 'Goalkeeper', RB: 'Right Back', CB: 'Centre Back', LB: 'Left Back', CM: 'Centre Mid', ST: 'Striker' };

/* ---------- Favorites (localStorage) ---------- */
const FAV_KEY = 'roball.favorites';
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{"teams":[],"competitions":[]}'); }
  catch (e) { return { teams: [], competitions: [] }; }
}
function saveFavs(f) { localStorage.setItem(FAV_KEY, JSON.stringify(f)); }
function isFav(kind, id) {
  const f = getFavs();
  return (f[kind === 'team' ? 'teams' : 'competitions'] || []).some(x => String(x.id) === String(id));
}
function toggleFav(kind, id, name) {
  const f = getFavs();
  const key = kind === 'team' ? 'teams' : 'competitions';
  const list = f[key] || [];
  const i = list.findIndex(x => String(x.id) === String(id));
  if (i >= 0) { list.splice(i, 1); toast('Removed from favorites'); }
  else { list.push({ id, name }); toast('Added to favorites', 'ok'); }
  f[key] = list;
  saveFavs(f);
  return list;
}
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/></svg>';
function starBtn(kind, id, name) {
  return `<button class="fav-btn ${isFav(kind, id) ? 'active' : ''}" data-fav="${kind}" data-id="${id}" data-name="${esc(name)}" aria-label="Favorite">${STAR_SVG}</button>`;
}

/* ---------- Nav ---------- */
const NAV_ITEMS = [
  { href: '#/', label: 'Scores', match: (h) => h === '#/' || h === '' || h.startsWith('#/match/') },
  { href: '#/leagues', label: 'Leagues', match: (h) => h.startsWith('#/leagues') || h.startsWith('#/league/') },
  { href: '#/clubs', label: 'Clubs', match: (h) => h.startsWith('#/clubs') || h.startsWith('#/team/') },
  { href: '#/players', label: 'Players', match: (h) => h.startsWith('#/players') || h.startsWith('#/player/') },
  { href: '#/builder', label: 'Team Builder', match: (h) => h.startsWith('#/builder') },
  { href: '#/competitions', label: 'Competitions', match: (h) => h.startsWith('#/competitions') || h.startsWith('#/cup/') },
  { href: '#/news', label: 'News', match: (h) => h.startsWith('#/news') },
  { href: '#/transfers', label: 'Transfers', match: (h) => h.startsWith('#/transfers') },
  { href: '#/favorites', label: 'Favorites', match: (h) => h.startsWith('#/favorites') },
  { href: '#/more', label: 'More', match: (h) => h.startsWith('#/more') }
];
const TAB_ITEMS = [
  { href: '#/', label: 'Scores', match: (h) => h === '#/' || h === '' || h.startsWith('#/match/') },
  { href: '#/leagues', label: 'Leagues', match: (h) => h.startsWith('#/leagues') || h.startsWith('#/league/') },
  { href: '#/news', label: 'News', match: (h) => h.startsWith('#/news') },
  { href: '#/favorites', label: 'Favorites', match: (h) => h.startsWith('#/favorites') },
  { href: '#/more', label: 'More', match: (h) => h.startsWith('#/more') }
];
function renderNav() {
  const h = location.hash || '#/';
  $topNav.innerHTML = NAV_ITEMS.map(i => `<a class="nav-link ${i.match(h) ? 'active' : ''}" href="${i.href}">${i.label}</a>`).join('');
  $tabBar.innerHTML = TAB_ITEMS.map(i => `<a class="tab-link ${i.match(h) ? 'active' : ''}" href="${i.href}"><span class="tab-ic">${i.label === 'Scores' ? '▦' : i.label === 'Leagues' ? '▤' : i.label === 'News' ? '▣' : i.label === 'Favorites' ? '★' : '•••'}</span>${i.label}</a>`).join('');
}

/* ---------- Router ---------- */
async function route() {
  renderNav();
  const parts = (location.hash || '#/').replace(/^#\//, '').split('/').filter(Boolean);
  document.title = 'Roball — Roblox Football Leagues';
  try {
    if (parts.length === 0) return viewScores();
    if (parts[0] === 'leagues') return viewLeagues();
    if (parts[0] === 'clubs' && window.viewClubs) return window.viewClubs();
    if (parts[0] === 'players' && window.viewPlayers) return window.viewPlayers();
    if (parts[0] === 'builder' && window.viewTeamBuilder) return window.viewTeamBuilder(parts[1]);
    if (parts[0] === 'competitions' && window.viewCompetitions) return window.viewCompetitions();
    if (parts[0] === 'league' && parts[1]) return viewLeague(parts[1], parts[2]);
    if (parts[0] === 'cup' && parts[1]) return viewCup(parts[1]);
    if (parts[0] === 'match' && parts[1]) return viewMatch(parts[1]);
    if (parts[0] === 'team' && parts[1]) return viewTeam(parts[1], parts[2]);
    if (parts[0] === 'player' && parts[1]) return viewPlayer(parts[1], parts[2]);
    if (parts[0] === 'news' && window.renderNews) return window.renderNews();
    if (parts[0] === 'transfers') return viewTransfers();
    if (parts[0] === 'favorites') return viewFavorites();
    if (parts[0] === 'more') return viewMore();
    if (parts[0] === 'control' && window.viewControl) return window.viewControl();
    $content.innerHTML = emptyState('Page not found', 'That page does not exist.');
  } catch (err) {
    $content.innerHTML = emptyState('Something went wrong', err.message);
  }
}
window.addEventListener('hashchange', route);

/* ---------- Match row helpers ---------- */
function statusChip(m) {
  if (m.status === 'live') return `<span class="chip live"><span class="pulse"></span>LIVE</span>`;
  if (m.status === 'played') return `<span class="chip ft">FT</span>`;
  return `<span class="match-time">${fmtTime(m.played_at) || fmtDate(m.played_at) || 'TBD'}</span>`;
}
function scoreOr(m) {
  if (m.status === 'played') return `<span class="match-score">${m.home_score} - ${m.away_score}</span>`;
  if (m.status === 'live') return `<span class="match-score" style="color:var(--green)">${m.home_score ?? '–'} - ${m.away_score ?? '–'}</span>`;
  return `<span class="match-score vs">vs</span>`;
}
function matchRow(m) {
  return `<a class="match-row" href="#/match/${m.id}">
    <div class="match-side">${crest(m.home_crest_url, m.home_team_name, 22)}<span class="m-name">${esc(m.home_team_name)}</span></div>
    <div class="match-center">${scoreOr(m)}${statusChip(m)}</div>
    <div class="match-side right">${crest(m.away_crest_url, m.away_team_name, 22)}<span class="m-name">${esc(m.away_team_name)}</span></div>
  </a>`;
}

/* ---------- Scores (home) ---------- */
async function viewScores() {
  $content.innerHTML = '<div class="empty">Loading scores…</div>';
  const [dash, matches] = await Promise.all([api('/dashboard').catch(() => null), api('/matches/list').catch(() => [])]);
  const live = matches.filter(m => m.status === 'live');
  const groups = groupBy(matches, 'league_id');
  const order = { live: 0, played: 1, pending: 2 };
  groups.forEach(g => g.items.sort((a, b) => (order[a.status] - order[b.status]) || (b.played_at || '').localeCompare(a.played_at || '') || a.id - b.id));
  groups.sort((a, b) => ((a.items[0] && a.items[0].division_code) || '').localeCompare((b.items[0] && b.items[0].division_code) || ''));

  $content.innerHTML = `
    ${dash ? `
    <div class="stat-strip">
      <div class="stat-cell"><div class="stat-num">${dash.active_leagues}</div><div class="stat-lbl">Divisions</div></div>
      <div class="stat-cell"><div class="stat-num">${dash.matches_played}</div><div class="stat-lbl">Played</div></div>
      <div class="stat-cell"><div class="stat-num" style="color:var(--green)">${live.length}</div><div class="stat-lbl">Live now</div></div>
    </div>` : ''}

    ${live.length ? `
    <div class="card" style="padding:0;border-color:rgba(5,192,138,0.35)">
      <div style="padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center">
        <b style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--green)">Live now</b>
      </div>
      ${live.map(matchRow).join('')}
    </div>` : ''}

    ${groups.length ? groups.map(g => `
      <div class="card" style="padding:0">
        <div style="padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:9px">
          <b style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-2)">${esc(g.items[0].league_name)}</b>
          <a class="btn sm" style="margin-left:auto" href="#/league/${g.key}">Open</a>
        </div>
        ${g.items.map(matchRow).join('')}
      </div>`).join('') : emptyState('No matches yet', 'Start a season and add fixtures from the Control Center.')}
  `;
}

/* ---------- Leagues ---------- */
async function viewLeagues() {
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const [ov, all] = await Promise.all([api('/pts/overview').catch(() => ({ active: null, leagues: [], competitions: [] })), api('/leagues/list').catch(() => [])]);
  const divisions = ov.active ? ov.leagues : [];
  const cups = ov.active ? ov.competitions.filter(c => c.format !== 'league') : [];
  const other = all.filter(l => !l.season_id);

  const compRow = (c, label, countLabel) => `
    <div class="match-row" style="grid-template-columns:auto 1fr auto;gap:12px">
      <span class="badge ${c.division_code ? 'solid' : ''}">${esc(c.division_code || c.code || label)}</span>
      <a href="#/league/${c.id}" class="m-name" style="font-weight:700">${esc(c.name)}</a>
      <div style="display:flex;align-items:center;gap:11px">
        <span class="subtle tnum">${countLabel}</span>
        ${starBtn('competition', c.id, c.name)}
      </div>
    </div>`;

  $content.innerHTML = `
    <div class="card" style="padding:0">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><h3 style="margin:0">Divisions${ov.active ? ' · ' + esc(ov.active.name) : ''}</h3></div>
      ${divisions.length ? divisions.map(l => compRow(l, 'DIV', (l.team_count || 0) + ' clubs')).join('') : '<div class="empty"><h3>No divisions yet</h3><p>Start a season from the Control Center.</p></div>'}
    </div>
    <div class="card" style="padding:0">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center"><h3 style="margin:0">Cups</h3><button class="btn sm primary admin-only" style="margin-left:auto" data-action="new-cup">+ Cup</button></div>
      ${cups.length ? cups.map(c => `
        <div class="match-row" style="grid-template-columns:auto 1fr auto;gap:12px">
          <span class="badge">${c.format === 'two_leg' ? '2L' : 'KO'}</span>
          <a href="#/cup/${c.id}" class="m-name" style="font-weight:700">${esc(c.name)}</a>
          <div style="display:flex;align-items:center;gap:11px">
            <span class="subtle tnum">${c.entry_count || 0} clubs</span>
            ${starBtn('competition', c.id, c.name)}
          </div>
        </div>`).join('') : '<div class="empty"><h3>No cups this season</h3></div>'}
    </div>
    ${other.length ? `
    <div class="card" style="padding:0">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><h3 style="margin:0">Other leagues</h3></div>
      ${other.map(l => compRow(l, 'LG', (l.team_count || 0) + ' clubs')).join('')}
    </div>` : ''}
  `;
}

/* ---------- League / competition page ---------- */
async function viewLeague(id, tab) {
  tab = tab || 'table';
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const [stand, matches, board, ratings] = await Promise.all([
    api('/standings/get?league_id=' + id).catch(() => null),
    api('/matches/list?league_id=' + id).catch(() => []),
    api('/leaderboard/scorers?league_id=' + id).catch(() => null),
    api('/leaderboard/ratings?league_id=' + id + '&min_apps=1').catch(() => [])
  ]);
  const league = stand ? stand.league : (matches[0] ? { id, name: matches[0].league_name, season: '' } : null);
  if (!league) { $content.innerHTML = emptyState('Competition not found', ''); return; }

  const TABS = [['table', 'Table'], ['fixtures', 'Fixtures'], ['results', 'Results'], ['stats', 'Stats'], ['totw', 'TOTW']];
  $content.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:19px;font-weight:900">${esc(league.name)}</div>
          <div class="subtle">${esc(league.season || '')}${league.abbreviation ? ' · ' + esc(league.abbreviation) : ''}${league.format ? ' · ' + esc(league.format.replace(/_/g, ' ')) : ''}</div>
        </div>
        ${starBtn('competition', league.id, league.name)}
        <button class="btn sm admin-only" data-action="add-club" data-id="${league.id}">+ Club</button>
        <button class="btn sm primary admin-only" data-action="new-match" data-id="${league.id}">+ Match</button>
      </div>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<div class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</div>`).join('')}</div>
    <div id="leagueBody"></div>
  `;
  $content.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => {
    location.hash = `#/league/${id}/${el.dataset.tab}`;
  }));
  const body = document.getElementById('leagueBody');
  if (tab === 'table') return renderStandings(body, stand);
  if (tab === 'fixtures') return renderFixtures(body, matches, 'pending');
  if (tab === 'results') return renderFixtures(body, matches, 'played');
  if (tab === 'stats') return renderLeagueStats(body, board, ratings);
  if (tab === 'totw') return renderTOTW(body, id, matches);
}

function renderStandings(body, stand) {
  if (!stand) { body.innerHTML = emptyState('No table yet', 'This competition has no standings.'); return; }
  const cols = [
    ['position', '#'], ['name', 'Club'], ['played', 'P'], ['won', 'W'], ['drawn', 'D'], ['lost', 'L'],
    ['gf', 'GF'], ['ga', 'GA'], ['gd', 'GD'], ['pts', 'Pts'], ['form', 'Form']
  ];
  let sortKey = 'position', sortDir = 1;
  function draw() {
    const rows = [...stand.table];
    if (sortKey !== 'position') {
      rows.sort((a, b) => { const av = a[sortKey], bv = b[sortKey]; return typeof av === 'string' ? av.localeCompare(bv) * sortDir : (av - bv) * sortDir; });
    }
    const cfg = stand.league.division_config || {};
    const promo = Number(cfg.promotion?.automatic ?? cfg.promotion?.auto_places ?? stand.league.promotion_spots ?? 0);
    const rel = Number(cfg.relegation?.automatic ?? cfg.relegation?.auto_places ?? stand.league.relegation_spots ?? 0);
    const note = `Champion${promo ? ` · top ${promo} promotion place${promo === 1 ? '' : 's'}` : ''}${rel ? ` · bottom ${rel} relegation place${rel === 1 ? '' : 's'}` : ''}`;
    body.innerHTML = `
      <div class="card">
        <div class="table-wrap"><table class="standings-table">
          <thead><tr>${cols.map(([k, l]) => `<th class="${['position','played','won','drawn','lost','gf','ga','gd','pts'].includes(k) ? 'num' : ''} ${k !== 'name' ? 'sortable' : ''}" data-key="${k}">${l}${sortKey === k ? (sortDir === 1 ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead>
          <tbody>${rows.length ? rows.map(t => `
            <tr class="${t.zone ? 'zone-' + t.zone : ''}">
              <td class="pos num">${t.position}</td>
              <td><div class="team-cell"><a href="#/team/${t.team_id}" style="display:flex;align-items:center;gap:8px">${crest(t.crest_url, t.name, 20)} <span>${esc(t.name)}</span></a></div></td>
              <td class="num">${t.played}</td><td class="num">${t.won}</td><td class="num">${t.drawn}</td><td class="num">${t.lost}</td>
              <td class="num">${t.gf}</td><td class="num">${t.ga}</td><td class="num">${t.gd > 0 ? '+' : ''}${t.gd}</td>
              <td class="num"><strong>${t.pts}</strong></td>
              <td class="num"><div class="form-dots">${t.last5.length ? t.last5.map(r => `<span class="dot ${r.toLowerCase()}">${r}</span>`).join('') : '<span class="subtle">—</span>'}</div></td>
            </tr>`).join('') : `<tr><td colspan="${cols.length}" class="center"><div class="empty"><h3>No clubs yet</h3></div></td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="subtle" style="margin-top:10px">${esc(note)} · click a column to sort</div>
    `;
    body.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
      draw();
    }));
  }
  draw();
}

function renderFixtures(body, matches, status) {
  const list = matches.filter(m => status === 'played' ? m.status === 'played' : m.status !== 'played');
  const weeks = groupBy(list, 'matchweek').sort((a, b) => a.key - b.key);
  body.innerHTML = weeks.length ? weeks.map(w => `
    <div class="card" style="padding:0">
      <div style="padding:11px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between">
        <b style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-2)">Matchweek ${w.key}</b>
        <span class="subtle tnum">${w.items.filter(m => m.status === 'played').length}/${w.items.length} played</span>
      </div>
      ${w.items.map(matchRow).join('')}
    </div>`).join('') : emptyState(status === 'played' ? 'No results yet' : 'No fixtures yet', status === 'played' ? 'Played matches will appear here.' : 'Generate fixtures from the Control Center.');
}

function renderLeagueStats(body, board, ratings) {
  const rankList = (list, key, sub) => list.length ? `<ul class="rank-list">${list.map((p, i) => `
    <li><span class="rank">${i + 1}</span>${avatar(p.avatar_url, p.name, 24)}<div class="r-body"><div class="r-name"><a href="#/player/${p.player_id}">${esc(p.name)}</a></div><div class="r-sub">${esc(p[sub])}</div></div><span class="r-val">${p[key]}</span></li>`).join('')}</ul>` : '<div class="empty"><h3>Nothing yet</h3></div>';
  body.innerHTML = `
    <div class="grid cols-2">
      <div class="card"><h3>Top scorers</h3>${board ? rankList(board.top_scorers, 'goals', 'team_name') : ''}</div>
      <div class="card"><h3>Top assists</h3>${board ? rankList(board.top_assists, 'assists', 'team_name') : ''}</div>
    </div>
    <div class="card section-block">
      <h3>Player ratings</h3>
      ${ratings.length ? renderTable(
        ['Player', 'Club', 'Pos', 'Apps', 'Avg', 'Last 5', 'G', 'A'],
        ratings.map(p => [
          `<a href="#/player/${p.player_id}" style="display:flex;align-items:center;gap:8px;font-weight:700">${avatar(p.avatar_url, p.name, 22)} ${esc(p.name)}</a>`,
          esc(p.team_name), `<span class="badge pos">${p.position}</span>`, p.apps,
          `<strong>${fmt1(p.avg_rating)}</strong>`, fmt1(p.avg_last5), p.goals, p.assists
        ])
      ) : '<div class="empty"><h3>No ratings yet</h3><p>Rate players after matches.</p></div>'}
    </div>
  `;
}

/* ---------- Team of the Week ---------- */
const TOTW_FORMATION = [
  [['GK', 0]],
  [['RB', 0], ['CB', 0], ['LB', 0]],
  [['CM', 0]],
  [['ST', 0], ['ST', 1]]
];

async function renderTOTW(body, leagueId, matches) {
  body.innerHTML = '<div class="empty">Loading…</div>';
  const playedWeeks = matches.filter(m => m.status === 'played' && m.matchweek).map(m => Number(m.matchweek));
  const week = playedWeeks.length ? Math.max(...playedWeeks) : null;
  if (!week) { body.innerHTML = emptyState('No matchweek yet', 'Play and rate a match, then generate the Team of the Week.'); return; }

  async function draw() {
    const picks = await api('/totw/get?league_id=' + leagueId + '&matchweek=' + week).catch(() => []);
    const byKey = {};
    picks.forEach(p => { byKey[p.position_code + ':' + (p.slot_index || 0)] = p; });
    const slot = (pos, idx) => {
      const p = byKey[pos + ':' + idx];
      return `<div class="totw-slot ${p ? '' : 'empty'} ${window.ADMIN ? 'editable' : ''}" data-pos="${pos}" data-slot="${idx}">
        ${p ? `<div class="rating">${Number(p.match_rating).toFixed(1)}</div><div class="pname">${esc(p.player_name)}</div><div class="pteam">${esc(p.team_name)}</div>` : '<div class="pname">—</div><div class="pteam">Empty</div>'}
      </div>`;
    };
    const published = picks.some(p => p.status === 'published');
    body.innerHTML = `
      <div class="card">
        <div class="section-head">
          <h3>Team of the Week — Matchweek ${week}</h3>
          <div class="admin-only" style="display:flex;gap:6px">
            <button class="btn sm" id="totwGen">Generate</button>
            <button class="btn sm primary" id="totwPub">Publish</button>
          </div>
        </div>
        <div class="pitch">${TOTW_FORMATION.map(row => `<div class="pitch-row">${row.map(([pos, idx]) => slot(pos, idx)).join('')}</div>`).join('')}</div>
        <div class="subtle" style="margin-top:10px">${picks.length ? (published ? 'Published · visible on league pages' : 'Pending approval — publish when ready') : 'Not generated yet — click Generate to auto-pick the top-rated players.'}</div>
      </div>`;
    const gen = document.getElementById('totwGen');
    const pub = document.getElementById('totwPub');
    if (gen) gen.addEventListener('click', async () => {
      try { await api('/totw/generate', 'POST', { league_id: Number(leagueId), matchweek: week, force: true }); toast('Team of the Week generated', 'ok'); draw(); }
      catch (x) { toast(x.message, 'error'); }
    });
    if (pub) pub.addEventListener('click', async () => {
      try { await api('/totw/publish', 'POST', { league_id: Number(leagueId), matchweek: week }); toast('Team of the Week published', 'ok'); draw(); }
      catch (x) { toast(x.message, 'error'); }
    });
    if (window.ADMIN) body.querySelectorAll('.totw-slot.editable').forEach(el => {
      el.style.cursor = 'pointer';
      el.title = 'Click to change this pick';
      el.addEventListener('click', () => openTotwOverride(leagueId, week, el.dataset.pos, el.dataset.slot, draw));
    });
  }
  draw();
}

async function openTotwOverride(leagueId, week, pos, slotIndex, redraw) {
  const players = await api('/players/list').catch(() => []);
  const pool = players.filter(p => p.position === pos);
  if (!pool.length) return toast('No ' + pos + ' players in the database', 'error');
  openModal(`
    <h3>Change ${pos} pick</h3>
    <form id="ovrForm">
      <div class="field"><label>Player</label>
        <select name="player_id" required><option value="">Choose…</option>${pool.map(p => `<option value="${p.id}">${esc(p.name)} (${p.team_name ? esc(p.team_name) : 'Free agent'})</option>`).join('')}</select>
      </div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Save pick</button></div>
    </form>
  `);
  document.getElementById('ovrForm').onsubmit = async (e) => {
    e.preventDefault();
    const pid = new FormData(e.target).get('player_id');
    try {
      await api('/totw/override', 'POST', { league_id: Number(leagueId), matchweek: week, position_code: pos, slot_index: Number(slotIndex), player_id: Number(pid) });
      closeModal(); toast('Pick updated', 'ok'); redraw();
    } catch (x) { toast(x.message, 'error'); }
  };
}

/* ---------- Cup bracket ---------- */
async function viewCup(id) {
  $content.innerHTML = '<div class="empty">Loading bracket…</div>';
  const data = await api('/cups/ties?competition_id=' + id).catch(() => null);
  if (!data) { $content.innerHTML = emptyState('Cup not found', ''); return; }
  const cup = data.competition, rounds = data.rounds || [];
  $content.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:19px;font-weight:900">${esc(cup.name)}</div>
          <div class="subtle">${cup.format === 'two_leg' ? 'Two-leg knockout' : 'Single-elimination'} · ${esc(cup.status)}</div>
        </div>
        ${starBtn('competition', cup.id, cup.name)}
        <button class="btn sm admin-only" data-action="cup-entries" data-id="${cup.id}" data-name="${esc(cup.name)}">Entries</button>
        <button class="btn sm primary admin-only" data-action="cup-draw" data-id="${cup.id}" data-name="${esc(cup.name)}">Draw round</button>
        <button class="btn sm danger admin-only" data-action="cup-remove" data-id="${cup.id}" data-name="${esc(cup.name)}">Remove</button>
      </div>
    </div>
    ${rounds.length ? `<div class="bracket">${rounds.map(r => `
      <div class="bracket-col">
        <div style="padding:9px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2)">${esc(r.round_name)}</div>
        ${r.ties.map(tieCard).join('')}
      </div>`).join('')}</div>` : emptyState('No draw yet', 'Enter clubs then draw the first round.')}
  `;
}

function tieCard(t) {
  const homeWin = t.winner_team_id && String(t.winner_team_id) === String(t.home_team_id);
  const awayWin = t.winner_team_id && String(t.winner_team_id) === String(t.away_team_id);
  const row = (team, name, score, win) => `
    <div class="tie-row ${win ? 'win' : (t.status === 'played' ? 'lose' : '')}">
      ${crest(team ? (team === t.home_team_id ? t.home_crest_url : t.away_crest_url) : null, name, 18)}
      <span class="t-name">${esc(name || 'TBD')}</span>
      <span class="t-score">${score ?? ''}</span>
    </div>`;
  return `<div class="tie-card">
    ${row(t.home_team_id, t.home_team_name, t.home_score, homeWin)}
    ${row(t.away_team_id, t.away_team_name, t.away_score, awayWin)}
    <div class="tie-foot">
      <span class="subtle">${t.leg_number === 2 ? 'Leg 2' : t.leg_number === 1 ? 'Leg 1' : ''}</span>
      <button class="btn sm admin-only" data-action="cup-result" data-id="${t.id}" ${t.home_team_id && t.away_team_id ? '' : 'disabled'}>Result</button>
    </div>
  </div>`;
}

/* ---------- Match page ---------- */
async function viewMatch(id) {
  $content.innerHTML = '<div class="empty">Loading match…</div>';
  const data = await api('/matches/get?match_id=' + id).catch(() => null);
  if (!data) { $content.innerHTML = emptyState('Match not found', ''); return; }
  const m = data.match;
  const events = data.events || [];
  const TABS = [['overview', 'Overview'], ['lineups', 'Lineups'], ['stats', 'Stats'], ['h2h', 'H2H'], ['table', 'Table']];
  $content.innerHTML = `
    <div class="card">
      <div class="subtle" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px">${esc(m.league_name)}${m.matchweek ? ' · MW' + m.matchweek : ''}</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:12px">
        <div class="match-side"><span class="m-name" style="font-size:16px">${esc(m.home_team_name)}</span></div>
        <div class="match-center">
          ${m.status === 'played' ? `<span class="match-score" style="font-size:30px">${m.home_score} - ${m.away_score}</span>` : m.status === 'live' ? `<span class="match-score" style="font-size:30px;color:var(--green)">${m.home_score ?? '–'} - ${m.away_score ?? '–'}</span>` : `<span class="match-score vs" style="font-size:22px">vs</span>`}
          ${m.status === 'live' ? '<span class="chip live"><span class="pulse"></span>LIVE</span>' : m.status === 'played' ? '<span class="chip ft">FT</span>' : `<span class="match-time">${fmtDate(m.played_at) || 'Scheduled'}</span>`}
        </div>
        <div class="match-side right"><span class="m-name" style="font-size:16px">${esc(m.away_team_name)}</span></div>
      </div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:12px">
        <button class="btn sm admin-only" data-action="live-match" data-id="${m.id}">Set live</button>
        <button class="btn sm primary admin-only" data-action="edit-match" data-id="${m.id}">${m.status === 'played' ? 'Edit result' : 'Enter result'}</button>
        ${m.status === 'played' ? `<button class="btn sm admin-only" data-action="rate-match" data-id="${m.id}">Rate players</button>` : ''}
      </div>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<div class="tab ${k === 'overview' ? 'active' : ''}" data-tab="${k}">${l}</div>`).join('')}</div>
    <div id="matchBody"></div>
  `;
  $content.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => {
    $content.querySelectorAll('#matchBody').length && renderMatchTab(el.dataset.tab);
    $content.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  }));
  renderMatchTab('overview');

  function renderMatchTab(tab) {
    const body = document.getElementById('matchBody');
    if (tab === 'overview') return renderOverview(body);
    if (tab === 'lineups') return renderLineups(body);
    if (tab === 'stats') return renderMatchStats(body);
    if (tab === 'h2h') return renderH2H(body);
    if (tab === 'table') return renderMatchTable(body);
  }

  function renderOverview(body) {
    const homeEvents = events.filter(e => String(e.team_id) === String(m.home_team_id));
    const awayEvents = events.filter(e => String(e.team_id) === String(m.away_team_id));
    const evList = (list) => {
      const scorers = list.filter(e => e.goals > 0);
      const assists = list.filter(e => e.assists > 0);
      const cards = list.filter(e => e.yellow_cards > 0 || e.red_cards > 0);
      const line = [];
      if (scorers.length) line.push(`<b>Goals:</b> ${scorers.map(e => `${esc(e.player_name)}${e.goals > 1 ? ' ×' + e.goals : ''}`).join(', ')}`);
      if (assists.length) line.push(`<b>Assists:</b> ${assists.map(e => `${esc(e.player_name)}${e.assists > 1 ? ' ×' + e.assists : ''}`).join(', ')}`);
      if (cards.length) line.push(`<b>Cards:</b> ${cards.map(e => `${esc(e.player_name)} ${e.red_cards ? '(R)' : '(Y)'}`).join(', ')}`);
      return line.length ? line.map(l => `<div class="subtle" style="margin-bottom:6px">${l}</div>`).join('') : '<div class="subtle">No events recorded yet.</div>';
    };
    body.innerHTML = `
      <div class="grid cols-2">
        <div class="card"><h3>${esc(m.home_team_name)}</h3>${evList(homeEvents)}</div>
        <div class="card"><h3>${esc(m.away_team_name)}</h3>${evList(awayEvents)}</div>
      </div>
      <div class="card section-block"><h3>Ratings</h3>${events.length ? renderTable(['Player', 'Team', 'Rating', 'G', 'A', 'Cards'], events.map(e => [
        `<a href="#/player/${e.player_id}" style="display:flex;align-items:center;gap:8px;font-weight:700">${avatar(e.avatar_url, e.player_name, 22)} ${esc(e.player_name)}</a>`,
        esc(e.team_name), `<strong>${fmt1(e.rating)}</strong>`, e.goals, e.assists,
        (e.red_cards ? e.red_cards + 'R' : '') + (e.yellow_cards ? (e.red_cards ? ' · ' : '') + e.yellow_cards + 'Y' : '') || '<span class="subtle">—</span>'
      ])) : '<div class="empty"><h3>No ratings yet</h3><p>Rate players after the match.</p></div>'}</div>
    `;
  }

  function renderLineups(body) {
    body.innerHTML = '<div class="empty">Loading lineups…</div>';
    Promise.all([api('/players/list?team_id=' + m.home_team_id), api('/players/list?team_id=' + m.away_team_id)])
      .then(([h, a]) => {
        const col = (list) => list.length ? list.map(p => `
          <a class="search-result" href="#/player/${p.id}">
            ${avatar(p.avatar_url, p.name, 28)}<span class="badge pos">${p.position}</span>
            <div style="flex:1;min-width:0"><div class="r-name">${esc(p.name)}</div><div class="r-sub">${esc(POS_LABEL[p.position] || '')}</div></div>
            <span class="tnum subtle">#${p.shirt_number ?? '—'}</span>
          </a>`).join('') : '<div class="empty"><h3>No players</h3></div>';
        body.innerHTML = `<div class="grid cols-2"><div class="card"><h3>${esc(m.home_team_name)}</h3>${col(h)}</div><div class="card"><h3>${esc(m.away_team_name)}</h3>${col(a)}</div></div>`;
      }).catch(e => { body.innerHTML = emptyState('Could not load lineups', e.message); });
  }

  function renderMatchStats(body) {
    const sum = (list, k) => list.reduce((s, e) => s + (e[k] || 0), 0);
    const home = events.filter(e => String(e.team_id) === String(m.home_team_id));
    const away = events.filter(e => String(e.team_id) === String(m.away_team_id));
    const row = (label, h, a) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <span class="tnum" style="font-weight:800;width:34px;text-align:center">${h}</span>
        <span style="flex:1;text-align:center;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${label}</span>
        <span class="tnum" style="font-weight:800;width:34px;text-align:center">${a}</span>
      </div>`;
    body.innerHTML = `<div class="card"><h3>Match stats</h3>
      ${row('Goals', m.home_score ?? '–', m.away_score ?? '–')}
      ${row('Rated players', home.length, away.length)}
      ${row('Assists', sum(home, 'assists'), sum(away, 'assists'))}
      ${row('Yellow cards', sum(home, 'yellow_cards'), sum(away, 'yellow_cards'))}
      ${row('Red cards', sum(home, 'red_cards'), sum(away, 'red_cards'))}
      ${row('Avg rating', home.length ? (sum(home, 'rating') / home.length).toFixed(1) : '–', away.length ? (sum(away, 'rating') / away.length).toFixed(1) : '–')}
    </div>`;
  }

  function renderH2H(body) {
    body.innerHTML = '<div class="empty">Loading…</div>';
    api('/matches/h2h?team_a=' + m.home_team_id + '&team_b=' + m.away_team_id)
      .then(list => {
        body.innerHTML = list.length ? `<div class="card" style="padding:0">${list.map(x => matchRow({ ...x, home_crest_url: null, away_crest_url: null })).join('')}</div>`
          : emptyState('No head-to-head yet', 'These clubs have not met before.');
      }).catch(e => { body.innerHTML = emptyState('Could not load H2H', e.message); });
  }

  function renderMatchTable(body) {
    body.innerHTML = '<div class="empty">Loading…</div>';
    api('/standings/get?league_id=' + m.league_id)
      .then(stand => renderStandings(body, stand))
      .catch(() => { body.innerHTML = emptyState('No table', ''); });
  }
}

/* ---------- Club page ---------- */
async function viewTeam(id, tab) {
  tab = tab || 'overview';
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const [teams, players, stats] = await Promise.all([
    api('/teams/list').catch(() => []),
    api('/players/list?team_id=' + id).catch(() => []),
    api('/teams/stats?team_id=' + id).catch(() => null)
  ]);
  const team = teams.find(t => String(t.id) === String(id));
  if (!team) { $content.innerHTML = emptyState('Club not found', ''); return; }
  const TABS = [['overview', 'Overview'], ['squad', 'Squad'], ['fixtures', 'Fixtures'], ['results', 'Results'], ['table', 'Table'], ['transfers', 'Transfers']];
  $content.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:14px">
        ${crest(team.crest_url, team.name, 52)}
        <div style="flex:1;min-width:0">
          <div style="font-size:20px;font-weight:900">${esc(team.name)}${team.short_name ? ` <span class="badge faint">${esc(team.short_name)}</span>` : ''}</div>
          <div class="subtle">${team.division_code ? esc(team.abbreviation || team.division_code) + ' · ' : ''}${team.manager ? 'Manager: ' + esc(team.manager) + ' · ' : ''}${players.length} players</div>
          <div style="display:flex;gap:6px;margin-top:7px">
            <span class="chip" style="cursor:default">Home <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${esc(team.home_color || '#05C08A')};vertical-align:-1px"></span></span>
            <span class="chip" style="cursor:default">Away <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${esc(team.away_color || '#0B0F14')};vertical-align:-1px"></span></span>
          </div>
        </div>
        ${starBtn('team', team.id, team.name)}
        <button class="btn sm admin-only" data-action="edit-club" data-id="${team.id}">Edit</button>
        <button class="btn sm admin-only" data-action="give-award" data-id="club" data-target="${team.id}">Award</button>
        <button class="btn sm danger admin-only" data-action="disband-club" data-id="${team.id}">Disband</button>
        <button class="btn sm primary admin-only" data-action="new-player" data-id="${team.id}">+ Player</button>
      </div>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<div class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</div>`).join('')}</div>
    <div id="teamBody"></div>
  `;
  $content.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => { location.hash = `#/team/${id}/${el.dataset.tab}`; }));
  const body = document.getElementById('teamBody');
  if (tab === 'overview') return renderTeamOverview(body, team, players, stats);
  if (tab === 'squad') return renderSquad(body, players);
  if (tab === 'fixtures') return renderTeamMatches(body, id, 'pending');
  if (tab === 'results') return renderTeamMatches(body, id, 'played');
  if (tab === 'table') return renderTeamTable(body, team);
  if (tab === 'transfers') return renderTeamTransfers(body, id);
}

function renderTeamOverview(body, team, players, stats) {
  const rec = (stats && stats.season) || { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
  body.innerHTML = `
    <div class="stat-strip">
      <div class="stat-cell"><div class="stat-num">${rec.played}</div><div class="stat-lbl">Played</div></div>
      <div class="stat-cell"><div class="stat-num">${rec.won}</div><div class="stat-lbl">Won</div></div>
      <div class="stat-cell"><div class="stat-num">${rec.drawn}</div><div class="stat-lbl">Drawn</div></div>
      <div class="stat-cell"><div class="stat-num">${rec.lost}</div><div class="stat-lbl">Lost</div></div>
      <div class="stat-cell"><div class="stat-num">${rec.gf}–${rec.ga}</div><div class="stat-lbl">Goals</div></div>
      <div class="stat-cell"><div class="stat-num">${rec.pts}</div><div class="stat-lbl">Points</div></div>
    </div>
    <div class="grid cols-2 section-block">
      <div class="card"><h3>Top scorers</h3>${stats && stats.top_scorers.length ? `<ul class="rank-list">${stats.top_scorers.map((p, i) => `<li><span class="rank">${i + 1}</span>${avatar(p.avatar_url, p.name, 24)}<div class="r-body"><div class="r-name"><a href="#/player/${p.player_id}">${esc(p.name)}</a></div></div><span class="r-val">${p.goals}</span></li>`).join('')}</ul>` : '<div class="empty"><h3>No goals yet</h3></div>'}</div>
      <div class="card"><h3>Top rated</h3>${stats && stats.top_rated.length ? `<ul class="rank-list">${stats.top_rated.map((p, i) => `<li><span class="rank">${i + 1}</span>${avatar(p.avatar_url, p.name, 24)}<div class="r-body"><div class="r-name"><a href="#/player/${p.player_id}">${esc(p.name)}</a></div></div><span class="r-val">${fmt1(p.avg_rating)}</span></li>`).join('')}</ul>` : '<div class="empty"><h3>No ratings yet</h3></div>'}</div>
    </div>
    <div class="card section-block">
      <h3>Club honors</h3>
      ${stats && stats.honors.length ? stats.honors.map(h => `<div class="honor">${h.icon_url ? `<img class="h-icon" src="${esc(h.icon_url)}" alt="">` : `<span class="h-icon placeholder">${esc(initials(h.name))}</span>`}<div><b>${esc(h.name)}</b><small>${esc(h.season_name || 'All-time')} · ${esc(h.awarded_at)}</small></div></div>`).join('') : '<div class="empty"><h3>No honors yet</h3></div>'}
    </div>
  `;
}

function renderSquad(body, players) {
  body.innerHTML = players.length ? `<div class="card">${renderTable(['#', 'Player', 'Pos', 'Country', ''], players.map(p => [
    p.shirt_number ?? '—',
    `<a href="#/player/${p.id}" style="display:flex;align-items:center;gap:8px;font-weight:700">${avatar(p.avatar_url, p.name, 24)} ${esc(p.name)}</a>`,
    `<span class="badge pos">${p.position}</span>`,
    p.country ? `${flagChip(p.country)} ${esc(p.country)}` : '<span class="subtle">—</span>',
    `<a class="btn sm" href="#/player/${p.id}">Profile</a>`
  ]))}</div>` : emptyState('No players yet', 'Add players to the squad.');
}

async function renderTeamMatches(body, teamId, status) {
  body.innerHTML = '<div class="empty">Loading…</div>';
  const matches = await api('/matches/list').catch(() => []);
  const list = matches.filter(m => String(m.home_team_id) === String(teamId) || String(m.away_team_id) === String(teamId))
    .filter(m => status === 'played' ? m.status === 'played' : m.status !== 'played')
    .sort((a, b) => (a.matchweek - b.matchweek) || (b.played_at || '').localeCompare(a.played_at || ''));
  body.innerHTML = list.length ? `<div class="card" style="padding:0">${list.map(matchRow).join('')}</div>` : emptyState(status === 'played' ? 'No results yet' : 'No fixtures yet', '');
}

function renderTeamTable(body, team) {
  body.innerHTML = '<div class="empty">Loading…</div>';
  if (!team.league_id) { body.innerHTML = emptyState('Not in a division', 'Enter this club into a division to see its table.'); return; }
  api('/standings/get?league_id=' + team.league_id).then(stand => renderStandings(body, stand)).catch(e => { body.innerHTML = emptyState('No table', e.message); });
}

async function renderTeamTransfers(body, teamId) {
  body.innerHTML = '<div class="empty">Loading…</div>';
  const list = await api('/transfers/list').catch(() => []);
  const mine = list.filter(t => String(t.from_team_id) === String(teamId) || String(t.to_team_id) === String(teamId));
  body.innerHTML = mine.length ? `<div class="card">${renderTable(['Player', 'From', 'To', 'Type', 'Status', 'Date'], mine.map(t => [
    `<a href="#/player/${t.player_id}" style="font-weight:700">${esc(t.player_name)}</a>`,
    t.from_team_name ? esc(t.from_team_name) : '<span class="subtle">Free agent</span>',
    t.to_team_name ? esc(t.to_team_name) : '<span class="subtle">Free agent</span>',
    `<span class="badge faint">${esc((t.transfer_type || 'transfer').replace(/_/g, ' '))}</span>`,
    `<span class="badge ${t.status === 'completed' ? 'solid' : 'faint'}">${esc(t.status)}</span>`,
    fmtDate(t.listed_at || t.created_at)
  ]))}</div>` : emptyState('No transfers yet', 'In and out moves will appear here.');
}

/* ---------- Player page ---------- */
async function viewPlayer(id, tab) {
  tab = tab || 'overview';
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const d = await api('/players/detail?player_id=' + id).catch(() => null);
  if (!d) { $content.innerHTML = emptyState('Player not found', ''); return; }
  const p = d.player;
  const TABS = [['overview', 'Overview'], ['stats', 'Stats'], ['awards', 'Awards'], ['transfers', 'Transfers']];
  $content.innerHTML = `
    <div class="profile-hero">
      ${p.avatar_url ? `<img class="p-avatar" src="${esc(p.avatar_url)}" alt="">` : `<span class="p-avatar placeholder">${esc(initials(p.name))}</span>`}
      <div style="flex:1;min-width:0">
        <h2>${esc(p.name)}</h2>
        <div class="p-meta">
          ${p.team_id ? `<a class="club-chip" href="#/team/${p.team_id}">${p.crest_url ? `<img class="crest" style="width:18px;height:18px" src="${esc(p.crest_url)}" alt="">` : ''}<b>${esc(p.team_name)}</b></a>` : '<b>Free agent</b>'}
          <span>·</span><span class="badge pos">${p.position}</span>
          <span class="tnum">#${p.shirt_number ?? '—'}</span>
          ${p.country ? `<span>·</span><span style="display:inline-flex;align-items:center;gap:5px">${flagChip(p.country)} ${esc(p.country)}</span>` : ''}
        </div>
      </div>
      <button class="btn sm admin-only" data-action="edit-player" data-id="${p.id}">Edit</button>
      <button class="btn sm admin-only" data-action="give-award" data-id="player" data-target="${p.id}">Award</button>
      <button class="btn sm primary admin-only" data-action="move-player" data-id="${p.id}">Transfer</button>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<div class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</div>`).join('')}</div>
    <div id="playerBody"></div>
  `;
  $content.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => { location.hash = `#/player/${id}/${el.dataset.tab}`; }));
  const body = document.getElementById('playerBody');
  if (tab === 'overview') return renderPlayerOverview(body, p, d);
  if (tab === 'stats') return renderPlayerStats(body, d);
  if (tab === 'awards') return renderPlayerAwards(body, d);
  if (tab === 'transfers') return renderPlayerTransfers(body, d);
}

function pitchMarker(pos) {
  const P = { GK: [50, 92], RB: [80, 70], CB: [50, 78], LB: [20, 70], CM: [50, 46], ST: [50, 16] };
  const pt = P[pos] || P.CM;
  return `<svg class="pos-pitch" viewBox="0 0 100 138" aria-hidden="true">
    <rect x="3" y="3" width="94" height="132" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>
    <line x1="50" y1="3" x2="50" y2="135" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
    <circle cx="50" cy="69" r="17" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
    <rect x="36" y="3" width="28" height="16" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <rect x="36" y="119" width="28" height="16" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <circle cx="${pt[0]}" cy="${pt[1]}" r="6" fill="rgba(5,192,138,.15)" stroke="#05C08A" stroke-width="1.6"/>
    <circle cx="${pt[0]}" cy="${pt[1]}" r="2.2" fill="#05C08A"/>
  </svg>`;
}

function renderPlayerOverview(body, p, d) {
  let season = d.season, all = d.all_time;
  let mode = 'season';
  const statCell = (lbl, val) => `<div class="stat-cell"><div class="stat-num">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
  function draw() {
    const s = mode === 'season' ? season : all;
    document.getElementById('statStrip').innerHTML =
      statCell('Apps', s.apps) + statCell('Goals', s.goals) + statCell('Assists', s.assists) + statCell('Avg rating', s.avg_rating != null ? s.avg_rating : '—') + statCell('Clean sheets', s.clean_sheets);
    document.getElementById('statSub').textContent = `Yellow: ${s.yellow_cards} · Red: ${s.red_cards} · ${mode === 'season' ? 'this season' : 'career'} · TOTW: ${d.totw_appearances || 0}`;
  }
  body.innerHTML = `
    <div class="card">
      <div class="section-head"><h3>Stats</h3><div class="seg" id="statSeg"><button data-mode="season" class="active">Season</button><button data-mode="all">All-time</button></div></div>
      <div class="stat-strip" id="statStrip"></div>
      <div class="subtle" style="margin-top:10px" id="statSub"></div>
    </div>
    <div class="grid cols-2 section-block">
      <div class="card"><h3>Position — ${esc(p.position)}</h3>${pitchMarker(p.position)}</div>
      <div class="card"><h3>About</h3>
        ${p.team_id ? `<div class="movement"><div class="mv-club">${p.crest_url ? `<img class="crest" style="width:20px;height:20px" src="${esc(p.crest_url)}" alt="">` : ''}<b>${esc(p.team_name)}</b></div></div>` : '<div class="movement"><b>Free agent</b></div>'}
        <div class="subtle" style="margin-top:4px">Position: ${esc(POS_LABEL[p.position] || p.position)}</div>
        ${p.country ? `<div class="subtle">Country: ${flagChip(p.country)} ${esc(p.country)}</div>` : ''}
      </div>
    </div>
  `;
  draw();
  document.querySelectorAll('#statSeg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#statSeg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); mode = b.dataset.mode; draw();
  }));
}

function renderPlayerStats(body, d) {
  const history = (d.history || []).slice().reverse();
  body.innerHTML = history.length ? `<div class="card">${renderTable(['MW', 'Competition', 'Rating', 'G', 'A', 'Cards'], history.map(h => [
    h.matchweek, esc(h.league_name), `<strong>${Number(h.rating).toFixed(1)}</strong>`, h.goals, h.assists,
    (h.red_cards ? h.red_cards + 'R' : '') + (h.yellow_cards ? (h.red_cards ? ' · ' : '') + h.yellow_cards + 'Y' : '') || '<span class="subtle">—</span>'
  ]))}</div>` : emptyState('No rated matches yet', 'Appearances rated after matches show up here.');
}

function renderPlayerAwards(body, d) {
  body.innerHTML = (d.awards && d.awards.length) ? `<div class="card">${d.awards.map(a => `
    <div class="honor">${a.icon_url ? `<img class="h-icon" src="${esc(a.icon_url)}" alt="">` : `<span class="h-icon placeholder">${esc(initials(a.award_name))}</span>`}<div><b>${esc(a.award_name)}</b><small>${esc(a.season_name || 'All-time')} · ${esc(a.awarded_at)}</small></div></div>`).join('')}</div>` : emptyState('No awards yet', 'Won awards appear here.');
}

function renderPlayerTransfers(body, d) {
  const moves = d.transfer_history || [];
  body.innerHTML = moves.length ? `<div class="card">${moves.map(m => `
    <div class="movement">
      <div class="mv-club">${m.from_crest_url ? `<img class="crest" src="${esc(m.from_crest_url)}" alt="">` : ''}<b>${esc(m.from_team_name || 'Free agent')}</b></div>
      <span class="mv-arrow">→</span>
      <div class="mv-club" style="flex:1">${m.to_crest_url ? `<img class="crest" src="${esc(m.to_crest_url)}" alt="">` : ''}<b>${esc(m.to_team_name || 'Free agent')}</b></div>
      <small class="subtle">${esc((m.movement_type || 'transfer').replace(/_/g, ' '))} · ${fmtDate(m.moved_at)}</small>
    </div>`).join('')}</div>` : emptyState('No club moves yet', 'Transfers and releases are recorded here.');
}

/* ---------- Transfers market ---------- */
async function viewTransfers() {
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const list = await api('/transfers/list').catch(() => []);
  $content.innerHTML = `
    <div class="card">
      <div class="section-head"><h3>Transfer market</h3><button class="btn sm primary admin-only" data-action="new-transfer">+ Transfer</button></div>
      ${list.length ? renderTable(['Player', 'From', 'To', 'Type', 'Status', 'Date'], list.map(t => [
        `<a href="#/player/${t.player_id}" style="font-weight:700">${esc(t.player_name)}</a>`,
        t.from_team_name ? `<a href="#/team/${t.from_team_id}">${esc(t.from_team_name)}</a>` : '<span class="subtle">Free agent</span>',
        t.to_team_name ? `<a href="#/team/${t.to_team_id}">${esc(t.to_team_name)}</a>` : '<span class="subtle">Free agent</span>',
        `<span class="badge faint">${esc((t.transfer_type || 'transfer').replace(/_/g, ' '))}</span>`,
        `<span class="badge ${t.status === 'completed' ? 'solid' : 'faint'}">${esc(t.status)}</span>`,
        fmtDate(t.listed_at || t.created_at)
      ])) : emptyState('No transfers yet', 'Player moves will appear here.')}
    </div>
  `;
}

/* ---------- Favorites ---------- */
async function viewFavorites() {
  $content.innerHTML = '<div class="empty">Loading…</div>';
  const favs = getFavs();
  const [teams, ov, all] = await Promise.all([
    api('/teams/list').catch(() => []),
    api('/pts/overview').catch(() => ({ active: null, leagues: [], competitions: [] })),
    api('/leagues/list').catch(() => [])
  ]);
  const comps = [...(ov.active ? [...ov.leagues, ...ov.competitions.filter(c => c.format !== 'league')] : []), ...all.filter(l => !l.season_id)];
  const favTeams = teams.filter(t => (favs.teams || []).some(x => String(x.id) === String(t.id)));
  const favComps = comps.filter(c => (favs.competitions || []).some(x => String(x.id) === String(c.id)));
  $content.innerHTML = `
    <div class="card" style="padding:0">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><h3 style="margin:0">Favorite clubs</h3></div>
      ${favTeams.length ? favTeams.map(t => `
        <div class="match-row" style="grid-template-columns:1fr auto">
          <a href="#/team/${t.id}" class="team-cell"><span style="font-size:14px">${crest(t.crest_url, t.name, 26)} ${esc(t.name)}</span></a>
          ${starBtn('team', t.id, t.name)}
        </div>`).join('') : '<div class="empty"><h3>No favorite clubs</h3><p>Tap the star on any club page.</p></div>'}
    </div>
    <div class="card" style="padding:0">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><h3 style="margin:0">Favorite competitions</h3></div>
      ${favComps.length ? favComps.map(c => `
        <div class="match-row" style="grid-template-columns:1fr auto">
          <a href="#/league/${c.id}" class="m-name" style="font-weight:700">${esc(c.name)}</a>
          ${starBtn('competition', c.id, c.name)}
        </div>`).join('') : '<div class="empty"><h3>No favorite competitions</h3><p>Tap the star on any league page.</p></div>'}
    </div>
  `;
}

/* ---------- More / settings ---------- */
function viewMore() {
  $content.innerHTML = `
    <div class="card">
      <div class="section-head"><h3>Settings</h3></div>
      <div class="more-grid">
        <div class="more-cell" id="themeToggle"><span class="ic">◐</span><b>Theme</b><span class="subtle">Dark / light</span></div>
        <div class="more-cell"><span class="ic">🌐</span><b>Language</b><span class="subtle">English</span></div>
      </div>
    </div>
    <div class="card section-block">
      <div class="section-head"><h3>More</h3></div>
      <div class="more-grid">
        <a class="more-cell" href="#/transfers"><span class="ic">⇄</span><b>Transfer market</b><span class="subtle">All player moves</span></a>
        <a class="more-cell" href="#/leagues"><span class="ic">▤</span><b>Competitions</b><span class="subtle">Divisions & cups</span></a>
        <a class="more-cell" href="#/favorites"><span class="ic">★</span><b>Favorites</b><span class="subtle">Starred clubs & leagues</span></a>
        <div class="more-cell admin-only" data-action="control"><span class="ic">⚙</span><b>Control Center</b><span class="subtle">Seasons, fixtures, rollover</span></div>
        <div class="more-cell admin-only" data-action="site-settings"><span class="ic">◈</span><b>Site settings</b><span class="subtle">Branding & logo</span></div>
      </div>
    </div>
    <div class="card section-block">
      <h3>About</h3>
      <p class="subtle" style="margin:0">Roball is a FotMob-style results and stats hub for Roblox football leagues. Scores and stats are entered by league administrators — there is no external data feed.</p>
    </div>
  `;
  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('light');
    toast(document.body.classList.contains('light') ? 'Light theme' : 'Dark theme');
  });
}

/* ---------- Global search ---------- */
let searchCache = null;
function searchData() {
  if (!searchCache) {
    searchCache = Promise.all([
      api('/teams/list').catch(() => []),
      api('/players/list').catch(() => []),
      api('/pts/overview').catch(() => ({ active: null, leagues: [], competitions: [] })),
      api('/news').catch(() => [])
    ]).then(([teams, players, ov, news]) => ({ teams, players, comps: ov.active ? [...ov.leagues, ...ov.competitions] : [], news }));
  }
  return searchCache;
}
function openSearch() {
  $searchRoot.innerHTML = `
    <div class="search-overlay">
      <div class="search-box">
        <input class="search-input" id="searchInput" autocomplete="off" placeholder="Search teams, players, competitions, news…" autofocus>
        <div id="searchResults"></div>
      </div>
    </div>
  `;
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  input.focus();
  $searchRoot.querySelector('.search-overlay').addEventListener('click', (e) => { if (e.target === $searchRoot.querySelector('.search-overlay')) closeSearch(); });
  const esc = (e) => { if (e.key === 'Escape') closeSearch(); };
  document.addEventListener('keydown', esc);
  const draw = async (q) => {
    if (!q) { results.innerHTML = ''; return; }
    const d = await searchData();
    const match = (s) => (s || '').toLowerCase().includes(q);
    const teams = d.teams.filter(t => match(t.name) || match(t.short_name));
    const players = d.players.filter(p => match(p.name) || match(p.team_name) || match(p.country));
    const comps = d.comps.filter(c => match(c.name));
    const news = d.news.filter(n => match(n.title) || match(n.body));
    const group = (title, list, fn) => list.length ? `<div class="search-group"><h3>${title}</h3>${list.map(fn).join('')}</div>` : '';
    results.innerHTML =
      group('Clubs', teams, t => `<a class="search-result" href="#/team/${t.id}">${crest(t.crest_url, t.name, 28)}<div class="r-body"><div class="r-name">${esc(t.name)}</div><div class="r-sub">${t.division_code ? 'Division ' + t.division_code.replace('D', '') : 'Club'}</div></div></a>`) +
      group('Players', players, p => `<a class="search-result" href="#/player/${p.id}">${avatar(p.avatar_url, p.name, 28)}<div class="r-body"><div class="r-name">${esc(p.name)}</div><div class="r-sub">${p.team_name ? esc(p.team_name) : 'Free agent'} · ${esc(p.position)}</div></div></a>`) +
      group('Competitions', comps, c => `<a class="search-result" href="#/league/${c.id}"><span class="badge ${c.division_code ? 'solid' : ''}">${esc(c.division_code || 'CUP')}</span><div class="r-body"><div class="r-name">${esc(c.name)}</div></div></a>`) +
      group('News', news.slice(0, 5), n => `<a class="search-result" href="#/news">${n.cover_url ? `<img class="crest" style="width:28px;height:28px;border-radius:6px" src="${esc(n.cover_url)}" alt="">` : ''}<div class="r-body"><div class="r-name">${esc(n.title)}</div><div class="r-sub">${esc(n.category || 'News')}</div></div></a>`) +
      (!teams.length && !players.length && !comps.length && !news.length ? '<div class="empty"><h3>No results</h3><p>Nothing matched your search.</p></div>' : '');
  };
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => draw(input.value.trim().toLowerCase()), 140); });
  draw('');
}
function closeSearch() { $searchRoot.innerHTML = ''; }
document.getElementById('searchBtn').addEventListener('click', openSearch);

/* ---------- Delegated interactions ---------- */
document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    toggleFav(fav.dataset.fav, fav.dataset.id, fav.dataset.name);
    route();
    return;
  }
});

/* ---------- Table helper ---------- */
function renderTable(headers, rows) {
  if (!rows.length) return '<div class="empty"><h3>Nothing here yet</h3></div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th class="${['#', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'Apps', 'Avg', 'Last 5', 'G', 'A', 'Rating', 'Shirt'].includes(h) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ---------- Boot ---------- */
route();
