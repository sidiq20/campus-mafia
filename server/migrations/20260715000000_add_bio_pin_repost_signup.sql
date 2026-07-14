-- Add bio column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';

-- Add pinned_post_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- Create reposts table
CREATE TABLE IF NOT EXISTS reposts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

-- Create signup_progress table for multi-step registration
CREATE TABLE IF NOT EXISTS signup_progress (
    temp_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}',
    current_step INT NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Index for cleanup of expired signup sessions
CREATE INDEX IF NOT EXISTS idx_signup_progress_expires ON signup_progress(expires_at);
