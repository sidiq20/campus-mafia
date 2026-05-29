-- Add is_anonymous column to posts
ALTER TABLE posts ADD COLUMN is_anonymous BOOLEAN DEFAULT FALSE;

-- Seed more factions
INSERT INTO factions (name, description) VALUES
('Neon Tigers', 'High-speed couriers and digital smugglers'),
('The Architects', 'System admins playing god'),
('Iron Brotherhood', 'Engineering students with heavy machinery'),
('Silicone Valley', 'Tech startup rejects'),
('The Outcasts', 'Unaffiliated wanderers and rogue operators')
ON CONFLICT (name) DO NOTHING;

-- Seed more territories
INSERT INTO territories (name) VALUES
('Server Room A'),
('Rooftop Gardens'),
('Underground Tunnels'),
('Cafeteria'),
('Gymnasium'),
('Dormitory Block C'),
('Main Quad'),
('Observatory'),
('Parking Structure'),
('Boiler Room')
ON CONFLICT (name) DO NOTHING;
