import { db } from "hatchable";
import { withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

function parseConfig(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (e) { return {}; }
  }
  return value;
}

function result(home, away, points) {
  if (home > away) return ["W", "L", [points.win, points.loss]];
  if (home < away) return ["L", "W", [points.loss, points.win]];
  return ["D", "D", [points.draw, points.draw]];
}

export default async function (req, res) {
  const { league_id } = req.query;
  if (!league_id) return res.status(400).json({ error: "league_id is required" });
  const { rows: leagueRows } = await db.query("SELECT * FROM leagues WHERE id = $1", [league_id]);
  const league = leagueRows[0];
  if (!league) return res.status(404).json({ error: "league not found" });
  const config = parseConfig(league.division_config);
  const points = {
    win: Number(config.points?.win ?? 3),
    draw: Number(config.points?.draw ?? 1),
    loss: Number(config.points?.loss ?? 0)
  };
  const tiebreakers = Array.isArray(config.tiebreakers) && config.tiebreakers.length
    ? config.tiebreakers
    : ["points", "goal_difference", "goals_scored", "head_to_head"];
  const { rows: teamsRaw } = await db.query(
    `SELECT t.id,t.name,t.crest_url FROM league_teams lt JOIN teams t ON t.id=lt.team_id
     WHERE lt.league_id=$1 AND COALESCE(t.status,'active')='active' ORDER BY t.name`, [league_id]
  );
  const teams = await withMediaMany(teamsRaw, ["crest_url"]);
  const { rows: matches } = await db.query("SELECT * FROM matches WHERE league_id=$1 AND status='played' ORDER BY matchweek,id", [league_id]);
  const rows = teams.map((t) => ({ team_id: t.id, name: t.name, crest_url: t.crest_url, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0, last5: [] }));
  const byId = Object.fromEntries(rows.map((r) => [r.team_id, r]));
  for (const m of matches) {
    const h = byId[m.home_team_id], a = byId[m.away_team_id];
    if (!h || !a) continue;
    h.played += 1; a.played += 1;
    h.gf += Number(m.home_score || 0); h.ga += Number(m.away_score || 0);
    a.gf += Number(m.away_score || 0); a.ga += Number(m.home_score || 0);
    const [hr, ar, pts] = result(Number(m.home_score || 0), Number(m.away_score || 0), points);
    h[hr === "W" ? "won" : hr === "D" ? "drawn" : "lost"] += 1;
    a[ar === "W" ? "won" : ar === "D" ? "drawn" : "lost"] += 1;
    h.pts += pts[0]; a.pts += pts[1];
    h.last5.push(hr); a.last5.push(ar);
  }
  rows.forEach((r) => { r.gd = r.gf - r.ga; r.last5 = r.last5.slice(-5).reverse(); });

  const compareStat = (a, b, key) => {
    if (key === "points") return b.pts - a.pts;
    if (key === "goal_difference") return b.gd - a.gd;
    if (key === "goals_scored") return b.gf - a.gf;
    return 0;
  };
  const h2h = (a, b) => {
    const ids = new Set([a.team_id, b.team_id]);
    const mini = { [a.team_id]: { pts: 0, gd: 0, gf: 0 }, [b.team_id]: { pts: 0, gd: 0, gf: 0 } };
    for (const m of matches) {
      if (!ids.has(m.home_team_id) || !ids.has(m.away_team_id)) continue;
      const hs = Number(m.home_score || 0), as = Number(m.away_score || 0);
      mini[m.home_team_id].gf += hs; mini[m.home_team_id].gd += hs - as;
      mini[m.away_team_id].gf += as; mini[m.away_team_id].gd += as - hs;
      if (hs > as) mini[m.home_team_id].pts += points.win; else if (hs < as) mini[m.away_team_id].pts += points.win;
      else { mini[m.home_team_id].pts += points.draw; mini[m.away_team_id].pts += points.draw; }
    }
    return mini[b.team_id].pts - mini[a.team_id].pts || mini[b.team_id].gd - mini[a.team_id].gd || mini[b.team_id].gf - mini[a.team_id].gf;
  };
  const baseTie = (a, b) => tiebreakers.reduce((value, key) => value || (key === "head_to_head" ? h2h(a, b) : compareStat(a, b, key)), 0) || a.name.localeCompare(b.name);
  rows.sort(baseTie);
  const unresolvedBeforeName = rows.some((a, i) => i > 0 && baseTie(rows[i - 1], a) === 0);
  const promotion = config.promotion || {};
  const relegation = config.relegation || {};
  const promotionPlaces = Number(promotion.automatic ?? promotion.auto_places ?? league.promotion_spots ?? 0);
  const relegationPlaces = Number(relegation.automatic ?? relegation.auto_places ?? league.relegation_spots ?? 0);
  const table = rows.map((r, i) => ({
    ...r,
    position: i + 1,
    zone: i === 0 ? "champion" : i < promotionPlaces ? "promotion" : i >= rows.length - relegationPlaces && relegationPlaces > 0 ? "relegation" : null
  }));
  res.json({ league: { ...league, division_config: config }, table, playoff_may_be_required: unresolvedBeforeName || tiebreakers.includes("playoff") });
}
