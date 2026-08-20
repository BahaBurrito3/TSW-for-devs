import { db } from "hatchable";
import { COMPETITION_FORMATS } from "../../lib/league-config.js";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Competition name is required" });
  if (!COMPETITION_FORMATS.includes(b.format)) {
    return res.status(400).json({ error: "Choose single_elimination, two_leg, or group_knockout." });
  }
  let seasonId = b.season_id;
  if (!seasonId) {
    const { rows } = await db.query("SELECT id FROM seasons WHERE status = 'active' LIMIT 1");
    if (!rows[0]) return res.status(400).json({ error: "There is no active season." });
    seasonId = rows[0].id;
  }
  const code = String(b.code || name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")).trim().toUpperCase();
  const config = b.config || {
    participating_divisions: Array.isArray(b.participating_divisions) ? b.participating_divisions : [],
    team_ids: Array.isArray(b.team_ids) ? b.team_ids.map(Number).filter(Number.isInteger) : [],
    qualification: b.qualification || null,
    groups: Number(b.groups) || 0,
    teams_per_group: Number(b.teams_per_group) || 0,
    qualifiers_per_group: Number(b.qualifiers_per_group) || 0,
    draw: b.draw || "random",
    extra_time: Boolean(b.extra_time),
    penalties: b.penalties !== false,
    forfeit_rules: b.forfeit_rules || null,
    final_format: b.final_format || "single_match"
  };
  try {
    const { rows } = await db.query(
      `INSERT INTO competitions
       (season_id,name,code,format,division_scope,logo_url,config,start_date,end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
      [seasonId, name, code, b.format, b.division_scope || null, b.logo_url || null,
        JSON.stringify(config), b.start_date || null, b.end_date || null]
    );
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That competition code already exists in this season." });
    throw error;
  }
}
