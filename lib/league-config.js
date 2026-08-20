export const TIEBREAKERS = [
  "points",
  "goal_difference",
  "goals_scored",
  "head_to_head",
  "playoff"
];

export const SCHEDULE_TYPES = ["single_round_robin", "double_round_robin", "custom"];
export const COMPETITION_FORMATS = ["single_elimination", "two_leg", "group_knockout"];

const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

function normalizePlaces(value) {
  const p = value || {};
  return {
    automatic: Math.max(0, number(p.automatic ?? p.auto_places, 0)),
    playoff: Math.max(0, number(p.playoff ?? p.playoff_places, 0)),
    connected_to: p.connected_to === undefined || p.connected_to === null || p.connected_to === ""
      ? null
      : number(p.connected_to, null),
    playoff_format: ["single_match", "two_legged", "knockout_bracket"].includes(p.playoff_format)
      ? p.playoff_format
      : "single_match",
    extra_time: Boolean(p.extra_time),
    penalties: Boolean(p.penalties),
    automatic_apply: p.automatic_apply !== false
  };
}

export function normalizeDivision(input, index, total) {
  const d = input || {};
  const teamIds = [...new Set((Array.isArray(d.team_ids) ? d.team_ids : []).map(Number).filter(Number.isInteger))];
  const teamCount = Math.max(0, number(d.team_count ?? d.number_of_teams, teamIds.length));
  const scheduleType = SCHEDULE_TYPES.includes(d.schedule_type || d.format)
    ? (d.schedule_type || d.format)
    : "single_round_robin";
  const matchesPerTeam = Math.max(0, number(d.matches_per_team, scheduleType === "double_round_robin" ? Math.max(0, (teamCount - 1) * 2) : Math.max(0, teamCount - 1)));
  const defaultGameweeks = scheduleType === "double_round_robin" ? Math.max(0, (teamCount - 1) * 2) : Math.max(0, teamCount - 1);
  const tiebreakers = [...new Set((Array.isArray(d.tiebreakers) ? d.tiebreakers : ["points", "goal_difference", "goals_scored", "head_to_head"])
    .map(String).filter((x) => TIEBREAKERS.includes(x)))];
  if (!tiebreakers.includes("points")) tiebreakers.unshift("points");
  return {
    name: String(d.name || "").trim(),
    abbreviation: String(d.abbreviation || "").trim(),
    team_count: teamCount,
    team_ids: teamIds,
    matches_per_team: matchesPerTeam,
    schedule_type: scheduleType,
    gameweeks: Math.max(0, number(d.gameweeks, defaultGameweeks)),
    points: {
      win: number(d.points?.win ?? d.points_for_win, 3),
      draw: number(d.points?.draw ?? d.points_for_draw, 1),
      loss: number(d.points?.loss ?? d.points_for_loss, 0)
    },
    tiebreakers,
    promotion: normalizePlaces(d.promotion),
    relegation: normalizePlaces(d.relegation),
    custom_schedule: Array.isArray(d.custom_schedule) ? d.custom_schedule : []
  };
}

