# DepartmentOS (Campus Mafia)

![DepartmentOS Banner](./client/src/app/opengraph-image.png)

**DepartmentOS** is a realtime, cyberpunk-themed social and gaming network built for the underground campus experience. Join a faction, earn influence, hack territories, and communicate via encrypted channels. 

## Features

- **Global Intel Feed**: Broadcast intel, boost posts, and comment in a Twitter-style realtime feed. Support for "Incognito" anonymous drops.
- **Faction System**: Align with one of five syndicates (The Ravens, The Cartel, Ghost Protocol, The Syndicate, 404).
- **Territory Control**: Spend your Influence (INF) to launch cyber-attacks on campus territories (e.g., The Quad, Library Mainframe) and claim them for your faction.
- **Encrypted Comms**: Real-time WebSocket-powered chat rooms with global and faction-specific frequencies.
- **Black Market**: Purchase tactical advantages like DDoS attacks, identity scramblers, and firewall upgrades.
- **PWA Ready**: Installable as a Progressive Web App (PWA) on mobile and desktop for an app-like experience.

## Tech Stack

**Frontend**
- Next.js (App Router)
- React & Tailwind CSS
- React Query (TanStack Query)
- Lucide Icons & Sonner (Toasts)

**Backend**
- Rust & Axum (Web Framework)
- SQLx & PostgreSQL (Database)
- WebSockets for realtime comms
- JWT (Bearer Token) Authentication

## Architecture Highlights

- **Cross-Domain Auth**: Implements a robust `Authorization: Bearer <token>` flow to bypass modern browser cross-domain cookie restrictions (frontend on Vercel, backend on Leapcell).
- **Optimistic UI**: Client-side mutations (posting, chatting) instantly update the UI before the server responds, ensuring a zero-latency feel on mobile networks.
- **Real-Time Synchronization**: WebSockets push global and faction chat updates directly to connected clients.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Rust (cargo)
- PostgreSQL database

### Local Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/sidiq20/campus-mafia.git
   cd campus-mafia
   ```

2. **Backend (Rust API)**
   ```bash
   cd server
   # Create a .env file with DATABASE_URL and JWT_SECRET
   echo "DATABASE_URL=postgres://user:pass@localhost:5432/mafia" > .env
   echo "JWT_SECRET=super_secret_key" >> .env
   
   # Run the server (runs on port 8080 by default)
   cargo run
   ```

3. **Frontend (Next.js)**
   ```bash
   cd client
   npm install
   
   # Create a .env.local file pointing to the backend
   echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
   
   # Run the dev server
   npm run dev
   ```

## Production Deployment
- **Frontend**: Deployed seamlessly on [Vercel](https://vercel.com).
- **Backend**: Deployed on [Leapcell](https://leapcell.io).

*Remember to update the `NEXT_PUBLIC_API_URL` environment variable on Vercel to point to the production backend URL.*
