import { db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  const member = req.member;
  const owner = member && (member.id || member.email || member.handle);
  if (!owner) return res.status(401).json({ error: "Log in to delete saved teams." });
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "id is required" });
  const { rows } = await db.query("DELETE FROM custom_teams WHERE id=$1 AND owner_key=$2 RETURNING id", [id, String(owner.id || owner.email || owner.handle)]);
  if (!rows[0]) return res.status(404).json({ error: "Custom team not found." });
  res.json({ ok: true });
}
