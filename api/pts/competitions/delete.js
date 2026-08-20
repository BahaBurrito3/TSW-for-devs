import { db } from "hatchable";
export const access = "admin";
export const methods = ["POST"];
export default async function(req,res) {
  const { competition_id, confirmation } = req.body || {};
  if (!competition_id || confirmation !== "DELETE") return res.status(400).json({error:"Type DELETE to confirm competition removal."});
  const { rows } = await db.query("SELECT id,name,format,season_id FROM competitions WHERE id=$1",[competition_id]);
  const competition=rows[0];
  if (!competition) return res.status(404).json({error:"Competition not found."});
  if (competition.format === "league") return res.status(400).json({error:"Division competitions are managed by the league setup and cannot be removed individually."});
  await db.query("DELETE FROM cup_ties WHERE competition_id=$1",[competition.id]);
  await db.query("DELETE FROM competition_entries WHERE competition_id=$1",[competition.id]);
  await db.query("DELETE FROM competitions WHERE id=$1",[competition.id]);
  return res.json({message:competition.name+" removed from this season."});
}