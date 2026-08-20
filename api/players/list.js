import { db } from "hatchable";
import { withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

const order = "CASE p.position WHEN 'GK' THEN 0 WHEN 'RB' THEN 1 WHEN 'CB' THEN 2 WHEN 'LB' THEN 3 WHEN 'CM' THEN 4 WHEN 'ST' THEN 5 END, p.name";
const media = ["avatar_url", "crest_url"];

export default async function (req, res) {
  const { team_id, league_id, search, position, country } = req.query;
  const params = [];
  const clauses = [];
  if (team_id) { params.push(team_id); clauses.push(`p.team_id=$${params.length}`); }
  if (league_id) {
    params.push(league_id);
    clauses.push(`EXISTS (SELECT 1 FROM league_teams ltx WHERE ltx.league_id=$${params.length} AND ltx.team_id=t.id)`);
  }
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    clauses.push(`(LOWER(p.name) LIKE $${params.length} OR LOWER(COALESCE(t.name,'')) LIKE $${params.length} OR LOWER(COALESCE(p.country,'')) LIKE $${params.length})`);
  }
  if (position) { params.push(position); clauses.push(`p.position=$${params.length}`); }
  if (country) { params.push(`%${String(country).toLowerCase()}%`); clauses.push(`LOWER(COALESCE(p.country,'')) LIKE $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT p.*, t.name AS team_name, t.crest_url,
       COALESCE((SELECT ROUND(AVG(pr.rating),1) FROM player_ratings pr WHERE pr.player_id=p.id),0) AS rating,
       COALESCE((SELECT COUNT(*)::int FROM player_ratings pr WHERE pr.player_id=p.id),0) AS apps
     FROM players p LEFT JOIN teams t ON t.id=p.team_id ${where}
     ORDER BY t.name NULLS FIRST, ${order}`,
    params
  );
  res.json(await withMediaMany(rows, media));
}
