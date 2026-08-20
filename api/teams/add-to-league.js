import { db } from "hatchable";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  const { league_id, team_id } = req.body || {};
  if (!league_id || !team_id) return res.status(400).json({ error: "league_id and team_id are required" });
  const { rows: leagues } = await db.query("SELECT division_config FROM leagues WHERE id=$1", [league_id]);
  if (!leagues[0]) return res.status(404).json({ error: "Division not found." });
  const cfg = typeof leagues[0].division_config === "string" ? JSON.parse(leagues[0].division_config || "{}") : (leagues[0].division_config || {});
  const { rows: count } = await db.query("SELECT count(*)::int AS n FROM league_teams WHERE league_id=$1", [league_id]);
  if (Number(cfg.team_count) > 0 && count[0].n >= Number(cfg.team_count)) return res.status(409).json({ error: `This division is configured for ${cfg.team_count} clubs.` });
  await db.query(
    `INSERT INTO league_teams (league_id, team_id) VALUES ($1, $2)
     ON CONFLICT (league_id, team_id) DO NOTHING`, [league_id, team_id]
  );
  res.json({ ok: true });
}
