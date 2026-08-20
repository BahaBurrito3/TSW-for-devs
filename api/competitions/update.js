import { db } from "hatchable";
import { COMPETITION_FORMATS } from "../../lib/league-config.js";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: "id is required" });
  if (b.format && !COMPETITION_FORMATS.includes(b.format)) return res.status(400).json({ error: "Invalid competition format." });
  if (b.status && !["setup", "active", "completed", "archived"].includes(b.status)) return res.status(400).json({ error: "Invalid competition status." });
  const { rows } = await db.query(
    `UPDATE competitions SET
       name=COALESCE($2,name), code=COALESCE($3,code), format=COALESCE($4,format), division_scope=$5,
       logo_url=$6, config=COALESCE($7::jsonb,config), start_date=$8, end_date=$9, status=COALESCE($10,status)
     WHERE id=$1 RETURNING *`,
    [b.id, b.name ? String(b.name).trim() : null, b.code ? String(b.code).trim().toUpperCase() : null, b.format || null,
      b.division_scope ?? null, b.logo_url ?? null, b.config ? JSON.stringify(b.config) : null, b.start_date ?? null, b.end_date ?? null, b.status || null]
  );
  if (!rows[0]) return res.status(404).json({ error: "Competition not found." });
  res.json(rows[0]);
}
