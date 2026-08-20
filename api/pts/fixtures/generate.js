import { db } from "hatchable";

export const access = "admin";
export const methods = ["POST"];

function parseConfig(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (e) { return {}; }
  }
  return value;
}

function roundRobin(teamIds, doubleRound) {
  const list = [...teamIds];
  if (list.length % 2) list.push(null);
  const rounds = [];
  for (let r = 0; r < list.length - 1; r += 1) {
    const games = [];
    for (let i = 0; i < list.length / 2; i += 1) {
      const home = list[i];
      const away = list[list.length - 1 - i];
      if (home !== null && away !== null) games.push([home, away]);
    }
    rounds.push(games.map(([home, away], i) => (r % 2 === 0 || i % 2 === 0 ? [home, away] : [away, home])));
    list.splice(1, 0, list.pop());
  }
  return doubleRound ? rounds.concat(rounds.map((round) => round.map(([home, away]) => [away, home]))) : rounds;
}

function customRounds(schedule, teamIds) {
  const allowed = new Set(teamIds.map(String));
  const seen = new Set();
  const grouped = new Map();
  for (const item of schedule) {
    const home = Number(item.home_team_id);
    const away = Number(item.away_team_id);
    const week = Math.max(1, Number(item.matchweek) || 1);
    if (!allowed.has(String(home)) || !allowed.has(String(away)) || home === away) throw new Error("Custom schedule contains an invalid club pairing.");
    const key = `${week}:${Math.min(home, away)}:${Math.max(home, away)}`;
    if (seen.has(key)) throw new Error("Custom schedule contains a duplicate fixture.");
    seen.add(key);
    if (!grouped.has(week)) grouped.set(week, []);
    grouped.get(week).push([home, away]);
  }
  return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([, games]) => games);
}

export default async function (req, res) {
  const { league_id } = req.body || {};
  if (!league_id) return res.status(400).json({ error: "league_id is required" });
  const { rows: leagueRows } = await db.query("SELECT * FROM leagues WHERE id = $1", [league_id]);
  const league = leagueRows[0];
  if (!league) return res.status(404).json({ error: "Division not found." });
  const { rows: teams } = await db.query("SELECT team_id FROM league_teams WHERE league_id = $1 ORDER BY team_id", [league_id]);
  const teamIds = teams.map((x) => x.team_id);
  const config = parseConfig(league.division_config);
  const expected = Number(config.team_count);
  if (expected > 0 && teamIds.length > expected) return res.status(400).json({ error: `This division allows ${expected} clubs, but ${teamIds.length} are assigned.` });
  if (teamIds.length < 2) return res.status(400).json({ error: "Assign at least two clubs before generating fixtures." });
  const { rows: existing } = await db.query("SELECT id FROM matches WHERE league_id = $1 LIMIT 1", [league_id]);
  if (existing[0]) return res.status(409).json({ error: "Fixtures already exist for this division." });

  let rounds;
  try {
    rounds = config.schedule_type === "custom"
      ? customRounds(config.custom_schedule || [], teamIds)
      : roundRobin(teamIds, config.schedule_type === "double_round_robin");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!rounds.length) return res.status(400).json({ error: "The division has no valid schedule to generate." });
  const requestedWeeks = Number(config.gameweeks) || rounds.length;
  if (requestedWeeks < rounds.length) return res.status(400).json({ error: "Configured gameweeks are fewer than the generated schedule requires." });
  const statements = [];
  rounds.forEach((games, r) => games.forEach(([home, away]) => statements.push({
    sql: "INSERT INTO matches (league_id,home_team_id,away_team_id,matchweek,status) VALUES ($1,$2,$3,$4,'pending')",
    params: [league_id, home, away, r + 1]
  })));
  await db.transaction(statements);
  const matchCount = statements.length;
  res.json({ gameweeks: rounds.length, matches: matchCount, message: `${matchCount} fixtures generated across ${rounds.length} gameweek${rounds.length === 1 ? "" : "s"}.` });
}
