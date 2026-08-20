import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const member = req.member;
  const owner = member && (member.id || member.email || member.handle);
  if (!owner) return res.status(401).json({ error: "Log in to view saved teams." });
  const { rows } = await db.query(
    `SELECT ct.id,ct.name,ct.format,ct.kit_color,ct.share_token,ct.is_public,ct.updated_at,
            l.name AS division_name,s.name AS season_name,COUNT(ctp.id)::int AS player_count
     FROM custom_teams ct LEFT JOIN custom_team_players ctp ON ctp.custom_team_id=ct.id
     LEFT JOIN leagues l ON l.id=ct.league_id LEFT JOIN seasons s ON s.id=ct.season_id
     WHERE ct.owner_key=$1 GROUP BY ct.id,l.name,s.name ORDER BY ct.updated_at DESC`, [String(owner.id || owner.email || owner.handle)]
  );
  res.json(rows.map((x) => ({ ...x, share_url: `/#/builder/${x.share_token}` })));
}
