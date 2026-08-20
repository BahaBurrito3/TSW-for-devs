import { db } from "hatchable";
import { withMedia, withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

const pointsSql = `CASE WHEN gf>ga THEN COALESCE(win_points,3) WHEN gf=ga THEN COALESCE(draw_points,1) ELSE COALESCE(loss_points,0) END`;

export default async function (req, res) {
  const { team_id } = req.query;
  if (!team_id) return res.status(400).json({ error: "team_id is required" });
  const { rows: teamsRaw } = await db.query("SELECT * FROM teams WHERE id = $1", [team_id]);
  if (!teamsRaw[0]) return res.status(404).json({ error: "Club not found" });
  const team = await withMedia(teamsRaw[0], ["crest_url", "secondary_crest_url"]);
  const makeRecord = (activeOnly) => db.query(
    `WITH club_matches AS (
       SELECT m.home_team_id AS team_id,m.home_score AS gf,m.away_score AS ga,
              COALESCE((l.division_config->'points'->>'win')::int,3) AS win_points,
              COALESCE((l.division_config->'points'->>'draw')::int,1) AS draw_points,
              COALESCE((l.division_config->'points'->>'loss')::int,0) AS loss_points
       FROM matches m JOIN leagues l ON l.id=m.league_id ${activeOnly ? "JOIN seasons s ON s.id=l.season_id" : ""}
       WHERE m.status='played' AND m.home_team_id=$1 ${activeOnly ? "AND s.status='active'" : ""}
       UNION ALL
       SELECT m.away_team_id,m.away_score,m.home_score,
              COALESCE((l.division_config->'points'->>'win')::int,3),
              COALESCE((l.division_config->'points'->>'draw')::int,1),
              COALESCE((l.division_config->'points'->>'loss')::int,0)
       FROM matches m JOIN leagues l ON l.id=m.league_id ${activeOnly ? "JOIN seasons s ON s.id=l.season_id" : ""}
       WHERE m.status='played' AND m.away_team_id=$1 ${activeOnly ? "AND s.status='active'" : ""}
     )
     SELECT COUNT(*)::int AS played,COUNT(*) FILTER (WHERE gf>ga)::int AS won,
       COUNT(*) FILTER (WHERE gf=ga)::int AS drawn,COUNT(*) FILTER (WHERE gf<ga)::int AS lost,
       COALESCE(SUM(gf),0)::int AS gf,COALESCE(SUM(ga),0)::int AS ga,
       COALESCE(SUM(${pointsSql}),0)::int AS pts FROM club_matches`, [team_id]);
  const [allTimeQ, seasonQ, scorersQ, ratedQ, honorsQ] = await Promise.all([
    makeRecord(false), makeRecord(true),
    db.query(`SELECT p.id AS player_id,p.name,p.avatar_url,SUM(pr.goals)::int AS goals FROM player_ratings pr JOIN players p ON p.id=pr.player_id WHERE pr.team_id=$1 AND pr.goals>0 GROUP BY p.id,p.name,p.avatar_url ORDER BY goals DESC LIMIT 5`, [team_id]),
    db.query(`SELECT p.id AS player_id,p.name,p.avatar_url,p.position,COUNT(pr.id)::int AS apps,ROUND(AVG(pr.rating),2) AS avg_rating FROM player_ratings pr JOIN players p ON p.id=pr.player_id WHERE pr.team_id=$1 GROUP BY p.id,p.name,p.avatar_url,p.position HAVING COUNT(pr.id)>=2 ORDER BY avg_rating DESC,apps DESC LIMIT 5`, [team_id]),
    db.query(`SELECT aa.id,aa.awarded_at,aa.note,a.name,a.icon_url,a.color,a.scope,s.name AS season_name FROM award_assignments aa JOIN awards a ON a.id=aa.award_id LEFT JOIN seasons s ON s.id=aa.season_id WHERE aa.team_id=$1 ORDER BY aa.awarded_at DESC`, [team_id])
  ]);
  const [scorers, rated, honors] = await Promise.all([withMediaMany(scorersQ.rows, ["avatar_url"]), withMediaMany(ratedQ.rows, ["avatar_url"]), withMediaMany(honorsQ.rows, ["icon_url"]) ]);
  res.json({ team, all_time: allTimeQ.rows[0], season: seasonQ.rows[0], top_scorers: scorers, top_rated: rated, honors });
}
