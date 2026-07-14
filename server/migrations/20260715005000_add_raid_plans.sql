-- Raid planning system: factions plan attacks on territories with voting/contribution phase

CREATE TABLE IF NOT EXISTS raid_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faction_id UUID NOT NULL REFERENCES factions(id),
    target_territory_id UUID NOT NULL REFERENCES territories(id),
    total_influence INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'completed', 'cancelled')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executes_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS raid_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id UUID NOT NULL REFERENCES raid_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    influence_committed INT NOT NULL,
    voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(raid_id, user_id)
);

-- Index for looking up active raids for a faction
CREATE INDEX IF NOT EXISTS idx_raid_plans_faction_status ON raid_plans(faction_id, status);
