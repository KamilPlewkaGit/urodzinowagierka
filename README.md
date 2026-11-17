# The Grand Table

The Grand Table is a polished, casino-inspired multiplayer team game. A participant selects one of four houses, receives 100 virtual chips, and waits in a live lobby. A separately authenticated administrator can start the game, moving every connected participant to the initial active-game screen.

This repository is intentionally limited to the first development stage: team registration, persistent chips and game state, the waiting lobby, administrator authentication, and game initialization. It contains no real-money functions, betting, transfers, scoring rules, or additional casino games.

## Architecture

The application is a single Next.js App Router deployment for Vercel. Pages are server-rendered when access must be checked, then hand a safe game snapshot to client components. Route Handlers perform all state-changing work. Neon PostgreSQL is the source of truth; browser memory is only a display cache.

```text
Browser client
  ├─ POST /api/auth/register ────────► Player validation + INSERT + signed cookie
  ├─ POST /api/admin/login ─────────► bcrypt check + signed admin cookie
  ├─ GET  /api/game/state (4 sec) ──► Neon snapshot (players + game_state)
  └─ POST /api/game/start ──────────► Admin-only UPDATE game_state
                                       │
                                    Neon PostgreSQL
```

The lightweight four-second polling approach needs no separate WebSocket service and works reliably in a Vercel serverless deployment. The state endpoint is explicitly non-cacheable.

## Technology stack

- Next.js 16, React 19, TypeScript, App Router
- Tailwind CSS 4 entry point plus purpose-built global CSS for the visual system
- `@neondatabase/serverless` for PostgreSQL access compatible with Neon/Vercel
- Zod for server-side request validation
- bcryptjs for comparing the administrator password with a bcrypt hash
- Node HMAC-SHA256 signed, HttpOnly, SameSite=Lax session cookies

## Project structure

```text
.
├── .env.example                         # Required server-side environment variables
├── .gitignore
├── AGENTS.md                            # Mandatory instructions for coding agents
├── README.md                            # This system overview
├── next.config.ts
├── next.config.readme.txt
├── next-env.d.ts
├── next-env.d.readme.txt
├── package.json
├── postcss.config.mjs
├── postcss.config.readme.txt
├── tsconfig.json
├── tsconfig.readme.txt
└── src
    ├── app
    │   ├── admin/page.tsx + page.readme.txt
    │   ├── api
    │   │   ├── admin/login/route.ts + route.readme.txt
    │   │   ├── auth/register/route.ts + route.readme.txt
    │   │   ├── auth/logout/route.ts + route.readme.txt
    │   │   └── game
    │   │       ├── start/route.ts + route.readme.txt
    │   │       └── state/route.ts + route.readme.txt
    │   ├── game/page.tsx + page.readme.txt
    │   ├── lobby/page.tsx + page.readme.txt
    │   ├── globals.css + globals.readme.txt
    │   ├── layout.tsx + layout.readme.txt
    │   └── page.tsx + page.readme.txt
    ├── components
    │   ├── admin-dashboard.tsx + admin-dashboard.readme.txt
    │   ├── casino-logo.tsx + casino-logo.readme.txt
    │   ├── game-screen.tsx + game-screen.readme.txt
    │   ├── lobby-client.tsx + lobby-client.readme.txt
    │   ├── registration-form.tsx + registration-form.readme.txt
    │   └── team-selector.tsx + team-selector.readme.txt
    └── lib
        ├── constants.ts + constants.readme.txt
        ├── database.ts + database.readme.txt
        ├── session.ts + session.readme.txt
        ├── types.ts + types.readme.txt
        └── validation.ts + validation.readme.txt
```

Every source file has a neighboring `.readme.txt` file. Read the focused file documentation before changing a file; it records its responsibility, interface, dependencies, persistence relationship, and extension boundary.

## Modules and responsibilities

