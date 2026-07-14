ALTER TABLE users ADD COLUMN display_name VARCHAR(255);
UPDATE users SET display_name = username;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