export function validateLeagueSetup(body) {
  const b = body || {};
  const name = String(b.name || b.league_name || "").trim();
  const seasonName = String(b.season_name || b.season || "").trim();
  if (!name) throw new Error("League name is required.");
  if (!seasonName) throw new Error("Season name is required.");
  const rawDivisions = Array.isArray(b.divisions) ? b.divisions : [];
  if (!rawDivisions.length) throw new Error("Add at least one division before saving.");
  const divisions = rawDivisions.map((d, i) => normalizeDivision(d, i, rawDivisions.length));
  const errors = [];
  const ids = new Set();
  const assignedTeams = new Set();
  divisions.forEach((d, i) => {
    if (!d.name) errors.push(`Division ${i + 1}: name is required.`);
    if (!d.abbreviation) errors.push(`Division ${i + 1}: abbreviation is required.`);
    if (ids.has(d.abbreviation.toLowerCase())) errors.push(`Division ${i + 1}: abbreviations must be unique.`);
    ids.add(d.abbreviation.toLowerCase());
    if (d.team_ids.length > d.team_count) errors.push(`${d.name}: assigned teams cannot exceed the configured team count.`);
    d.team_ids.forEach((teamId) => { if (assignedTeams.has(String(teamId))) errors.push(`${d.name}: a club cannot be assigned to multiple divisions in one season.`); assignedTeams.add(String(teamId)); });
    if (d.matches_per_team < 0) errors.push(`${d.name}: matches per team cannot be negative.`);
    if (d.gameweeks < 0) errors.push(`${d.name}: gameweeks cannot be negative.`);
    if (d.points.win < 0 || d.points.draw < 0 || d.points.loss < 0) errors.push(`${d.name}: points values cannot be negative.`);
    const rawTies = Array.isArray(rawDivisions[i]?.tiebreakers) ? rawDivisions[i].tiebreakers.map(String) : [];
    const invalidTies = rawTies.filter((tie) => !TIEBREAKERS.includes(tie));
    if (invalidTies.length) errors.push(`${d.name || `Division ${i + 1}`}: unsupported tiebreaker ${invalidTies.join(', ')}.`);
    const promotionTotal = d.promotion.automatic + d.promotion.playoff;
    const relegationTotal = d.relegation.automatic + d.relegation.playoff;
    if (i === 0 && promotionTotal) errors.push(`${d.name}: the highest division cannot have promotion places.`);
    if (i === divisions.length - 1 && relegationTotal) errors.push(`${d.name}: the lowest division cannot have relegation places.`);
    if (promotionTotal > d.team_count) errors.push(`${d.name}: promotion places cannot exceed the number of teams.`);
    if (relegationTotal > d.team_count) errors.push(`${d.name}: relegation places cannot exceed the number of teams.`);
    if (d.promotion.connected_to !== null && (d.promotion.connected_to < 0 || d.promotion.connected_to >= divisions.length || d.promotion.connected_to === i)) errors.push(`${d.name}: promotion must connect to another division.`);
    if (d.relegation.connected_to !== null && (d.relegation.connected_to < 0 || d.relegation.connected_to >= divisions.length || d.relegation.connected_to === i)) errors.push(`${d.name}: relegation must connect to another division.`);
  });
  if (errors.length) throw new Error(errors.join(" "));
  const competitions = (Array.isArray(b.competitions) ? b.competitions : []).map((c) => ({
    name: String(c.name || "").trim(),
    code: String(c.code || "").trim().toUpperCase(),
    logo_url: c.logo_url || null,
    format: COMPETITION_FORMATS.includes(c.format) ? c.format : "single_elimination",
    division_scope: c.division_scope || null,
    start_date: c.start_date || null,
    end_date: c.end_date || null,
    config: c.config || {
      participating_divisions: Array.isArray(c.participating_divisions) ? c.participating_divisions : [],
      team_ids: Array.isArray(c.team_ids) ? c.team_ids.map(Number).filter(Number.isInteger) : [],
      qualification: c.qualification || null,
      groups: number(c.groups, 0),
      teams_per_group: number(c.teams_per_group, 0),
      qualifiers_per_group: number(c.qualifiers_per_group, 0),
      draw: c.draw || "random",
      extra_time: Boolean(c.extra_time),
      penalties: c.penalties !== false,
      forfeit_rules: c.forfeit_rules || null,
      final_format: c.final_format || "single_match"
    }
  })).filter((c) => c.name);
  const competitionErrors = [];
  competitions.forEach((c) => {
    const groups = Number(c.config.groups || 0);
    const teamsPerGroup = Number(c.config.teams_per_group || 0);
    const qualifiers = Number(c.config.qualifiers_per_group || 0);
    if (c.format === "group_knockout" && (groups < 2 || teamsPerGroup < 2 || qualifiers < 1 || qualifiers >= teamsPerGroup)) {
      competitionErrors.push(`${c.name}: group competitions need at least two groups, two teams per group, and fewer qualifiers than teams per group.`);
    }
  });
  if (competitionErrors.length) throw new Error(competitionErrors.join(" "));
  return {
    name,
    abbreviation: String(b.abbreviation || b.league_abbreviation || "").trim() || null,
    logo_url: b.logo_url || null,
    country: b.country || b.region || null,
    description: b.description || null,
    season_name: seasonName,
    start_date: b.start_date || null,
    end_date: b.end_date || null,
    minimum_rating_apps: Math.max(1, number(b.minimum_rating_apps, 3)),
    divisions,
    competitions
  };
}
