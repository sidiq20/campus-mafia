-- Add faction role for the executive system
-- Roles: 'member' (default), 'executive', 'vice_head', 'head'
ALTER TABLE users ADD COLUMN faction_role VARCHAR(20) DEFAULT 'member';

-- Auto-assign 'head' to the first member of each faction (creator)
UPDATE users u
SET faction_role = 'head'
FROM (
    SELECT DISTINCT ON (faction_id) id, faction_id
    FROM users
    WHERE faction_id IS NOT NULL
    ORDER BY faction_id, created_at ASC
) first_member
WHERE u.id = first_member.id;
