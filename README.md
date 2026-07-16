# DepartmentOS: Campus Mafia

![DepartmentOS](client/public/icon-192.png)

**DepartmentOS (Campus Mafia)** is a **cyberpunk-themed real-time social & gaming platform** built for the ultimate campus underground experience. Join factions, earn Influence (INF), hack territories, communicate via encrypted channels, plan raids, place bounties, and climb the ranks — all in real-time with a fully immersive neon UI.

> 🔴 **Live**: [https://campus-mafia.vercel.app](https://campus-mafia.vercel.app)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
- [Deployment](#-deployment)
- [Environment Variables](#-environment-variables)
- [Database](#-database)
- [Project Structure](#-project-structure)

---

## 🎮 Features

### 📡 Social Feed
- **Broadcast intel** — Post to the global feed and earn +10 INF per broadcast
- **Boosts & Reposts** — Amplify other operatives' intel; boosters earn +1 INF
- **Comments** — Reply to broadcasts with threaded support (+2 INF to post owner)
- **Anonymous Mode** — Drop intel incognito; identity hidden from all users
- **@Mentions** — Tag other users with autocomplete suggestions; they get notified in real-time
- **Polls** — Attach polls to broadcasts with 2–6 options
- **Search** — Full-text search across intel and operatives
- **Pin to Profile** — Pin your most important broadcast to your profile

### 🏴 Factions
- **5 pre-defined factions**: The Ravens, The Cartel, Ghost Protocol, The Syndicate, 404
- **Create your own** — Spend 500 INF to found a new syndicate
- **Role hierarchy**: Head → Vice Head → Executive → Member
- **Faction chat** — Private encrypted comms channel
- **Faction leaderboard** — Compete for top influence and territory count

### 🗺️ Territory Control
- **12 campus territories** — e.g., Library Mainframe, Science Lab, The Quad
- **Attack** — Spend INF to lower an enemy territory's defense score
- **Reinforce** — Spend INF to boost your own territory's defense
- **Capture** — Reduce defense to 0 to claim a territory for your faction
- **Map View** — Grid and tactical map views with faction zone coloring

### ⚔️ Raids
- **Plan a raid** — Start a 30-minute planning phase on any enemy territory
- **Join forces** — Faction members can commit INF to the raid pool
- **Auto-execute** — When the timer expires, all committed INF strikes as one attack
- **Cancel & refund** — Creator or faction head can cancel to refund all participants

### 💬 Messaging
- **Direct Messages** — Encrypted 1-on-1 chat with real-time delivery
- **DM Reactions** — React to messages with emoji
- **Reply to messages** — Threaded DM replies
- **Group Chats** — Multi-user group rooms with admin roles
- **P2P Local Chat** — WebRTC-based peer-to-peer messaging for local area networking
- **Faction Comms** — Global and faction-specific communication channels
- **Typing Indicators** — See when someone is typing in real-time

### 🏪 Black Market
- **Cyber Nuke** — Deal 50 instant damage to any territory (500 INF)
- **DDoS Attack** — Lock an enemy faction for 1 hour (300 INF)
- **Firewall Upgrade** — Add +50 defense to your territory (400 INF)
- **Propaganda Boost** — Earn +20 INF per broadcast instead of +10 (250 INF)
- **INF Cap Bypass** — Remove daily INF earning limits (200 INF)
- **Identity Scrambler** — Auto-anonymize all your broadcasts (150 INF)

### 🏆 Rankings & Titles
- **10 player ranks** — From Initiate (0 INF) to Director (100,000+ INF)
- **35+ titles** — Earn titles for achievements like posting, raiding, faction leadership, and more
- **Bounty Hunter status** — Track bounties collected and register as a hunter
- **Leaderboards** — Top INF, top factions, top raiders

### 🎨 UI/UX
- **Cyberpunk theme** — CRT scanlines, neon glow effects, glitch animations
- **6 accent colors** — Hacker Green, Cyber Red, Neon Purple, Electric Blue, Toxic Cyan, Amber
- **PWA support** — Install as a native app; works offline with cached content
- **Service Worker** — Push notifications for DMs and mentions
- **Pull-to-refresh** — Mobile-friendly gesture support
- **Onboarding walkthrough** — Guided tour for new users
- **Pet Cat** — Interactive companion that reacts to in-game activity
- **P2P Scan Animation** — Visual radar for local peer discovery
- **Responsive** — Fully mobile-optimized with bottom navigation bar

---

## 🛠️ Tech Stack

### Frontend (`client/`)
| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) (App Router) | React framework with SSR/SSG |
| [React 19](https://react.dev/) | UI library |
| [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first styling |
| [TanStack Query v5](https://tanstack.com/query) | Server state management & caching |
| [Axum WebSocket](https://github.com/tokio-rs/axum) | Real-time events |
| [WebRTC](https://webrtc.org/) | P2P local messaging |
| [Lucide React](https://lucide.dev/) | Icon library |
| [Sonner](https://sonner.emilkowal.ski/) | Toast notifications |
| [shadcn/ui](https://ui.shadcn.com/) | UI component primitives |

### Backend (`server/`)
| Technology | Purpose |
|---|---|
| [Rust](https://www.rust-lang.org/) (Edition 2024) | Systems programming language |
| [Axum 0.7](https://github.com/tokio-rs/axum) | Async web framework |
| [SQLx 0.8](https://github.com/launchbadge/sqlx) | Async SQL toolkit with compile-time checks |
| [PostgreSQL](https://www.postgresql.org/) | Relational database |
| [Tokio](https://tokio.rs/) | Async runtime |
| [jsonwebtoken](https://github.com/Keats/jsonwebtoken) | JWT authentication |
| [bcrypt](https://github.com/Keats/rust-bcrypt) | Password hashing |
| [Ring](https://github.com/briansmith/ring) | VAPID ECDSA signing for push |
| [Reqwest](https://github.com/seanmonstar/reqwest) | HTTP client for push delivery |

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Browser    │────▶│  Next.js App  │────▶│  Rust API  │
│  (PWA + SW)  │     │  (Vercel)     │     │  (Railway) │
└──────┬───────┘     └──────────────┘     └─────┬──────┘
       │                                        │
       │  WebSocket                             │  PostgreSQL
       │  (/api/ws)                             │  Database
       ├────────────────────────────────────────▶│
       │                                         │
       │  P2P WebSocket                          │
       │  (/api/ws/p2p)                          │
       │  (WebRTC Signaling)                     │
       ├────────────────────────────────────────▶│
```

### Key Design Decisions

- **Bearer Token Auth**: Cross-domain `Authorization: Bearer <JWT>` flow — no cookies, works across different hosting providers for frontend and backend
- **Optimistic UI**: Mutations update the cache instantly before the server responds, giving zero-latency feel on slow networks
- **Real-time via WebSockets**: Game events (territory attacks, raid status, new posts, DMs) broadcast instantly to all connected clients
- **P2P Fallback**: Direct messages first attempt WebRTC P2P delivery, falling back to server relay when offline
- **Multi-device Sync**: State synchronization endpoint for keeping notifications and data consistent across devices

---

## 📡 API Reference

### Base URL
`https://<your-server>/api`

### Authentication
All authenticated endpoints require `Authorization: Bearer <JWT>` header.

### Endpoints

#### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account (email, username, password, display_name, faction_name) |
| POST | `/auth/login` | Login (email, password) → returns JWT |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Get current user profile |
| PUT | `/auth/me` | Update profile (display_name, bio) |
| GET | `/users/:username` | Get user by username |
| GET | `/users/search?q=` | Search users |
| GET | `/users/online` | Get online users (connected to P2P WS) |

#### Posts / Feed
| Method | Path | Description |
|---|---|---|
| GET | `/posts` | List posts (optional `?q=`, `?author_id=`) |
| POST | `/posts` | Create post (+10 INF) |
| GET | `/posts/:id` | Get post by ID |
| DELETE | `/posts/:id` | Delete own post |
| POST | `/posts/:id/react` | Boost post (+1 INF) |
| POST | `/posts/:id/repost` | Repost broadcast |
| POST | `/posts/:id/pin` | Pin post to profile |
| GET | `/profile/broadcasts` | Get user's broadcasts |
| GET | `/profile/boosted` | Get user's boosted posts |
| GET | `/reposts` | Get user's reposts |

#### Comments
| Method | Path | Description |
|---|---|---|
| GET | `/posts/:id/comments` | Get comments on a post |
| POST | `/posts/:id/comments` | Add comment (+2 INF to post owner) |

#### Direct Messages
| Method | Path | Description |
|---|---|---|
| GET | `/chat/direct` | List conversations |
| POST | `/chat/direct` | Send DM |
| GET | `/chat/direct/:username` | Get DM history |
| POST | `/chat/direct/:username/read` | Mark DMs as read |
| GET | `/chat/direct/unread/count` | Get unread DM count |
| POST | `/chat/direct/:username/react` | Add reaction to DM |
| GET | `/chat/direct/:username/reactions` | Get DM reactions |

#### Group Chats
| Method | Path | Description |
|---|---|---|
| GET | `/groups` | List user's groups |
| POST | `/groups` | Create group (name, member_usernames) |
| GET | `/groups/:id` | Get group details (name, description, members) |
| GET | `/groups/:id/members` | List members |
| POST | `/groups/:id/members/add` | Add member (admin only) |
| POST | `/groups/:id/members/:user_id/remove` | Remove member (admin only) |
| POST | `/groups/:id/members/:user_id/promote` | Promote to admin |
| GET | `/groups/:id/messages` | Get messages |
| POST | `/groups/:id/messages` | Send message |
| POST | `/groups/:id/update` | Update name/description (admin only) |

#### Factions
| Method | Path | Description |
|---|---|---|
| GET | `/factions` | List all factions |
| POST | `/factions/create` | Create faction (cost: 500 INF) |
| GET | `/factions/:id` | Get faction details |
| POST | `/factions/:id/join` | Join faction |
| GET | `/factions/:id/members` | List members with roles |
| POST | `/factions/:id/assign-role` | Assign role (head only) |
| POST | `/factions/leave` | Leave faction (5-day cooldown) |

#### Territories
| Method | Path | Description |
|---|---|---|
| GET | `/territories` | List territories with controlling faction & INF |
| POST | `/territories/:id/attack` | Attack/reinforce territory (spend INF) |
| POST | `/territories/:id/plan-raid` | Plan raid (30-min window) |

#### Raids
| Method | Path | Description |
|---|---|---|
| GET | `/raids/planned` | Get active raid plans for user's faction |
| POST | `/raids/:id/join` | Join raid and commit INF |
| POST | `/raids/:id/cancel` | Cancel raid (refunds all INF) |

#### Black Market
| Method | Path | Description |
|---|---|---|
| GET | `/blackmarket/inventory` | List owned items |
| POST | `/blackmarket/purchase` | Buy item (costs INF) |
| POST | `/blackmarket/use` | Deploy item on target |

#### Notifications & Push
| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List notifications |
| POST | `/notifications` | Mark all as read |
| GET | `/notifications/latest` | Get latest notification (for SW) |
| GET | `/push/vapid-public-key` | Get VAPID public key |
| POST | `/push/subscribe` | Subscribe to push |
| POST | `/push/unsubscribe` | Unsubscribe from push |

#### Leaderboards
| Method | Path | Description |
|---|---|---|
| GET | `/leaderboard` | Top players by INF |
| GET | `/leaderboard/factions` | Top factions by INF |
| GET | `/leaderboard/raiders` | Top raiders by INF committed |

#### Bounties
| Method | Path | Description |
|---|---|---|
| GET | `/bounties` | List active bounties |
| POST | `/bounties` | Place bounty |
| POST | `/bounties/:id/collect` | Collect bounty |
| GET | `/bounties/user/:username` | Get total bounties on a user |
| GET | `/bounties/hunter-status` | Get hunter status |

#### Comms
| Method | Path | Description |
|---|---|---|
| GET | `/comms/global` | Get global chat history |
| POST | `/comms/global` | Send global message |
| GET | `/comms/faction/:id` | Get faction chat history |
| POST | `/comms/faction/:id` | Send faction message |

#### Websockets
| Path | Description |
|---|---|
| `/api/ws` | Real-time broadcast channel (posts, territory events, raids, DMs, notifications) |
| `/api/ws/p2p` | WebRTC signaling for P2P connections |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [PostgreSQL](https://www.postgresql.org/) 14+ (or [Railway PostgreSQL](https://railway.app/))
- [Git](https://git-scm.com/)

### 1. Clone & Install

```bash
git clone https://github.com/sidiq20/campus-mafia.git
cd campus-mafia
```

### 2. Backend Setup

```bash
cd server

# Create environment file
cp .env.example .env 2>/dev/null || cat > .env << EOF
DATABASE_URL=postgres://user:password@localhost:5432/campus_mafia
JWT_SECRET=change-this-to-a-random-secret-key
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
EOF

# Run database migrations and start server
cargo run
```

The server starts on `http://0.0.0.0:8080` by default. Configure via `PORT` env var.

### 3. Frontend Setup

```bash
cd client
npm install

# Create environment file
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8080
EOF

# Start dev server
npm run dev
```

The client starts on `http://localhost:3000`.

---

## 🌐 Deployment

### Frontend → Vercel

```bash
cd client
npm run build
# Deploy via Vercel CLI or GitHub integration
```

Set `NEXT_PUBLIC_API_URL` to your production backend URL.

### Backend → Railway (Recommended)

```bash
cd server
railway login
railway init
railway up
```

Railway auto-detects Rust projects via `Cargo.toml` in `server/`. The included `server/railway.toml` configures Nixpacks builder.

**Alternative**: Deploy on any Docker-compatible platform using a `Dockerfile`:

```dockerfile
FROM rust:1.80-slim-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/server .
CMD ["./server"]
```

---

## 🔐 Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | `"secret"` | JWT signing key (change in production!) |
| `PORT` | ❌ | `8080` | HTTP server port |
| `VAPID_PUBLIC_KEY` | ❌ | — | VAPID public key for push notifications |
| `VAPID_PRIVATE_KEY` | ❌ | — | VAPID private key for push notifications |

### Client (`client/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ❌ (defaults to deployed URL) | Backend API URL |

### VAPID Key Generation

```bash
npx web-push generate-vapid-keys
```

---

## 🗄️ Database

### Schema

The database contains **25+ migration files** covering the full schema. Key tables:

| Table | Purpose |
|---|---|
| `users` | User accounts, INF balance, faction membership, reputation, heat level |
| `factions` | Syndicates with influence, member count, territory count |
| `territories` | Campus zones with defense score, controlling faction |
| `posts` | Broadcast intel feed |
| `comments` | Post replies |
| `reactions` | Boosts on posts |
| `reposts` | Shared broadcasts |
| `notifications` | In-app alert queue |
| `direct_messages` | Encrypted 1-on-1 messages |
| `group_chats` | Group chat rooms |
| `group_chat_members` | Room membership with admin roles |
| `group_chat_messages` | Group chat history |
| `raid_plans` | Planned raids with target, timer, total INF |
| `raid_participants` | Users committed to a raid |
| `black_market_inventory` | Player-owned items |
| `active_effects` | Temporary buffs/debuffs (DDoS, propaganda, etc.) |
| `push_subscriptions` | Web push notification endpoints |
| `polls` / `poll_votes` | Attached polls on posts |
| `bounties` | INF bounties on targets |
| `user_titles` | Earned achievement titles |
| `rate_limits` | Rate limit tracking for broadcasts and replies |

---

## 📁 Project Structure

```
campus-mafia/
├── client/                    # Next.js frontend
│   ├── public/
│   │   ├── sw.js              # Service Worker (push + offline cache)
│   │   └── manifest.json      # PWA manifest
│   ├── src/
│   │   ├── app/
│   │   │   ├── feed/          # Global intel feed
│   │   │   ├── chat/          # DMs, group chats, P2P local chat
│   │   │   ├── territory/     # Territory control map
│   │   │   ├── factions/      # Faction management
│   │   │   ├── comms/         # Communication channels
│   │   │   ├── black-market/  # Item shop
│   │   │   ├── bounties/      # Bounty system
│   │   │   ├── heists/        # Raid management
│   │   │   ├── inventory/     # Item deployment
│   │   │   ├── leaderboard/   # Rankings
│   │   │   ├── notifications/ # Alert center
│   │   │   ├── profile/       # User profiles
│   │   │   ├── search/        # Global search
│   │   │   ├── login/         # Authentication
│   │   │   ├── signup/        # Registration wizard
│   │   │   ├── posts/         # Post detail view
│   │   │   ├── layout.tsx     # Root layout with PWA meta
│   │   │   └── providers.tsx  # QueryClient + User provider
│   │   ├── components/
│   │   │   ├── AccentThemePicker.tsx  # Theme color selector
│   │   │   ├── MentionAutocomplete.tsx # @mention with autocomplete
│   │   │   ├── MentionText.tsx        # Renders @mentions as links
│   │   │   ├── DashboardLayout.tsx    # Main app shell (nav, sidebar, WS)
│   │   │   ├── PeerRadar.tsx          # Canvas-based radar for P2P peers
│   │   │   ├── P2PScanAnimation.tsx   # Scanning animation
│   │   │   ├── PetCat.tsx             # Interactive companion
│   │   │   ├── PollCard.tsx           # Poll display
│   │   │   ├── PullToRefresh.tsx      # Mobile refresh gesture
│   │   │   ├── PwaInit.tsx            # Service worker + push setup
│   │   │   ├── PwaInstallBanner.tsx   # PWA install prompt
│   │   │   ├── RankBadge.tsx          # Rank display
│   │   │   ├── TitleBadge.tsx         # Achievement title display
│   │   │   └── ui/                    # shadcn UI primitives
│   │   ├── contexts/
│   │   │   └── UserContext.tsx        # Auth state + user data
│   │   ├── lib/
│   │   │   ├── api.ts                 # Fetch wrapper + JWT management
│   │   │   ├── offline.ts             # IndexedDB queue + WebRTC P2P
│   │   │   ├── useSync.ts             # Multi-device sync
│   │   │   └── utils.ts               # Utility functions
│   │   └── middleware.ts              # Empty (client-side auth)
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   └── package.json
│
├── server/                    # Rust backend
│   ├── migrations/            # SQL migration files
│   ├── src/
│   │   ├── main.rs            # Server entry, routes, CORS
│   │   ├── auth.rs            # Registration, login, JWT, profiles
│   │   ├── social.rs          # Posts, comments, reactions, leaderboards
│   │   ├── game.rs            # Territories, factions, raids, activity
│   │   ├── dm.rs              # Direct messages, reactions, unread count
│   │   ├── group_chats.rs     # Group chat CRUD + messages
│   │   ├── comms.rs           # Global + faction communication channels
│   │   ├── blackmarket.rs     # Item shop, purchase, deployment
│   │   ├── bounties.rs        # Bounty placement, collection, hunter status
│   │   ├── notifications.rs   # Notification CRUD
│   │   ├── push.rs            # VAPID push notification delivery
│   │   ├── ws.rs              # WebSocket game broadcast + P2P signaling
│   │   ├── rank.rs            # Rank calculation
│   │   ├── titles.rs          # Achievement system
│   │   ├── inf_limit.rs       # Daily INF cap enforcement
│   │   ├── rate_limit.rs      # Broadcast/reply rate limiting
│   │   ├── polls.rs           # Poll creation + voting
│   │   ├── sync.rs            # Multi-device state sync
│   │   └── cache.rs           # In-memory cache for territories/factions
│   ├── Cargo.toml
│   └── railway.toml           # Railway deployment config
│
└── README.md                  # This file
```

---

## 🔌 WebSocket Events

### Client receives (broadcast channel `/api/ws`):

| Event Type | Payload | Description |
|---|---|---|
| `NewPost` | `{ author, content }` | New broadcast in global feed |
| `ChatMessage` | `{ author, faction, msg, channel_type, channel_id }` | Global or faction chat message |
| `TypingIndicator` | `{ from_username, target_username, is_typing }` | User typing in DM |
| `NewDirectMessage` | `{ sender_id, sender_username, receiver_username, content, ... }` | Real-time DM delivery |
| `Notification` | `{ from, target_username }` | User-specific alert (DM, mention) |
| `DmReaction` | `{ message_id }` | Reaction added to DM |
| `TerritoryAttacked` | `{ territory_name, attacker_faction, damage }` | Territory under attack |
| `TerritoryCaptured` | `{ territory_name, new_faction }` | Territory claimed by new faction |
| `RaidPlanned` | `{ faction_name, target_territory, planner_name, influence_committed }` | New raid planned |
| `RaidJoined` | `{ faction_name, target_territory, joiner_name, influence_committed }` | Member joined raid |
| `RaidExecuted` | `{ faction_name, target_territory, total_influence, captured }` | Raid executed |
| `GroupChatMessage` | `{ id, group_id, user_id, author_name, display_name, content, created_at }` | New group chat message |

### P2P Signaling (`/api/ws/p2p`):

| Message Type | Direction | Description |
|---|---|---|
| `p2p-peer-available` | Server → Client | Another user is online for P2P |
| `p2p-offer` | Client ↔ Server → Client | WebRTC offer |
| `p2p-answer` | Client ↔ Server → Client | WebRTC answer |
| `p2p-ice-candidate` | Client ↔ Server → Client | ICE candidate for NAT traversal |
| `p2p-request-connect` | Client → Server | Request connection to specific user |
| `p2p-peer-disconnected` | Server → Client | Peer went offline |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m "feat: add amazing feature"`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary. © 2026 DepartmentOS.
