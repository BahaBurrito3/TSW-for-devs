/* ============================================================
   Roball — Admin session, Control Center and data management.
   All mutations are enforced server-side; these controls are
   hidden from visitors via the body.is-admin class.
   ============================================================ */
(function () {
  const C = document.getElementById('content');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  async function api(path, method, body) {
    const r = await fetch(window.__HATCHABLE__.api + path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Request failed');
    return d;
  }

  const POSITIONS = ['GK', 'RB', 'CB', 'LB', 'CM', 'ST'];
  const POS_LABEL = { GK: 'Goalkeeper', RB: 'Right Back', CB: 'Centre Back', LB: 'Left Back', CM: 'Centre Mid', ST: 'Striker' };

  /* ---------- Image upload (durable key) ---------- */
  async function square(file) {
    if (!file || file.type === 'image/svg+xml') return file;
    const image = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('Could not read that image.'));
      i.src = URL.createObjectURL(file);
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    return await new Promise((ok) => canvas.toBlob((b) => ok(new File([b], 'square.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9));
  }
  window.uploadImage = async function (file, opts) {
    const f = new FormData();
    f.append('image', opts && opts.square === false ? file : await square(file));
    const r = await fetch(window.__HATCHABLE__.api + '/media/upload', { method: 'POST', body: f });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Upload failed');
    return d.key;
  };

  /* ---------- Session ---------- */
  window.ADMIN = false;
  async function session() {
    const r = await fetch(window.__HATCHABLE__.api + '/admin/session');
    const d = await r.json().catch(() => ({}));
    window.ADMIN = r.ok;
    document.body.classList.toggle('is-admin', r.ok);
    renderTopbar(d);
  }
  function renderTopbar(me) {
    const root = document.getElementById('headerActions');
    root.innerHTML = me
      ? `<span class="subtle" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(me.display_name || me.handle || me.email || '')}</span>
         <button class="btn sm" data-action="site-settings">Settings</button>
         <button class="btn sm ghost" id="logoutBtn">Log out</button>`
      : `<button class="btn sm" id="loginBtn">Login</button>`;
    const login = document.getElementById('loginBtn');
    const logout = document.getElementById('logoutBtn');
    if (login) login.onclick = async () => {
      const r = await fetch(window.__HATCHABLE__.api + '/admin/session');
      const d = await r.json().catch(() => ({}));
      location.href = d.login_url || ('https://hatchable.com/login?next=' + encodeURIComponent(location.href));
    };
    if (logout) logout.onclick = () => { location.href = 'https://hatchable.com/logout?next=' + encodeURIComponent(location.href); };
  }

  /* ---------- Control Center ---------- */
  window.viewControl = async () => {
    C.innerHTML = '<div class="empty">Loading…</div>';
    const d = await api('/pts/overview').catch(() => null);
    if (!d) { C.innerHTML = '<div class="card"><div class="empty"><h3>Could not load overview</h3></div></div>'; return; }
    if (!d.active) {
      C.innerHTML = `
        <div class="card">
          <div class="empty">
            <h3>Ready for kickoff</h3>
            <p>No league season exists yet. Create the structure you need: any number of divisions, any team count, and zero or more competitions.</p>
            <div class="empty-state-cta"><button class="btn primary" id="startBtn">Create a league</button></div>
          </div>
        </div>`;
      document.getElementById('startBtn').onclick = startSeason;
      return;
    }
    const s = d.active;
    const leagues = d.leagues;
    const cups = d.competitions.filter(c => c.format !== 'league');
    C.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="badge solid">Active</span>
          <div style="flex:1;min-width:180px">
            <div style="font-weight:900;font-size:16px">${esc(s.name)}</div>
            <div class="subtle">Started ${new Date(s.created_at).toLocaleDateString()}</div>
          </div>
          <button class="btn sm primary" data-action="new-cup">+ Competition</button>
        </div>
      </div>
      <div class="section-block">
        <div class="section-head"><h3>Divisions</h3><span class="subtle">Configured per division · no fixed team count</span></div>
        <div class="grid cols-2">
          ${leagues.map(l => {
            const cfg = typeof l.division_config === 'string' ? JSON.parse(l.division_config || '{}') : (l.division_config || {});
            const configuredTeams = Number(cfg.team_count) || l.team_count || 0;
            const canGen = l.team_count >= 2 && l.matches_total === 0;
            return `
            <div class="card">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <span class="badge solid">${esc(l.division_code)}</span>
                <a href="#/league/${l.id}" style="font-weight:800;font-size:15px">${esc(l.name)}</a>
                <span class="subtle" style="margin-left:auto">${l.team_count}/${configuredTeams || '—'} · ${l.matches_played}/${l.matches_total}</span>
              </div>
              <div class="mini-bars"><div class="mini-bar-row"><span style="width:46px">Played</span><span class="bar"><div style="width:${Math.min(100, l.matches_total ? l.matches_played / l.matches_total * 100 : 0)}%"></div></span><span class="tnum">${l.matches_played}/${l.matches_total}</span></div></div>
              <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                <a class="btn sm" href="#/league/${l.id}">Table</a>
                <button class="btn sm" data-action="gen-fixtures" data-id="${l.id}" ${canGen ? '' : 'disabled'}>Generate fixtures</button>
                <button class="btn sm" data-action="add-club" data-id="${l.id}">+ Club</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="section-block">
        <div class="section-head"><h3>Cups</h3></div>
        <div class="card" style="padding:0">
          ${cups.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Competition</th><th>Format</th><th class="num">Clubs</th><th>Status</th><th></th></tr></thead>
            <tbody>${cups.map(x => `
              <tr>
                <td><b><a href="#/cup/${x.id}">${esc(x.name)}</a></b></td>
                <td><span class="badge faint">${x.format === 'two_leg' ? 'Two legs' : x.format === 'group_knockout' ? 'Groups + knockout' : 'Knockout'}</span></td>
                <td class="num">${x.entry_count}</td>
                <td><span class="badge">${esc(x.status)}</span></td>
                <td style="white-space:nowrap">
                  <button class="btn sm" data-action="edit-competition" data-id="${x.id}">Edit</button>
                  <button class="btn sm" data-action="cup-entries" data-id="${x.id}" data-name="${esc(x.name)}">Entries</button>
                  <button class="btn sm" data-action="cup-draw" data-id="${x.id}" data-name="${esc(x.name)}" ${x.entry_count < 2 ? 'disabled' : ''}>Draw</button>
                  <a class="btn sm" href="#/cup/${x.id}">Bracket</a>
                  <button class="btn sm" data-action="archive-competition" data-id="${x.id}" data-name="${esc(x.name)}">Archive</button>
                  <button class="btn sm danger" data-action="cup-remove" data-id="${x.id}" data-name="${esc(x.name)}">Delete</button>
                </td>
              </tr>`).join('')}</tbody></table></div>`
            : '<div class="empty"><h3>No cups</h3><p>Add a cup for this season.</p></div>'}
        </div>
      </div>
      <div class="section-block">
        <div class="section-head"><h3>Season rollover</h3></div>
        <div class="card">
          <p class="subtle" style="margin:0 0 12px">When configured divisions are complete, preview the promotion/relegation plan before approving the next season. The completed season stays archived.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" data-action="rollover" data-id="${s.id}">Archive & roll over</button>
            <button class="btn danger" data-action="force-archive" data-id="${s.id}">Force archive</button>
          </div>
        </div>
      </div>`;
  };

  function startSeason() {
    if (window.openLeagueWizard) window.openLeagueWizard();
    else window.toast('League setup is still loading. Try again.', 'error');
  }

  /* ---------- Club / player modals ---------- */
  async function openTeamModal(id) {
    const teams = await api('/teams/list');
    const t = id ? teams.find(x => String(x.id) === String(id)) : null;
    window.openModal(`
      <h3>${t ? 'Edit club' : 'New club'}</h3>
      <form id="teamForm">
        <div class="field"><label>Club name</label><input name="name" required value="${t ? esc(t.name) : ''}" placeholder="e.g. Northside FC"></div>
        <div class="form-row">
          <div class="field"><label>Short name</label><input name="short_name" value="${t ? esc(t.short_name || '') : ''}"></div>
          <div class="field"><label>Manager</label><input name="manager" value="${t ? esc(t.manager || '') : ''}"></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Home kit hex</label><input name="home_color" value="${t ? esc(t.home_color || '') : '#05C08A'}"></div>
          <div class="field"><label>Away kit hex</label><input name="away_color" value="${t ? esc(t.away_color || '') : '#0B0F14'}"></div>
        </div>
        <div class="field"><label>Crest URL</label><input name="crest_url" value="${t ? esc(t.crest_url_raw || t.crest_url || '') : ''}" placeholder="https://…"></div>
        <div class="field"><label>Or upload crest</label><input name="crest_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">${t ? 'Save' : 'Create club'}</button></div>
      </form>
    `);
    document.getElementById('teamForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        let crest_url = f.get('crest_url') || null;
        if (f.get('crest_file').size) crest_url = await window.uploadImage(f.get('crest_file'));
        const body = { name: f.get('name'), short_name: f.get('short_name') || null, manager: f.get('manager') || null, home_color: f.get('home_color') || '#05C08A', away_color: f.get('away_color') || '#0B0F14', crest_url };
        if (t) await api('/teams/update', 'POST', { id: t.id, ...body });
        else await api('/teams/create', 'POST', body);
        window.closeModal(); window.toast(t ? 'Club updated' : 'Club created', 'ok'); window.route ? window.route() : location.reload();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openPlayerModal(teamId, id) {
    let p = null;
    if (id) {
      const all = await api('/players/list');
      p = all.find(x => String(x.id) === String(id));
    }
    window.openModal(`
      <h3>${p ? 'Edit player' : 'Add player'}</h3>
      <form id="playerForm">
        <div class="field"><label>Gamertag</label><input name="name" required value="${p ? esc(p.name) : ''}" placeholder="e.g. TouchKing99"></div>
        <div class="field"><label>Country</label><input name="country" value="${p ? esc(p.country || '') : ''}" placeholder="e.g. England"></div>
        <div class="form-row">
          <div class="field"><label>Position</label><select name="position">${POSITIONS.map(x => `<option ${p && p.position === x ? 'selected' : ''}>${x} — ${POS_LABEL[x]}</option>`).join('')}</select></div>
          <div class="field"><label>Shirt #</label><input name="shirt_number" type="number" min="1" max="99" value="${p ? p.shirt_number ?? '' : ''}"></div>
        </div>
        <div class="field"><label>Picture URL</label><input name="url" value="${p ? esc(p.avatar_url_raw || p.avatar_url || '') : ''}" placeholder="https://…"></div>
        <div class="field"><label>Or upload picture</label><input name="file" type="file" accept="image/png,image/jpeg,image/webp"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">${p ? 'Save' : 'Add player'}</button></div>
      </form>
    `);
    document.getElementById('playerForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        let avatar_url = f.get('url') || null;
        if (f.get('file').size) avatar_url = await window.uploadImage(f.get('file'));
        const body = { name: f.get('name'), position: f.get('position'), shirt_number: f.get('shirt_number') ? Number(f.get('shirt_number')) : null, country: f.get('country') || null, avatar_url };
        if (p) await api('/players/update', 'POST', { id: p.id, ...body });
        else await api('/players/create', 'POST', { team_id: teamId, ...body });
        window.closeModal(); window.toast(p ? 'Player updated' : 'Player added', 'ok'); window.route ? window.route() : location.reload();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openMoveModal(id) {
    const [players, teams] = await Promise.all([api('/players/list'), api('/teams/list')]);
    const p = players.find(x => String(x.id) === String(id));
    if (!p) return window.toast('Player not found', 'error');
    window.openModal(`
      <h3>Transfer / release — ${esc(p.name)}</h3>
      <p class="modal-sub">Moving a player keeps all of their historical stats attached to the player. Release leaves them as a free agent (still visible in the player database).</p>
      <form id="moveForm">
        <div class="field"><label>Destination club</label>
          <select name="to_team_id"><option value="">Release — free agent</option>${teams.filter(t => String(t.id) !== String(p.team_id)).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Note (optional)</label><input name="note"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Confirm move</button></div>
      </form>
    `);
    document.getElementById('moveForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/players/move', 'POST', { player_id: id, to_team_id: f.get('to_team_id') ? Number(f.get('to_team_id')) : null, note: f.get('note') || null, confirmation: 'MOVE' });
        window.closeModal(); window.toast('Player moved', 'ok'); window.route ? window.route() : location.reload();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function disbandClub(id) {
    window.confirmModal('Disband this club?', 'This cannot be undone. Past results and all-time records remain; pending fixtures and active cup entries are removed, and players become free agents.', 'DISBAND', async (word) => {
      const r = await api('/teams/disband', 'POST', { team_id: Number(id), confirmation: word });
      window.closeModal(); window.toast(r.message, 'ok'); window.route();
    }, true);
  }

  /* ---------- League / fixtures ---------- */
  async function openAddToLeagueModal(leagueId) {
    const [all, inLeague] = await Promise.all([api('/teams/list'), api('/teams/list?league_id=' + leagueId)]);
    const taken = new Set(inLeague.map(t => String(t.id)));
    const avail = all.filter(t => !taken.has(String(t.id)));
    window.openModal(`
      <h3>Add club to division</h3>
      <form id="addClubForm">
        <div class="field"><label>Club</label>
          <select name="team_id" required><option value="">Choose…</option>${avail.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        </div>
        ${avail.length ? '' : '<p class="subtle">Every active club is already in this division.</p>'}
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" ${avail.length ? '' : 'disabled'}>Add</button></div>
      </form>
    `);
    document.getElementById('addClubForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/teams/add-to-league', 'POST', { league_id: Number(leagueId), team_id: Number(new FormData(e.target).get('team_id')) });
        window.closeModal(); window.toast('Club added', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function generateFixtures(leagueId) {
    try {
      const r = await api('/pts/fixtures/generate', 'POST', { league_id: Number(leagueId) });
      window.toast(r.message, 'ok'); window.route();
    } catch (x) { window.toast(x.message, 'error'); }
  }

  async function openMatchModal(leagueId) {
    const teams = await api('/teams/list?league_id=' + leagueId);
    if (teams.length < 2) return window.toast('Add at least two clubs first', 'error');
    window.openModal(`
      <h3>New match</h3>
      <form id="matchForm">
        <div class="form-row">
          <div class="field"><label>Home</label><select name="home_team_id" required>${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Away</label><select name="away_team_id" required>${teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Matchweek</label><input name="matchweek" type="number" min="1" value="1"></div>
          <div class="field"><label>Date</label><input name="played_at" type="date"></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Create match</button></div>
      </form>
    `);
    document.getElementById('matchForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/matches/create', 'POST', { league_id: Number(leagueId), home_team_id: Number(f.get('home_team_id')), away_team_id: Number(f.get('away_team_id')), matchweek: Number(f.get('matchweek')) || 1, played_at: f.get('played_at') || null });
        window.closeModal(); window.toast('Match created', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openMatchResultModal(matchId) {
    const d = await api('/matches/get?match_id=' + matchId);
    const m = d.match;
    window.openModal(`
      <h3>${esc(m.home_team_name)} vs ${esc(m.away_team_name)}</h3>
      <form id="resultForm">
        <div class="field"><label>Forfeit</label>
          <select name="forfeit">
            <option value="">Normal result</option>
            <option value="home">${esc(m.home_team_name)} forfeit — 3–0 to ${esc(m.away_team_name)}</option>
            <option value="away">${esc(m.away_team_name)} forfeit — 3–0 to ${esc(m.home_team_name)}</option>
          </select>
        </div>
        <div class="form-row">
          <div class="field"><label>${esc(m.home_team_name)} goals</label><input name="home_score" type="number" min="0" value="${m.home_score ?? ''}"></div>
          <div class="field"><label>${esc(m.away_team_name)} goals</label><input name="away_score" type="number" min="0" value="${m.away_score ?? ''}"></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Matchweek</label><input name="matchweek" type="number" min="1" value="${m.matchweek}"></div>
          <div class="field"><label>Date</label><input name="played_at" type="date" value="${m.played_at ? String(m.played_at).slice(0, 10) : ''}"></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Save result</button></div>
      </form>
    `);
    document.getElementById('resultForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const forfeit = f.get('forfeit');
      try {
        const body = { id: m.id, matchweek: Number(f.get('matchweek')) || m.matchweek, played_at: f.get('played_at') || null };
        if (forfeit) body.forfeit_team_id = forfeit === 'home' ? m.home_team_id : m.away_team_id;
        else { body.home_score = Number(f.get('home_score')); body.away_score = Number(f.get('away_score')); body.status = 'played'; }
        await api('/matches/update', 'POST', body);
        window.closeModal(); window.toast(forfeit ? 'Forfeit recorded — 3–0' : 'Result saved', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function setMatchLive(matchId) {
    try {
      await api('/matches/update', 'POST', { id: Number(matchId), status: 'live' });
      window.toast('Match is live', 'ok'); window.route();
    } catch (x) { window.toast(x.message, 'error'); }
  }

  async function openRateModal(matchId) {
    const d = await api('/matches/get?match_id=' + matchId);
    const m = d.match;
    const [hp, ap, existing] = await Promise.all([
      api('/players/list?team_id=' + m.home_team_id),
      api('/players/list?team_id=' + m.away_team_id),
      api('/ratings/list?match_id=' + matchId).catch(() => [])
    ]);
    const byPlayer = {};
    existing.forEach(r => { byPlayer[r.player_id] = r; });
    const rowsFor = (players, teamId) => players.map(p => {
      const ex = byPlayer[p.id];
      return `
        <div class="form-row" style="align-items:flex-end;margin-bottom:8px" data-player="${p.id}" data-team="${teamId}">
          <div class="field" style="flex:2;margin:0"><label style="margin:0 0 4px">${esc(p.name)} <span class="badge pos">${p.position}</span></label></div>
          <div class="field" style="flex:1;margin:0"><label>Rating</label><input class="r-rating" type="number" min="0" max="10" step="0.1" value="${ex ? ex.rating : ''}"></div>
          <div class="field" style="margin:0"><label>G</label><input class="r-goals" type="number" min="0" value="${ex ? ex.goals : 0}"></div>
          <div class="field" style="margin:0"><label>A</label><input class="r-assists" type="number" min="0" value="${ex ? ex.assists : 0}"></div>
          <div class="field" style="margin:0"><label>Y</label><input class="r-yellow" type="number" min="0" value="${ex ? ex.yellow_cards : 0}"></div>
          <div class="field" style="margin:0"><label>R</label><input class="r-red" type="number" min="0" value="${ex ? ex.red_cards : 0}"></div>
          <div class="field" style="margin:0"><label class="check" style="white-space:nowrap"><input class="r-clean" type="checkbox" ${ex && ex.clean_sheet ? 'checked' : ''}> CS</label></div>
        </div>`;
    }).join('');
    window.openModal(`
      <h3>Rate players — ${esc(m.home_team_name)} ${m.home_score ?? ''}–${m.away_score ?? ''} ${esc(m.away_team_name)}</h3>
      <p class="modal-sub">Leave rating blank to skip a player.</p>
      <div class="modal-scroll">
        <h4 style="margin:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${esc(m.home_team_name)}</h4>
        ${rowsFor(hp, m.home_team_id)}
        <h4 style="margin:12px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${esc(m.away_team_name)}</h4>
        ${rowsFor(ap, m.away_team_id)}
      </div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" id="saveRatingsBtn">Save ratings</button></div>
    `, true);
    document.getElementById('saveRatingsBtn').onclick = async () => {
      const ratings = [];
      document.querySelectorAll('#modalRoot [data-player]').forEach(row => {
        const rating = row.querySelector('.r-rating').value;
        if (rating === '') return;
        ratings.push({
          player_id: Number(row.dataset.player), team_id: Number(row.dataset.team), rating: Number(rating),
          goals: Number(row.querySelector('.r-goals').value) || 0,
          assists: Number(row.querySelector('.r-assists').value) || 0,
          yellow_cards: Number(row.querySelector('.r-yellow').value) || 0,
          red_cards: Number(row.querySelector('.r-red').value) || 0,
          clean_sheet: row.querySelector('.r-clean').checked
        });
      });
      if (!ratings.length) return window.toast('Enter at least one rating', 'error');
      try {
        await api('/ratings/save', 'POST', { match_id: Number(matchId), ratings });
        window.closeModal(); window.toast('Ratings saved', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  /* ---------- Cups ---------- */
  function openCupModal() {
    window.openModal(`
      <h3>Add a cup</h3>
      <form id="cupForm">
        <div class="field"><label>Cup name</label><input name="name" required placeholder="e.g. Roball Cup"></div>
        <div class="field"><label>Format</label>
          <select name="format"><option value="single_elimination">Knockout — single leg</option><option value="two_leg">Knockout — two legs</option></select>
        </div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Create cup</button></div>
      </form>
    `);
    document.getElementById('cupForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const cup = await api('/competitions/create', 'POST', { name: new FormData(e.target).get('name'), format: new FormData(e.target).get('format') });
        window.closeModal(); window.toast('Cup created', 'ok'); location.hash = '#/cup/' + cup.id;
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openCupEntries(id, name) {
    const [ov, entries] = await Promise.all([api('/pts/overview'), api('/pts/entries?competition_id=' + id)]);
    const taken = new Set(entries.map(t => String(t.id)));
    const avail = ov.teams.filter(t => !taken.has(String(t.id)));
    window.openModal(`
      <h3>Entries — ${esc(name)}</h3>
      <form id="entryForm">
        <div class="field"><label>Add club</label>
          <select name="team_id" required><option value="">Choose…</option>${avail.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        </div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Close</button><button class="btn primary" ${avail.length ? '' : 'disabled'}>Enter club</button></div>
      </form>
      ${entries.length ? `<div class="subtle" style="margin-top:12px">${entries.map(t => esc(t.name)).join(' · ')}</div>` : '<div class="subtle" style="margin-top:12px">No clubs entered yet.</div>'}
    `);
    document.getElementById('entryForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/pts/entries', 'POST', { competition_id: Number(id), team_id: Number(new FormData(e.target).get('team_id')) });
        window.closeModal(); window.toast('Club entered', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openCupDraw(id, name) {
    const data = await api('/cups/ties?competition_id=' + id);
    const rounds = data.rounds || [];
    const nextRound = rounds.length ? ('Round ' + (rounds.length + 1)) : 'Round 1';
    window.openModal(`
      <h3>Draw — ${esc(name)}</h3>
      <form id="drawForm">
        <div class="field"><label>Round name</label><input name="round_name" value="${nextRound}"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Draw round</button></div>
      </form>
    `);
    document.getElementById('drawForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/cups/actions', 'POST', { action: 'draw', competition_id: Number(id), round_name: new FormData(e.target).get('round_name') });
        window.closeModal(); window.toast(r.message, 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  function removeCup(id, name) {
    window.confirmModal('Remove ' + name + '?', 'This removes the cup, its entries and bracket from the current season only.', 'DELETE', async (word) => {
      const r = await api('/pts/competitions/delete', 'POST', { competition_id: Number(id), confirmation: word });
      window.closeModal(); window.toast(r.message, 'ok'); window.route();
    }, true);
  }

  async function openCupResult(tieId) {
    const ov = await api('/cups/ties').catch(() => null);
    // Find the tie's competition via the first match of all cups is expensive; use overview competitions.
    window.openModal(`
      <h3>Enter tie result</h3>
      <form id="tieForm">
        <div class="form-row">
          <div class="field"><label>Home goals</label><input name="home_score" type="number" min="0" required></div>
          <div class="field"><label>Away goals</label><input name="away_score" type="number" min="0" required></div>
        </div>
        <div class="field"><label>Winner if level (penalties / replay)</label>
          <select name="winner_team_id" id="tieWinner"><option value="">Will decide from the score</option></select>
        </div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Save result</button></div>
      </form>
    `);
    document.getElementById('tieForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { action: 'result', tie_id: Number(tieId), home_score: Number(f.get('home_score')), away_score: Number(f.get('away_score')) };
      if (f.get('winner_team_id')) body.winner_team_id = Number(f.get('winner_team_id'));
      try {
        const r = await api('/cups/actions', 'POST', body);
        window.closeModal(); window.toast(r.message || 'Result saved', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  /* ---------- Transfers ---------- */
  async function openTransferModal() {
    const [players, teams] = await Promise.all([api('/players/list'), api('/teams/list')]);
    window.openModal(`
      <h3>New transfer</h3>
      <form id="transferForm">
        <div class="field"><label>Player</label>
          <select name="player_id" required><option value="">Choose…</option>${players.map(p => `<option value="${p.id}">${esc(p.name)} (${p.team_name ? esc(p.team_name) : 'Free agent'})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Destination</label>
          <select name="to_team_id" required><option value="">Choose…</option>${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        </div>
        <div class="form-row">
          <div class="field"><label>Type</label>
            <select name="transfer_type"><option value="transfer">Transfer</option><option value="free_agent">Free agent</option><option value="loan">Loan</option></select>
          </div>
          <div class="field"><label>Status</label>
            <select name="status"><option value="pending">Pending</option><option value="completed">Completed now</option></select>
          </div>
        </div>
        <div class="field"><label>Note</label><input name="note"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Create transfer</button></div>
      </form>
    `);
    document.getElementById('transferForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/transfers/create', 'POST', { player_id: Number(f.get('player_id')), to_team_id: Number(f.get('to_team_id')), transfer_type: f.get('transfer_type'), status: f.get('status'), note: f.get('note') || null });
        window.closeModal(); window.toast('Transfer recorded', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  /* ---------- Awards ---------- */
  async function openAwardModal() {
    window.openModal(`
      <h3>Create award</h3>
      <form id="awardForm">
        <div class="field"><label>Name</label><input name="name" required placeholder="e.g. Player of the Season"></div>
        <div class="field"><label>Description</label><input name="description"></div>
        <div class="form-row">
          <div class="field"><label>Type</label><select name="award_type"><option value="player">Player</option><option value="club">Club</option></select></div>
          <div class="field"><label>Scope</label><select name="scope"><option value="season">Per season</option><option value="all_time">All-time</option></select></div>
        </div>
        <div class="field"><label>Badge URL</label><input name="icon_url" placeholder="https://…"></div>
        <div class="field"><label>Or upload badge</label><input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Create award</button></div>
      </form>
    `);
    document.getElementById('awardForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        let icon_url = f.get('icon_url') || null;
        if (f.get('file').size) icon_url = await window.uploadImage(f.get('file'));
        await api('/pts/content', 'POST', { action: 'award_save', name: f.get('name'), description: f.get('description') || null, award_type: f.get('award_type'), scope: f.get('scope'), icon_url });
        window.closeModal(); window.toast('Award created', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  async function openGiveAward(kind, id) {
    const [awards, players, teams, ov] = await Promise.all([
      api('/pts/content?action=awards_list').catch(() => []),
      api('/players/list').catch(() => []),
      api('/teams/list').catch(() => []),
      api('/pts/overview').catch(() => ({ seasons: [] }))
    ]);
    const pool = awards.filter(a => a.award_type === kind);
    if (!pool.length) return window.toast('Create a ' + kind + ' award first.', 'error');
    window.openModal(`
      <h3>Assign award</h3>
      <form id="assignForm">
        <div class="field"><label>Award</label><select name="award_id">${pool.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Winner</label>
          <select name="winner" required><option value="">Choose…</option>
            ${kind === 'player' ? players.map(p => `<option value="p${p.id}">${esc(p.name)} (${p.team_name ? esc(p.team_name) : 'Free agent'})</option>`).join('') : teams.map(t => `<option value="c${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Season</label><select name="season_id"><option value="">All-time</option>${(ov.seasons || []).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Note</label><input name="note"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Assign</button></div>
      </form>
    `);
    document.getElementById('assignForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const w = f.get('winner');
      const body = { action: 'award_assign', award_id: Number(f.get('award_id')) };
      if (w[0] === 'p') body.player_id = Number(w.slice(1));
      else body.team_id = Number(w.slice(1));
      if (f.get('season_id')) body.season_id = Number(f.get('season_id'));
      if (f.get('note')) body.note = f.get('note');
      try {
        await api('/pts/content', 'POST', body);
        window.closeModal(); window.toast('Award assigned', 'ok'); window.route();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  /* ---------- Site settings ---------- */
  async function openSiteSettings() {
    let cur = {};
    try { cur = await api('/settings/site'); } catch (e) {}
    window.openModal(`
      <h3>Site settings</h3>
      <p class="modal-sub">Replace the header crest. Applies to the whole site.</p>
      <form id="logoForm">
        <div class="field"><label>Logo URL</label><input name="url" value="${esc((cur.site_logo_url_raw || cur.site_logo_url || ''))}" placeholder="https://…"></div>
        <div class="field"><label>Or upload (PNG/WebP/SVG)</label><input name="file" type="file" accept="image/png,image/webp,image/svg+xml"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Save logo</button></div>
      </form>
    `);
    document.getElementById('logoForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        let url = f.get('url') || null;
        if (f.get('file').size) url = await window.uploadImage(f.get('file'), { square: false });
        if (!url) throw Error('Upload or enter a logo URL.');
        await api('/settings/site-save', 'POST', { site_logo_url: url });
        window.closeModal(); window.toast('Logo updated', 'ok'); location.reload();
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }

  /* ---------- Rollover / archive ---------- */
  function rollover(seasonId) {
    window.openModal(`
      <h3>Preview season rollover</h3>
      <p class="modal-sub">The system will calculate the next division membership first. You can review the move list before approving it.</p>
      <form id="rollForm">
        <div class="field"><label>Next season name</label><input name="name" required placeholder="e.g. Spring 2027"></div>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button class="btn primary">Preview changes</button></div>
      </form>
    `);
    document.getElementById('rollForm').onsubmit = async (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('name');
      try {
        const preview = await api('/pts/rollover', 'POST', { season_id: Number(seasonId), next_season_name: name, preview: true });
        const moves = (preview.moves || []).map((m) => `<div class="subtle">${esc(m.type)} · club #${m.teamId} · configured division ${m.from + 1} → ${m.to + 1}</div>`).join('') || '<div class="subtle">No automatic moves configured.</div>';
        window.openModal(`<h3>Approve rollover?</h3><p class="modal-sub">${esc(preview.season.name)} → ${esc(preview.next_season_name)}</p><div class="modal-scroll">${moves}</div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>Cancel</button><button type="button" class="btn primary" id="approveRollover">Approve & create season</button></div>`);
        document.getElementById('approveRollover').onclick = async () => {
          try { const r = await api('/pts/rollover', 'POST', { season_id: Number(seasonId), next_season_name: name, approved: true }); window.closeModal(); window.toast(r.message, 'ok'); window.route(); }
          catch (x) { window.toast(x.message, 'error'); }
        };
      } catch (x) { window.toast(x.message, 'error'); }
    };
  }
  function forceArchive(seasonId) {
    window.confirmModal('Force archive season?', 'For an incomplete season where you only need to keep awards and records. This does not apply promotion/relegation and does not create a new season.', 'ARCHIVE', async (word) => {
      const r = await api('/pts/force-archive', 'POST', { season_id: Number(seasonId), confirmation: word });
      window.closeModal(); window.toast(r.message, 'ok'); window.route();
    }, true);
  }

  /* ---------- Delegated admin actions ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'control': location.hash = '#/control'; break;
      case 'new-league': startSeason(); break;
      case 'site-settings': openSiteSettings(); break;
      case 'new-club': openTeamModal(); break;
      case 'edit-club': openTeamModal(id); break;
      case 'disband-club': disbandClub(id); break;
      case 'new-player': openPlayerModal(id); break;
      case 'edit-player': openPlayerModal(undefined, id); break;
      case 'move-player': openMoveModal(id); break;
      case 'add-club': openAddToLeagueModal(id); break;
      case 'gen-fixtures': generateFixtures(id); break;
      case 'new-match': openMatchModal(id); break;
      case 'edit-match': openMatchResultModal(id); break;
      case 'live-match': setMatchLive(id); break;
      case 'rate-match': openRateModal(id); break;
      case 'new-cup': openCupModal(); break;
      case 'edit-competition': if (window.openCompetitionEditor) window.openCompetitionEditor(id); break;
      case 'archive-competition': if (window.archiveCompetition) window.archiveCompetition(id, el.dataset.name); break;
      case 'cup-entries': openCupEntries(id, el.dataset.name); break;
      case 'cup-draw': openCupDraw(id, el.dataset.name); break;
      case 'cup-remove': removeCup(id, el.dataset.name); break;
      case 'cup-result': openCupResult(id); break;
      case 'new-transfer': openTransferModal(); break;
      case 'new-award': openAwardModal(); break;
      case 'give-award': openGiveAward(id === 'player' ? 'player' : 'club', el.dataset.target); break;
      case 'rollover': rollover(id); break;
      case 'force-archive': forceArchive(id); break;
    }
  });

  session();

  // Deep link: app.js boots before this script, so re-run the router if we
  // landed straight on #/control on first load.
  if ((location.hash || '#/').replace(/^#\//, '').split('/')[0] === 'control' && window.route) window.route();
})();
