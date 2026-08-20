import { db } from "hatchable";
import { withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { rows } = await db.query(
    `SELECT l.*, s.name AS season_name, s.start_date, s.end_date, s.status AS season_status,
            ls.name AS league_system_name, ls.abbreviation AS league_system_abbreviation,
            ls.logo_url AS league_system_logo_url,
            COUNT(DISTINCT lt.team_id)::int AS team_count,
            COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'played')::int AS matches_played
     FROM leagues l
     LEFT JOIN seasons s ON s.id = l.season_id
     LEFT JOIN league_systems ls ON ls.id = COALESCE(l.league_system_id, s.league_system_id)
     LEFT JOIN league_teams lt ON lt.league_id = l.id
     LEFT JOIN matches m ON m.league_id = l.id
     WHERE COALESCE(l.status, 'active') = 'active'
     GROUP BY l.id, s.name, s.start_date, s.end_date, s.status, ls.name, ls.abbreviation, ls.logo_url
     ORDER BY COALESCE(s.created_at, l.created_at) DESC, l.created_at DESC`
  );
  res.json(await withMediaMany(rows, ["logo_url", "league_system_logo_url"]));
}
