-- User achievement titles
CREATE TABLE user_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title_id VARCHAR(100) NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, title_id)
);

CREATE INDEX idx_user_titles_user ON user_titles(user_id);
