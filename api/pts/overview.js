import { db } from "hatchable";
import { withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { rows: seasons } = await db.query("SELECT * FROM seasons ORDER BY created_at DESC");
  const active = seasons.find((x) => x.status === "active");
  if (!active) return res.json({ seasons, active: null, leagues: [], competitions: [], teams: [] });
  const [{ rows: leagues }, { rows: competitions }, { rows: teamsRaw }] = await Promise.all([
    db.query(`SELECT l.*,
      (SELECT count(*)::int FROM league_teams lt WHERE lt.league_id=l.id) team_count,
      (SELECT count(*)::int FROM matches m WHERE m.league_id=l.id AND m.status='played') matches_played,
      (SELECT count(*)::int FROM matches m WHERE m.league_id=l.id) matches_total
      FROM leagues l WHERE l.season_id=$1 AND COALESCE(l.status,'active')='active' ORDER BY l.created_at,l.id`, [active.id]),
    db.query(`SELECT c.*,count(ce.id)::int entry_count FROM competitions c LEFT JOIN competition_entries ce ON ce.competition_id=c.id
      WHERE c.season_id=$1 AND c.status <> 'archived' GROUP BY c.id ORDER BY c.created_at,c.id`, [active.id]),
    db.query("SELECT id,name,short_name,crest_url FROM teams WHERE COALESCE(status, 'active') <> 'disbanded' ORDER BY name")
  ]);
  const teams = await withMediaMany(teamsRaw, ["crest_url"]);
  res.json({ seasons, active, leagues, competitions, teams });
}
