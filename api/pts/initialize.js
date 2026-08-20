import { db } from "hatchable";
import { validateLeagueSetup } from "../../lib/league-config.js";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  let setup;
  try {
    setup = validateLeagueSetup(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const { rows: active } = await db.query("SELECT id FROM seasons WHERE status = 'active' LIMIT 1");
  if (active[0]) return res.status(409).json({ error: "An active season already exists. Archive it before creating another active season." });

  const { rows: systems } = await db.query(
    `INSERT INTO league_systems (name, abbreviation, logo_url, country, description)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [setup.name, setup.abbreviation, setup.logo_url, setup.country, setup.description]
  );
  const system = systems[0];
  const { rows: seasons } = await db.query(
    `INSERT INTO seasons (name, minimum_rating_apps, league_system_id, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [setup.season_name, setup.minimum_rating_apps, system.id, setup.start_date, setup.end_date]
  );
  const season = seasons[0];
  try {
  const divisionRows = [];

  for (let i = 0; i < setup.divisions.length; i += 1) {
    const d = setup.divisions[i];
    const { rows } = await db.query(
      `INSERT INTO leagues
       (name, season, country, format, relegation_spots, promotion_spots, season_id, division_code,
        league_system_id, abbreviation, division_config)
       VALUES ($1,$2,$3,'league',$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING *`,
      [d.name, season.name, setup.country, d.relegation.automatic, d.promotion.automatic,
        season.id, d.abbreviation, system.id, d.abbreviation, JSON.stringify(d)]
    );
    const division = rows[0];
    divisionRows.push(division);
    for (const teamId of d.team_ids) {
      await db.query(
        `INSERT INTO league_teams (league_id, team_id) VALUES ($1,$2)
         ON CONFLICT (league_id, team_id) DO NOTHING`,
        [division.id, teamId]
      );
    }
  }

  const competitionRows = [];
  for (const c of setup.competitions) {
    const code = c.code || c.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toUpperCase();
    const { rows } = await db.query(
      `INSERT INTO competitions
       (season_id,name,code,format,division_scope,logo_url,config,start_date,end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
      [season.id, c.name, code, c.format, c.division_scope, c.logo_url, JSON.stringify(c.config), c.start_date, c.end_date]
    );
    competitionRows.push(rows[0]);
  }

  res.json({
    league_system: system,
    season,
    leagues: divisionRows,
    competitions: competitionRows,
    message: `${setup.name} created with ${divisionRows.length} configurable division${divisionRows.length === 1 ? "" : "s"} and ${competitionRows.length} competition${competitionRows.length === 1 ? "" : "s"}.`
  });
  } catch (error) {
    await db.query("DELETE FROM seasons WHERE id=$1", [season.id]).catch(() => {});
    await db.query("DELETE FROM league_systems WHERE id=$1", [system.id]).catch(() => {});
    throw error;
  }
}
