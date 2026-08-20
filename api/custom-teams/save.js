import { db } from "hatchable";
import { randomBytes } from "node:crypto";

export const access = "public";
export const methods = ["POST"];

function ownerKey(req) {
  const m = req.member;
  return m && (m.id || m.email || m.handle) ? String(m.id || m.email || m.handle) : null;
}
function json(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

export default async function (req, res) {
  const owner = ownerKey(req);
  if (!owner) return res.status(401).json({ error: "Log in to save or share a custom team." });
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const format = Number(b.format);
  const players = Array.isArray(b.players) ? b.players : [];
  if (!name) return res.status(400).json({ error: "Team name is required." });
  if (!Number.isInteger(format) || format < 4 || format > 11) return res.status(400).json({ error: "Format must be between 4-a-side and 11-a-side." });
  if (players.length < format) return res.status(400).json({ error: `Select ${format} starters for this format.` });
  const starters = players.filter((p) => (p.role || "starter") === "starter");
  if (starters.length !== format) return res.status(400).json({ error: `This format requires exactly ${format} starters.` });
  const ids = players.map((p) => Number(p.player_id));
  if (ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ error: "A player can only appear once in a custom team." });
  const { rows: playerRows } = await db.query(
    `SELECT p.id,p.name,p.avatar_url,p.country,p.position,
            t.id AS team_id,t.name AS team_name,t.crest_url,
            COALESCE((SELECT ROUND(AVG(pr.rating),1) FROM player_ratings pr WHERE pr.player_id=p.id),0) AS rating
     FROM players p LEFT JOIN teams t ON t.id=p.team_id WHERE p.id = ANY($1::bigint[])`, [ids]
  );
  if (playerRows.length !== ids.length) return res.status(400).json({ error: "One or more selected players no longer exists." });
  const byId = Object.fromEntries(playerRows.map((p) => [p.id, p]));
  const captain = b.captain_player_id ? Number(b.captain_player_id) : null;
  if (captain && !starters.some((p) => Number(p.player_id) === captain)) return res.status(400).json({ error: "The captain must be one of the starters." });

  const id = b.id ? Number(b.id) : null;
  let team;
  if (id) {
    const { rows } = await db.query("SELECT * FROM custom_teams WHERE id=$1 AND owner_key=$2", [id, owner]);
    if (!rows[0]) return res.status(404).json({ error: "Custom team not found." });
    const { rows: updated } = await db.query(
      `UPDATE custom_teams SET name=$2,logo_url=$3,kit_color=$4,format=$5,formation=$6::jsonb,captain_player_id=$7,
       league_id=$8,season_id=$9,is_public=$10,updated_at=now() WHERE id=$1 RETURNING *`,
      [id, name, b.logo_url || null, b.kit_color || "#05C08A", format, JSON.stringify(json(b.formation, {})), captain,
        b.league_id ? Number(b.league_id) : null, b.season_id ? Number(b.season_id) : null, b.is_public !== false]
    );
    team = updated[0];
    await db.query("DELETE FROM custom_team_players WHERE custom_team_id=$1", [id]);
  } else {
    const shareToken = randomBytes(18).toString("base64url");
    const { rows } = await db.query(
      `INSERT INTO custom_teams (owner_key,name,logo_url,kit_color,format,formation,captain_player_id,league_id,season_id,is_public,share_token)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,
      [owner, name, b.logo_url || null, b.kit_color || "#05C08A", format, JSON.stringify(json(b.formation, {})), captain,
        b.league_id ? Number(b.league_id) : null, b.season_id ? Number(b.season_id) : null, b.is_public !== false, shareToken]
    );
    team = rows[0];
  }
  await db.transaction(players.map((p) => {
    const current = byId[Number(p.player_id)];
    return {
      sql: `INSERT INTO custom_team_players
            (custom_team_id,player_id,role,slot_index,assigned_position,player_name_snapshot,club_name_snapshot,club_crest_snapshot,avatar_snapshot,country_snapshot,rating_snapshot)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      params: [team.id, current.id, p.role === "substitute" ? "substitute" : "starter", p.slot_index === null || p.slot_index === undefined ? null : Number(p.slot_index),
        p.assigned_position || current.position, current.name, current.team_name || null, current.crest_url || null, current.avatar_url || null, current.country || null, current.rating]
    };
  }));
  res.json({ ...team, share_url: `/#/builder/${team.share_token}` });
}
