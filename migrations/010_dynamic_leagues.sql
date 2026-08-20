CREATE TABLE IF NOT EXISTS league_systems (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  logo_url TEXT,
  country TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS league_system_id BIGINT REFERENCES league_systems(id) ON DELETE SET NULL;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS league_system_id BIGINT REFERENCES league_systems(id) ON DELETE SET NULL;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS abbreviation TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS division_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS competitions_format_check;
ALTER TABLE competitions ADD CONSTRAINT competitions_format_check CHECK (format IN ('league','single_elimination','two_leg','group_knockout'));
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS competitions_status_check;
ALTER TABLE competitions ADD CONSTRAINT competitions_status_check CHECK (status IN ('setup','active','completed','archived'));

CREATE INDEX IF NOT EXISTS idx_seasons_league_system ON seasons(league_system_id);
CREATE INDEX IF NOT EXISTS idx_leagues_system_season ON leagues(league_system_id, season_id);

CREATE TABLE IF NOT EXISTS custom_teams (
  id BIGSERIAL PRIMARY KEY,
  owner_key TEXT,
  league_id BIGINT REFERENCES leagues(id) ON DELETE SET NULL,
  season_id BIGINT REFERENCES seasons(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  kit_color TEXT NOT NULL DEFAULT '#05C08A',
  format INT NOT NULL CHECK (format BETWEEN 4 AND 11),
  formation JSONB NOT NULL DEFAULT '{}'::jsonb,
  captain_player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  share_token TEXT NOT NULL UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_team_players (
  id BIGSERIAL PRIMARY KEY,
  custom_team_id BIGINT NOT NULL REFERENCES custom_teams(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'starter' CHECK (role IN ('starter','substitute')),
  slot_index INT,
  assigned_position TEXT,
  player_name_snapshot TEXT NOT NULL,
  club_name_snapshot TEXT,
  club_crest_snapshot TEXT,
  avatar_snapshot TEXT,
  country_snapshot TEXT,
  rating_snapshot NUMERIC(3,1),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(custom_team_id, player_id),
  UNIQUE(custom_team_id, role, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_custom_teams_owner ON custom_teams(owner_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_teams_share ON custom_teams(share_token);
CREATE INDEX IF NOT EXISTS idx_custom_team_players_team ON custom_team_players(custom_team_id);
