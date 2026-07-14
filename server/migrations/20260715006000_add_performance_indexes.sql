-- Performance indexes for frequently queried columns

-- Feed queries: ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id_created_at ON posts(user_id, created_at DESC);

-- Comment counts: COUNT(*) WHERE post_id = $1
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

-- Boost counts: COUNT(*) WHERE post_id = $1 AND reaction_type = 'boost'
CREATE INDEX IF NOT EXISTS idx_reactions_post_id_type ON reactions(post_id, reaction_type);

-- Current user has_boosted check: EXISTS WHERE post_id = $1 AND user_id = $2
CREATE INDEX IF NOT EXISTS idx_reactions_post_id_user_id ON reactions(post_id, user_id);

-- Repost counts: COUNT(*) WHERE post_id = $1
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON reposts(post_id);

-- Current user has_reposted check: EXISTS WHERE post_id = $1 AND user_id = $2
CREATE INDEX IF NOT EXISTS idx_reposts_post_id_user_id ON reposts(post_id, user_id);

-- Chat messages: WHERE channel_type = 'global' ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_type ON chat_messages(channel_type, created_at ASC);

-- Faction chat messages: WHERE channel_type = 'faction' AND channel_id = $1
CREATE INDEX IF NOT EXISTS idx_chat_messages_faction ON chat_messages(channel_type, channel_id, created_at ASC);

-- Direct messages: WHERE sender_id = $1 OR receiver_id = $2 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id, created_at DESC);

-- Notifications: WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- Active effects: WHERE target_type = $1 AND target_id = $2 AND effect_id = $3
CREATE INDEX IF NOT EXISTS idx_active_effects_target ON active_effects(target_type, target_id, effect_id);

-- User lookup by username (frequently used in @mentions and profile links)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- User influence for leaderboard
CREATE INDEX IF NOT EXISTS idx_users_influence ON users(influence DESC);


