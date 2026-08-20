/* Roball custom Team Builder: separate from official clubs, fixtures, and standings. */
(function () {
  const C = document.getElementById('content');
  const API = window.__HATCHABLE__.api;
  const DRAFT_KEY = 'roball.custom-team-draft';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (s) => String(s || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  const img = (url, name, cls) => url ? `<img class="${cls || 'avatar'}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="${cls || 'avatar'} placeholder">${esc(initials(name))}</span>`;
  const api = async (path, method, body) => {
    const r = await fetch(API + path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Request failed');
    return d;
  };
  const toast = (msg, type) => window.toast ? window.toast(msg, type) : window.alert(msg);
  const formats = [4, 5, 6, 7, 8, 9, 10, 11];
  const presets = {
    4: ['GK', 'DF', 'DF', 'ST'], 5: ['GK', 'DF', 'DF', 'CM', 'ST'], 6: ['GK', 'DF', 'DF', 'CM', 'CM', 'ST'],
    7: ['GK', 'DF', 'DF', 'CM', 'CM', 'ST', 'ST'], 8: ['GK', 'DF', 'DF', 'DF', 'CM', 'CM', 'ST', 'ST'],
    9: ['GK', 'DF', 'DF', 'DF', 'CM', 'CM', 'CM', 'ST', 'ST'], 10: ['GK', 'DF', 'DF', 'DF', 'CM', 'CM', 'CM', 'ST', 'ST', 'ST'],
    11: ['GK', 'DF', 'DF', 'DF', 'DF', 'CM', 'CM', 'CM', 'ST', 'ST', 'ST']
  };
  let players = [];
  let leagues = [];
  let shared = false;
  let savedTeams = [];
  let state = loadDraft();

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      return { id: null, name: d.name || '', logo_url: d.logo_url || '', kit_color: d.kit_color || '#05C08A', format: Number(d.format) || 7, league_id: d.league_id || '', season_id: d.season_id || '', captain_player_id: d.captain_player_id || null, starters: d.starters || [], substitutes: d.substitutes || [], slots: d.slots || {} };
    } catch (e) { return { id: null, name: '', logo_url: '', kit_color: '#05C08A', format: 7, league_id: '', season_id: '', captain_player_id: null, starters: [], substitutes: [], slots: {} }; }
  }
  function persistDraft() { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); }
  function selectedIds() { return new Set([...state.starters, ...state.substitutes].map((x) => String(x))); }
  function selectedPlayer(id) { return players.find((p) => String(p.id) === String(id)); }
  function slotPlayers() {
    return state.starters.map((id, i) => ({ id, slot: Number(state.slots[id] ?? i), player: selectedPlayer(id) })).sort((a, b) => a.slot - b.slot);
  }
  function formatSlots() {
    return Array.from({ length: state.format }, (_, i) => {
      const found = slotPlayers().find((x) => x.slot === i);
      return { index: i, label: presets[state.format][i] || 'POS', item: found || null };
    });
  }
  function addPlayer(id) {
    if (selectedIds().has(String(id))) return toast('That player is already selected.', 'error');
    if (state.starters.length < state.format) {
      const slot = state.starters.length;
      state.starters.push(Number(id)); state.slots[id] = slot;
    } else state.substitutes.push(Number(id));
    persistDraft(); draw();
  }
  function removePlayer(id) {
    state.starters = state.starters.filter((x) => String(x) !== String(id));
    state.substitutes = state.substitutes.filter((x) => String(x) !== String(id));
    delete state.slots[id];
    if (String(state.captain_player_id) === String(id)) state.captain_player_id = null;
    state.starters.forEach((x, i) => { state.slots[x] = i; });
    persistDraft(); draw();
  }
  function moveSlot(id, slot) {
    const other = Object.keys(state.slots).find((key) => Number(state.slots[key]) === Number(slot));
    if (other && String(other) !== String(id)) {
      const old = state.slots[id]; state.slots[id] = Number(slot); state.slots[other] = Number(old ?? 0);
    } else state.slots[id] = Number(slot);
    persistDraft(); draw();
  }
  function playerCard(p) {
    const selected = selectedIds().has(String(p.id));
    return `<button class="builder-player ${selected ? 'selected' : ''}" data-player-id="${p.id}">
      ${img(p.avatar_url, p.name, 'avatar')}<span class="r-body"><b>${esc(p.name)}</b><small>${p.team_name ? esc(p.team_name) : 'Free agent'} · ${esc(p.position)} · ${p.rating || '—'}</small></span><span class="badge pos">${esc(p.position)}</span>
    </button>`;
  }
  function pitch() {
    return `<div class="builder-pitch" style="--kit:${esc(state.kit_color)}">
      ${formatSlots().map((s) => `<div class="builder-slot ${s.item ? 'filled' : ''}" data-slot="${s.index}">
        ${s.item && s.item.player ? `${img(s.item.player.avatar_url, s.item.player.name, 'builder-avatar')}<b>${esc(s.item.player.name)}</b><small>${esc(s.label)}${String(state.captain_player_id) === String(s.item.id) ? ' · C' : ''}</small><button class="slot-remove" data-remove="${s.item.id}" aria-label="Remove">×</button>` : `<span class="slot-plus">+</span><small>${esc(s.label)}</small>`}
      </div>`).join('')}
    </div>`;
  }
  function draw() {
    C.innerHTML = `
      <div class="builder-head card">
        <div><div class="eyebrow">CUSTOM TEAM BUILDER</div><h2>${shared ? 'Shared lineup' : 'Build your squad'}</h2><p class="subtle">This lineup is separate from official clubs, standings, transfers, and player records.</p></div>
        ${shared ? '<span class="badge solid">Read-only</span>' : '<button class="btn sm ghost" id="clearBuilder">Clear</button>'}
      </div>
      ${!shared && savedTeams.length ? `<div class="card saved-teams"><div class="section-head"><h3>Saved teams</h3><span class="subtle">${savedTeams.length}</span></div>${savedTeams.map((t) => `<div class="sub-card"><span><b>${esc(t.name)}</b><small>${t.format}-a-side · ${t.player_count} players</small></span><button class="btn sm" data-saved-load="${t.id}">Edit</button><button class="btn sm" data-saved-copy="${t.id}">Duplicate</button><button class="btn sm danger" data-saved-delete="${t.id}">Delete</button></div>`).join('')}</div>` : ''}
      <div class="builder-layout">
        <section>
          <div class="card builder-config">
            <div class="form-row"><div class="field"><label>Team name</label><input id="builderName" value="${esc(state.name)}" placeholder="My Roblox XI" ${shared ? 'disabled' : ''}></div><div class="field"><label>Format</label><select id="builderFormat" ${shared ? 'disabled' : ''}>${formats.map((x) => `<option value="${x}" ${x === state.format ? 'selected' : ''}>${x}-a-side</option>`).join('')}</select></div></div>
            <div class="form-row"><div class="field"><label>Kit color</label><input id="builderColor" type="color" value="${esc(state.kit_color)}" ${shared ? 'disabled' : ''}></div><div class="field"><label>Team logo URL</label><input id="builderLogo" value="${esc(state.logo_url || '')}" placeholder="Optional image URL" ${shared ? 'disabled' : ''}></div><div class="field"><label>Logo file</label><input id="builderLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" ${shared ? 'disabled' : ''}></div><div class="field"><label>Captain</label><select id="builderCaptain" ${shared ? 'disabled' : ''}><option value="">Choose starter</option>${state.starters.map((id) => { const p = selectedPlayer(id); return p ? `<option value="${p.id}" ${String(state.captain_player_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>` : ''; }).join('')}</select></div></div>
            <div class="form-row"><div class="field"><label>League / division</label><select id="builderLeague" ${shared ? 'disabled' : ''}><option value="">No league selected</option>${leagues.map((l) => `<option value="${l.id}" ${String(state.league_id) === String(l.id) ? 'selected' : ''}>${esc(l.name)}${l.season_name ? ' · ' + esc(l.season_name) : ''}</option>`).join('')}</select></div><div class="field"><label>Formation</label><select id="builderFormation" ${shared ? 'disabled' : ''}><option>Preset for ${state.format}-a-side</option><option>Custom pitch placement</option></select></div></div>
          </div>
          ${pitch()}
          <div class="builder-actions card">${shared ? '<p class="subtle">Current club data is refreshed when this shared lineup is opened. Snapshot data shows the clubs selected when it was saved.</p>' : `<button class="btn primary" id="saveBuilder">Save & share</button><button class="btn" id="exportBuilder">Export lineup</button><span class="subtle">${state.starters.length}/${state.format} starters · ${state.substitutes.length} substitutes</span>`}</div>
          ${!shared && state.substitutes.length ? `<div class="card"><h3>Substitutes</h3><div class="builder-subs">${state.substitutes.map((id) => { const p = selectedPlayer(id); return p ? `<div class="sub-card">${img(p.avatar_url, p.name, 'avatar')}<span><b>${esc(p.name)}</b><small>${esc(p.position)}</small></span><button class="btn sm" data-remove="${p.id}">Remove</button></div>` : ''; }).join('')}</div></div>` : ''}
        </section>
        ${shared ? '' : `<aside class="card builder-database"><div class="section-head"><h3>Player database</h3><span class="subtle">${players.length} players</span></div><input class="builder-search" id="builderSearch" placeholder="Search gamertag, club, position, country…"><div id="builderPlayers">${players.length ? players.map(playerCard).join('') : '<div class="empty"><h3>No players yet</h3><p>Add players to the official database first.</p></div>'}</div></aside>`}
      </div>`;
    bind();
  }
  function bind() {
    const name = document.getElementById('builderName'); if (name) name.oninput = () => { state.name = name.value; persistDraft(); };
    const color = document.getElementById('builderColor'); if (color) color.oninput = () => { state.kit_color = color.value; persistDraft(); draw(); };
    const logo = document.getElementById('builderLogo'); if (logo) logo.oninput = () => { state.logo_url = logo.value; persistDraft(); };
    const format = document.getElementById('builderFormat'); if (format) format.onchange = () => { const previous = [...state.starters]; state.format = Number(format.value); state.starters = previous.slice(0, state.format); state.substitutes = [...previous.slice(state.format), ...state.substitutes.filter((id) => !state.starters.includes(id))]; state.starters.forEach((id, i) => { state.slots[id] = i; }); persistDraft(); draw(); };
    const captain = document.getElementById('builderCaptain'); if (captain) captain.onchange = () => { state.captain_player_id = captain.value || null; persistDraft(); };
    const league = document.getElementById('builderLeague'); if (league) league.onchange = () => { state.league_id = league.value || ''; const picked = leagues.find((x) => String(x.id) === String(league.value)); state.season_id = picked ? picked.season_id || '' : ''; persistDraft(); };
    const search = document.getElementById('builderSearch'); if (search) search.oninput = () => { const q = search.value.toLowerCase(); document.getElementById('builderPlayers').innerHTML = players.filter((p) => [p.name, p.team_name, p.position, p.country].join(' ').toLowerCase().includes(q)).map(playerCard).join('') || '<div class="empty"><h3>No players found</h3></div>'; bindPlayers(); };
    bindPlayers();
    document.querySelectorAll('[data-remove]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); removePlayer(b.dataset.remove); });
    document.querySelectorAll('[data-saved-load]').forEach((b) => b.onclick = () => loadSavedTeam(b.dataset.savedLoad, false));
    document.querySelectorAll('[data-saved-copy]').forEach((b) => b.onclick = () => loadSavedTeam(b.dataset.savedCopy, true));
    document.querySelectorAll('[data-saved-delete]').forEach((b) => b.onclick = () => deleteSavedTeam(b.dataset.savedDelete));
    document.querySelectorAll('.builder-slot').forEach((slot) => {
      slot.ondragover = (e) => e.preventDefault();
      slot.ondrop = (e) => { const id = e.dataTransfer.getData('text/plain'); if (id) moveSlot(id, slot.dataset.slot); };
    });
    const clear = document.getElementById('clearBuilder'); if (clear) clear.onclick = () => { localStorage.removeItem(DRAFT_KEY); state = loadDraft(); draw(); };
    const save = document.getElementById('saveBuilder'); if (save) save.onclick = saveTeam;
    const exp = document.getElementById('exportBuilder'); if (exp) exp.onclick = exportTeam;
  }
  function bindPlayers() { document.querySelectorAll('.builder-player').forEach((b) => { b.onclick = () => addPlayer(b.dataset.playerId); b.draggable = true; b.ondragstart = (e) => e.dataTransfer.setData('text/plain', b.dataset.playerId); }); }
  async function saveTeam() {
    if (!state.name.trim()) return toast('Give your custom team a name first.', 'error');
    if (state.starters.length !== state.format) return toast(`Select ${state.format} starters first.`, 'error');
    try {
      const logoFile = document.getElementById('builderLogoFile');
      if (logoFile && logoFile.files && logoFile.files[0]) state.logo_url = await window.uploadImage(logoFile.files[0], { square: false });
      const result = await api('/custom-teams/save', 'POST', {
        id: state.id, name: state.name.trim(), logo_url: state.logo_url || null, kit_color: state.kit_color, format: state.format, league_id: state.league_id || null, season_id: state.season_id || null,
        captain_player_id: state.captain_player_id, formation: { preset: presets[state.format], slots: state.slots }, is_public: true,
        players: [...state.starters.map((id, i) => ({ player_id: id, role: 'starter', slot_index: Number(state.slots[id] ?? i), assigned_position: (selectedPlayer(id) || {}).position })), ...state.substitutes.map((id) => ({ player_id: id, role: 'substitute', slot_index: null, assigned_position: (selectedPlayer(id) || {}).position }))]
      });
      state.id = result.id; persistDraft(); await loadSaved();
      const url = location.origin + result.share_url;
      try { await navigator.clipboard.writeText(url); toast('Saved. Share link copied.', 'ok'); } catch (e) { toast('Saved. Share link: ' + url, 'ok'); }
    } catch (e) {
      if (/log in/i.test(e.message)) toast('Log in from the header to save and share permanently.', 'error'); else toast(e.message, 'error');
    }
  }
  function exportTeam() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 760;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0B0F14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = state.kit_color; ctx.fillRect(0, 0, 16, canvas.height); ctx.fillStyle = '#fff'; ctx.font = '800 38px Inter, sans-serif'; ctx.fillText(state.name || 'Custom team', 58, 70); ctx.font = '500 18px Inter, sans-serif'; ctx.fillStyle = '#9aa4af'; ctx.fillText(`${state.format}-a-side · Roblox football lineup`, 60, 105);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.strokeRect(60, 140, 1080, 550);
    slotPlayers().forEach((x) => { const col = x.slot % 4, row = Math.floor(x.slot / 4); const px = 110 + col * 260, py = 205 + row * 135; ctx.fillStyle = state.kit_color; ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(x.player ? x.player.name.slice(0, 18) : '—', px, py + 58); ctx.font = '500 13px Inter, sans-serif'; ctx.fillStyle = '#9aa4af'; ctx.fillText(x.player ? `${x.player.position}${String(state.captain_player_id) === String(x.id) ? ' · C' : ''}` : '', px, py + 80); });
    const a = document.createElement('a'); a.download = `${(state.name || 'custom-team').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`; a.href = canvas.toDataURL('image/png'); a.click();
  }
  async function loadSaved() { savedTeams = await api('/custom-teams/list').catch(() => []); }
  async function loadSavedTeam(id, duplicate) {
    try {
      const d = await api('/custom-teams/get?id=' + encodeURIComponent(id));
      state = { ...state, ...d.team, id: duplicate ? null : d.team.id, starters: d.players.filter((p) => p.role === 'starter').map((p) => p.player_id), substitutes: d.players.filter((p) => p.role === 'substitute').map((p) => p.player_id), slots: Object.fromEntries(d.players.filter((p) => p.role === 'starter').map((p, i) => [p.player_id, p.slot_index ?? i])) };
      if (duplicate) state.name = state.name + ' Copy';
      persistDraft(); draw();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function deleteSavedTeam(id) {
    if (!window.confirm('Delete this saved team?')) return;
    try { await api('/custom-teams/delete', 'POST', { id: Number(id) }); await loadSaved(); draw(); } catch (e) { toast(e.message, 'error'); }
  }
  async function loadShared(token) {
    shared = true;
    try {
      const d = await api('/custom-teams/get?share_token=' + encodeURIComponent(token));
      state = { ...state, ...d.team, format: Number(d.team.format), starters: d.players.filter((p) => p.role === 'starter').map((p) => p.player_id), substitutes: d.players.filter((p) => p.role === 'substitute').map((p) => p.player_id), slots: Object.fromEntries(d.players.filter((p) => p.role === 'starter').map((p, i) => [p.player_id, p.slot_index ?? i])) };
      players = d.players.map((p) => ({ id: p.player_id, name: p.current_player_name || p.player_name_snapshot, avatar_url: p.current_avatar_url || p.avatar_snapshot, team_name: p.current_team_name || p.club_name_snapshot, crest_url: p.current_crest_url || p.club_crest_snapshot, position: p.assigned_position, country: p.current_country || p.country_snapshot, rating: p.rating_snapshot }));
      draw();
    } catch (e) { C.innerHTML = `<div class="card"><div class="empty"><h3>Shared team not found</h3><p>This link may be private or no longer available.</p></div></div>`; }
  }
  window.viewTeamBuilder = async function (token) {
    shared = Boolean(token);
    if (!shared) {
      [players, leagues] = await Promise.all([api('/players/list').catch(() => []), api('/leagues/list').catch(() => [])]);
      await loadSaved();
      draw();
    } else loadShared(token);
  };
  window.viewClubs = async function () {
    const teams = await api('/teams/list').catch(() => []);
    C.innerHTML = `<div class="section-head"><div><div class="eyebrow">CLUB DIRECTORY</div><h2>Clubs</h2><p class="subtle">Official clubs and their current registered squads.</p></div><button class="btn primary admin-only" data-action="new-club">+ New club</button></div>${teams.length ? `<div class="grid cols-3">${teams.map((t) => `<a class="card" href="#/team/${t.id}">${img(t.crest_url, t.name, 'crest')}<h3>${esc(t.name)}</h3><p class="subtle">${t.player_count || 0} players${t.division_code ? ' · ' + esc(t.division_code) : ''}</p></a>`).join('')}</div>` : '<div class="card"><div class="empty"><h3>No clubs yet</h3><p>Administrators can add official clubs from this directory.</p></div></div>'}`;
  };
  window.viewPlayers = async function () {
    const all = await api('/players/list').catch(() => []);
    C.innerHTML = `<div class="section-head"><div><div class="eyebrow">PLAYER DATABASE</div><h2>Players</h2><p class="subtle">Every registered player stays searchable, including free agents.</p></div></div><div class="card"><input class="builder-search" id="directorySearch" placeholder="Search gamertag, club, position, country…"><div id="directoryPlayers">${all.length ? all.map(playerCard).join('') : '<div class="empty"><h3>No players yet</h3><p>Players appear here after an administrator adds them.</p></div>'}</div></div>`;
    const list = document.getElementById('directoryPlayers'); document.getElementById('directorySearch').oninput = (e) => { const q = e.target.value.toLowerCase(); list.innerHTML = all.filter((p) => [p.name, p.team_name, p.position, p.country].join(' ').toLowerCase().includes(q)).map((p) => `<a class="search-result" href="#/player/${p.id}">${img(p.avatar_url, p.name, 'avatar')}<span class="r-body"><b>${esc(p.name)}</b><small>${p.team_name ? esc(p.team_name) : 'Free agent'} · ${esc(p.position)} · Rating ${p.rating || '—'}</small></span></a>`).join('') || '<div class="empty"><h3>No players found</h3></div>'; };
  };
  window.viewCompetitions = function () { location.hash = '#/leagues'; };
  const bootRoute = (location.hash || '#/').replace(/^#\//, '').split('/')[0];
  if (['builder', 'clubs', 'players'].includes(bootRoute) && window.route) window.route();
})();
