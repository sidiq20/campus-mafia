-- Daily INF grind limit
ALTER TABLE users ADD COLUMN daily_inf_earned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_inf_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for checking daily resets efficiently
CREATE INDEX idx_users_daily_reset ON users(last_inf_reset);
