DROP TABLE IF EXISTS chat_messages CASCADE;

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- 'global' or 'faction'
    channel_id UUID REFERENCES factions(id) ON DELETE CASCADE, -- NULL for global
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_type, channel_id);
