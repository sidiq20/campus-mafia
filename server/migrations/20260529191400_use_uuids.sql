DROP TABLE IF EXISTS territories CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS factions CASCADE;

CREATE TABLE factions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    influence INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    faction_id UUID REFERENCES factions(id),
    reputation INTEGER DEFAULT 0,
    heat_level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    influence_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    controlling_faction_id UUID REFERENCES factions(id),
    defense_score INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial factions
INSERT INTO factions (name, description) VALUES
('The Ravens', 'Intellectuals and strategists'),
('The Cartel', 'Resource hoarders and market manipulators'),
('Ghost Protocol', 'Stealth, intel leaks, and sabotage'),
('The Syndicate', 'Organized power and brute force'),
('404', 'Hackers and chaos agents');

-- Insert initial territories
INSERT INTO territories (name) VALUES
('Library'),
('Lab Block'),
('Faculty Building'),
('Lecture Hall'),
('Student Union');