| Area | Responsibility |
| --- | --- |
| `src/app` | Routes and server-rendered access gates. |
| `src/app/api` | Server-side registration, login, logout, game synchronization, and protected start action. |
| `src/components` | Responsive client interactions and casino-themed display components. |
| `src/lib/database.ts` | Neon queries, schema bootstrap, mapping, constraints, and game/player reads/writes. |
| `src/lib/session.ts` | Creation/verification of signed HttpOnly session cookies; never imported by client code. |
| `src/lib/validation.ts` | Shared server input schemas and nickname normalization. |
| `src/lib/constants.ts` / `types.ts` | Stable team metadata and domain contracts shared by UI and server code. |

## Data model

`database.ts` creates the small initial schema on first use. This keeps a new Neon database deployment simple; as the project gains migrations, replace that bootstrap with versioned migrations while preserving the service API.

### `players`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key; stored in player session payload. |
| `nickname` | `VARCHAR(24)` | Required; unique case-insensitively via `LOWER(nickname)` index. |
| `team_id` | `VARCHAR(16)` | Required; database CHECK restricts it to the four team IDs. |
| `tokens` | `INTEGER` | Defaults to 100; non-negative CHECK. Only server-side services may update it. |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()`; roster ordering key. |

### `game_state`

There is exactly one current game row (`id = 1`). It has `status` (`waiting` or `started`) and nullable `started_at`. The fixed-row pattern is intentional for this first single-table game; a future multi-game release can add a `games` table and an explicit `game_id` relation without changing player wallets or session handling.

## Communication and authorization

- Registration validates and normalizes data on the server, rejects reserved `admin`, writes the player, then sets a player cookie.
- The browser never sends a chip balance. It receives current balances in a read-only game snapshot.
- Admin login only accepts a password; the secret bcrypt hash remains in `ADMIN_PASSWORD_HASH` and is never shipped to the browser.
- The start endpoint verifies an administrator session on the server before updating `game_state`.
- Route pages also verify sessions on the server, so navigating directly to `/admin`, `/lobby`, or `/game` cannot bypass access rules.
- Cookies are HttpOnly, SameSite=Lax, signed with `SESSION_SECRET`, secure in production, and expire after seven days.

## Local development

1. Install Node.js 20.9+ (Node 22+ recommended).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and configure:

   ```env
   DATABASE_URL="your-neon-pooled-connection-string"
   SESSION_SECRET="a-random-secret-at-least-32-characters-long"
   ADMIN_PASSWORD_HASH="$2b$12$your-real-bcrypt-hash"
   ```

   Generate the secret and password hash using the commands in `.env.example`. Do not commit `.env.local`.

4. Start the application:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000`. Use any valid nickname and a house to join. Enter `admin` as the nickname to reveal the administrator-password input.

6. Validate before committing:

   ```bash
   npm run check
   ```

## Deploying to Vercel

1. Create a Neon project and copy its pooled `DATABASE_URL` connection string.
2. Import this Git repository in Vercel. The framework preset is Next.js; build command can remain `npm run build`.
3. Set `DATABASE_URL`, `SESSION_SECRET`, and `ADMIN_PASSWORD_HASH` for Production (and Preview if needed). Generate separate secrets for each environment.
4. Deploy. The first request automatically creates the required tables and initial `game_state` row.
5. Verify a player can register, an admin can authenticate, and starting the game changes a lobby browser to `/game` within four seconds.

## Important implementation decisions

- **No separate backend:** Next Route Handlers own sensitive writes and use the same Vercel deployment as the UI.
- **Persistent authoritative state:** Neon stores all player records, virtual chips, and game status. React state is disposable.
- **Polling rather than WebSockets:** Four-second snapshot polling is sufficient for this lobby phase and avoids a separate real-time service.
- **Cookie sessions, not nicknames:** The nickname `admin` only changes the landing form; administrative authority exists solely after server-side bcrypt verification and signed cookie issuance.
- **Schema constraints in addition to validation:** The database itself restricts team IDs, status values, non-negative tokens, the singleton game row, and case-insensitive nicknames.
- **Future expansion seam:** Add round/game services in `src/lib`, new admin-only Route Handlers, then client components. Keep chips and game state mutations server-owned and extend the snapshot contract deliberately.

## Documentation maintenance

Whenever source code changes, update the matching `.readme.txt`; if modules or architecture move, also update this file’s tree and module descriptions. `AGENTS.md` makes this an explicit operating rule for future assistants.
