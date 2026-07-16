-- Add description column to group chats
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
