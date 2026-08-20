import { db } from "hatchable";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  const { name, crest_url, home_color, away_color, stadium, manager, league_id } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  if (league_id) {
    const { rows: leagues } = await db.query("SELECT division_config FROM leagues WHERE id=$1", [league_id]);
    if (!leagues[0]) return res.status(404).json({ error: "Division not found." });
    const cfg = typeof leagues[0].division_config === "string" ? JSON.parse(leagues[0].division_config || "{}") : (leagues[0].division_config || {});
    const { rows: count } = await db.query("SELECT count(*)::int AS n FROM league_teams WHERE league_id=$1", [league_id]);
    if (Number(cfg.team_count) > 0 && count[0].n >= Number(cfg.team_count)) return res.status(409).json({ error: `This division is configured for ${cfg.team_count} clubs.` });
  }
  const { rows } = await db.query(
    `INSERT INTO teams (name, crest_url, home_color, away_color, stadium, manager)
     VALUES ($1,$2,COALESCE($3,'#22c55e'),COALESCE($4,'#0f172a'),$5,$6) RETURNING *`,
    [name, crest_url || null, home_color || null, away_color || null, stadium || null, manager || null]
  );
  const team = rows[0];
  if (league_id) await db.query("INSERT INTO league_teams (league_id,team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [league_id, team.id]);
  res.json(team);
}
