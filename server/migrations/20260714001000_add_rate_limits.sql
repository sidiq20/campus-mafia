CREATE TABLE rate_limits (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    count INT NOT NULL DEFAULT 1,
    banned_until TIMESTAMPTZ,
    PRIMARY KEY (user_id, action_type)
);
