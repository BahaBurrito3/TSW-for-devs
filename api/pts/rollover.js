import { db } from "hatchable";

export const access = "admin";
export const methods = ["POST"];

function config(value) {
  if (!value) return {};
  if (typeof value === "string") { try { return JSON.parse(value); } catch (e) { return {}; } }
  return value;
}
function places(d, type) {
  const p = d[type] || {};
  return Math.max(0, Number(p.automatic ?? p.auto_places ?? (type === "promotion" ? d.promotion_spots : d.relegation_spots) ?? 0));
}

async function ranked(league) {
  const cfg = config(league.division_config);
  const points = cfg.points || { win: 3, draw: 1, loss: 0 };
  const { rows } = await db.query(
    `WITH games AS (
       SELECT home_team_id AS team_id,home_score AS gf,away_score AS ga FROM matches WHERE league_id=$1 AND status='played'
       UNION ALL
       SELECT away_team_id,away_score,home_score FROM matches WHERE league_id=$1 AND status='played'
     ) SELECT team_id,
       COUNT(*)::int AS played,
       SUM(CASE WHEN gf>ga THEN $2 WHEN gf=ga THEN $3 ELSE $4 END)::int AS pts,
       SUM(gf-ga)::int AS gd,SUM(gf)::int AS gf
     FROM games GROUP BY team_id ORDER BY pts DESC,gd DESC,gf DESC,team_id`,
    [league.id, Number(points.win ?? 3), Number(points.draw ?? 1), Number(points.loss ?? 0)]
  );
  const { rows: clubs } = await db.query(
    `SELECT t.id,t.name FROM league_teams lt JOIN teams t ON t.id=lt.team_id WHERE lt.league_id=$1 ORDER BY t.name`, [league.id]
  );
  const byId = Object.fromEntries(rows.map((x) => [String(x.team_id), x]));
  return clubs.map((club) => byId[String(club.id)] || { team_id: club.id, pts: 0, gd: 0, gf: 0, played: 0 })
    .sort((a, b) => Number(b.pts) - Number(a.pts) || Number(b.gd) - Number(a.gd) || Number(b.gf) - Number(a.gf) || Number(a.team_id) - Number(b.team_id));
}

async function buildPlan(seasonId, nextName) {
  const { rows: seasonRows } = await db.query("SELECT * FROM seasons WHERE id=$1 AND status='active'", [seasonId]);
  const season = seasonRows[0];
  if (!season) throw new Error("Active season not found.");
  const { rows: divisions } = await db.query("SELECT * FROM leagues WHERE season_id=$1 ORDER BY created_at,id", [seasonId]);
  if (!divisions.length) throw new Error("The active season has no divisions to roll over.");
  const rankedDivisions = [];
  for (const division of divisions) {
    const cfg = config(division.division_config);
    const ranks = await ranked(division);
    const expected = Number(cfg.matches_per_team || 0) * ranks.length / 2;
    const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM matches WHERE league_id=$1 AND status='played'", [division.id]);
    if (expected > 0 && countRows[0].n < expected) throw new Error(`${division.name} is not complete: ${countRows[0].n}/${expected} matches recorded.`);
    rankedDivisions.push({ division, config: cfg, ranks });
  }
  const nextByIndex = rankedDivisions.map((x) => ({ division: x.division, teamIds: x.ranks.map((r) => r.team_id) }));
  const moves = [];
  rankedDivisions.forEach((entry, index) => {
    const promotion = places(entry.config, "promotion");
    const relegation = places(entry.config, "relegation");
    const promotionTarget = entry.config.promotion?.connected_to ?? (index > 0 ? index - 1 : null);
    const relegationTarget = entry.config.relegation?.connected_to ?? (index < rankedDivisions.length - 1 ? index + 1 : null);
    if (promotion && promotionTarget !== null && rankedDivisions[promotionTarget]) {
      const moved = entry.ranks.slice(0, promotion).map((r) => r.team_id);
      moves.push(...moved.map((teamId) => ({ teamId, from: index, to: Number(promotionTarget), type: "promotion" })));
    }
    if (relegation && relegationTarget !== null && rankedDivisions[relegationTarget]) {
      const moved = entry.ranks.slice(-relegation).map((r) => r.team_id);
      moves.push(...moved.map((teamId) => ({ teamId, from: index, to: Number(relegationTarget), type: "relegation" })));
    }
  });
  for (const move of moves) {
    nextByIndex[move.from].teamIds = nextByIndex[move.from].teamIds.filter((id) => String(id) !== String(move.teamId));
    if (!nextByIndex[move.to].teamIds.some((id) => String(id) === String(move.teamId))) nextByIndex[move.to].teamIds.push(move.teamId);
  }
  return { season, nextName: String(nextName || "").trim(), rankedDivisions, nextByIndex, moves };
}

function previewResponse(plan) {
  return {
    preview: true,
    season: { id: plan.season.id, name: plan.season.name },
    next_season_name: plan.nextName,
    divisions: plan.rankedDivisions.map((x, i) => ({
      name: x.division.name,
      current_order: x.ranks.map((r) => r.team_id),
      next_order: plan.nextByIndex[i].teamIds,
      promotion_places: places(x.config, "promotion"),
      relegation_places: places(x.config, "relegation")
    })),
    moves: plan.moves
  };
}

export default async function (req, res) {
  const { season_id, next_season_name, preview, approved } = req.body || {};
  if (!season_id || !next_season_name) return res.status(400).json({ error: "season_id and next_season_name are required" });
  let plan;
  try { plan = await buildPlan(season_id, next_season_name); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (preview || approved !== true) return res.json(previewResponse(plan));

  const { rows: nextSeasonRows } = await db.query(
    `INSERT INTO seasons (name,minimum_rating_apps,league_system_id,start_date,end_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [plan.nextName, plan.season.minimum_rating_apps, plan.season.league_system_id, null, null]
  );
  const nextSeason = nextSeasonRows[0];
  const created = [];
  for (const entry of plan.rankedDivisions) {
    const { rows } = await db.query(
      `INSERT INTO leagues (name,season,country,format,relegation_spots,promotion_spots,season_id,division_code,league_system_id,abbreviation,division_config)
       VALUES ($1,$2,$3,'league',$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
      [entry.division.name, nextSeason.name, entry.division.country, places(entry.config, "relegation"), places(entry.config, "promotion"),
        nextSeason.id, entry.division.division_code, entry.division.league_system_id, entry.division.abbreviation || entry.division.division_code, JSON.stringify(entry.config)]
    );
    created.push(rows[0]);
  }
  for (let i = 0; i < created.length; i += 1) {
    for (const teamId of plan.nextByIndex[i].teamIds) await db.query("INSERT INTO league_teams (league_id,team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [created[i].id, teamId]);
  }
  const { rows: competitions } = await db.query("SELECT * FROM competitions WHERE season_id=$1", [plan.season.id]);
  for (const c of competitions) {
    await db.query(
      `INSERT INTO competitions (season_id,name,code,format,division_scope,logo_url,config,start_date,end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [nextSeason.id, c.name, c.code, c.format, c.division_scope, c.logo_url, JSON.stringify(config(c.config)), c.start_date, c.end_date]
    );
  }
  await db.query("UPDATE seasons SET status='archived',archived_at=now() WHERE id=$1", [plan.season.id]);
  res.json({ ...previewResponse(plan), preview: false, season: nextSeason, leagues: created, message: "Season rolled over with the approved promotion and relegation plan." });
}
