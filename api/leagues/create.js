import { db } from "hatchable";
import initialize from "../pts/initialize.js";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  if (Array.isArray(req.body?.divisions)) return initialize(req, res);
  const { name, season, country, format, relegation_spots, promotion_spots } = req.body || {};
  if (!name || !season) return res.status(400).json({ error: "name and season are required" });
  const { rows } = await db.query(
    `INSERT INTO leagues (name, season, country, format, relegation_spots, promotion_spots, division_config)
     VALUES ($1,$2,$3,COALESCE($4,'home_away'),COALESCE($5,3),COALESCE($6,2),$7::jsonb) RETURNING *`,
    [name, season, country || null, format || null, relegation_spots ?? null, promotion_spots ?? null, JSON.stringify({ legacy: true })]
  );
  res.json(rows[0]);
}
