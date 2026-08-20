import { db } from "hatchable";
import { withMediaMany } from "../../lib/media.js";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { share_token, id } = req.query;
  if (!share_token && !id) return res.status(400).json({ error: "share_token or id is required" });
  const member = req.member;
  const owner = member && (member.id || member.email || member.handle);
  const where = share_token
    ? "ct.share_token=$1 AND ct.is_public=true"
    : "ct.id=$1 AND (ct.is_public=true OR ct.owner_key=$2)";
  const values = share_token ? [share_token] : [id, owner ? String(owner.id || owner.email || owner.handle) : ""];
  const { rows: teams } = await db.query(
    `SELECT ct.*,l.name AS division_name,s.name AS season_name FROM custom_teams ct
     LEFT JOIN leagues l ON l.id=ct.league_id LEFT JOIN seasons s ON s.id=ct.season_id WHERE ${where}`,
    values
  );
  if (!teams[0]) return res.status(404).json({ error: "Custom team not found." });
  const { rows } = await db.query(
    `SELECT ctp.*,p.name AS current_player_name,p.avatar_url AS current_avatar_url,p.country AS current_country,
            t.id AS current_team_id,t.name AS current_team_name,t.crest_url AS current_crest_url
     FROM custom_team_players ctp JOIN players p ON p.id=ctp.player_id
     LEFT JOIN teams t ON t.id=p.team_id WHERE ctp.custom_team_id=$1 ORDER BY ctp.role,ctp.slot_index NULLS LAST,ctp.id`,
    [teams[0].id]
  );
  const [team] = await withMediaMany(teams, ["logo_url"]);
  res.json({ team, players: await withMediaMany(rows, ["current_avatar_url", "current_crest_url", "avatar_snapshot", "club_crest_snapshot"]) });
}
