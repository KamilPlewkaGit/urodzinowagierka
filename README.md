# The Grand Table

The Grand Table is a polished, casino-inspired multiplayer team game. A participant selects one of four teams, receives 100 virtual chips, and opens a live dashboard. A separately authenticated administrator controls SOLENIZANT, The Floor, SPORT, JAKA TO MELODIA?, POJEDYNKI, and FAMILIADA, manages available segments, resets/restarts explicit state, inspects players, sets an exact player balance, and safely deactivates a player.

This repository is intentionally limited to team registration/rejoining, persistent chips and game state, the player dashboard, administrator authentication, player administration, SOLENIZANT, The Floor, SPORT, JAKA TO MELODIA?, POJEDYNKI, and FAMILIADA. It contains no real-money functions or player-submitted answers.

## Architecture

The application is a single Next.js App Router deployment for Vercel. Pages are server-rendered when access must be checked, then hand a safe game snapshot to client components. Route Handlers perform all state-changing work. Neon PostgreSQL is the source of truth for game data, SOLENIZANT stages/scores, and opaque sessions; browser memory is only a display cache.

```text
Browser client
  ├─ POST /api/auth/register ────────► Player validation + INSERT + opaque cookie
  ├─ POST /api/admin/login ─────────► fixed `admin` check + opaque admin cookie
  ├─ GET  /api/game/state (4 sec) ──► Authenticated Neon snapshot (players + chips + game/segment/scores)
  ├─ POST /api/segment/solenizant/* ──► Admin-only stage and scoring writes
  ├─ POST /api/segment/floor/* ───────► Floor team selection, betting, timer and result writes
  ├─ POST /api/segment/familiada ─────► Familiada admin actions, player buzzes and match bets
  ├─ POST /api/admin/game/* ──────────► Admin-only navigation and full reset
  ├─ POST /api/admin/players/* ───────► Admin-only chip adjustment/deactivation
  └─ POST /api/game/start ──────────► Neon-verified admin session + UPDATE game_state
                                       │
                                    Neon PostgreSQL
```

The lightweight four-second polling approach needs no separate WebSocket service and works reliably in a Vercel serverless deployment. The state endpoint is explicitly non-cacheable. Each snapshot reads the stages, scores, rosters, and balances from one consistent database view.

## Panel gracza

Po dołączeniu otwiera się panel pod adresem `/lobby`. Pasek u góry ekranu komputera lub u dołu telefonu pokazuje aktualne saldo **Twoje żetony** i daje dostęp do trzech widoków.

- **Lobby** pokazuje wszystkie cztery drużyny, ich kolory, składy i liczebność, stan gry oraz segment wybrany przez prowadzącego. Puste drużyny pozostają widoczne.
- **Aktualny segment** otwiera segment wybrany przez prowadzącego wraz z dotychczasowym przebiegiem, zakładami i wynikami. Przed startem pokazuje komunikat oczekiwania.
- **Żetony graczy** pokazuje miejsce, pseudonim, drużynę i dokładne saldo każdego aktywnego gracza. Ranking zaczyna się od najwyższego salda, wyróżnia wiersz zalogowanego gracza i pokazuje ułamki z przecinkiem dziesiętnym. Przy równych saldach kolejność wynika z identyfikatorów graczy.

Przełączanie widoków zachowuje formularz aktualnego segmentu i trwające operacje zakładów. Parametr `widok` w adresie przywraca wybrany panel po odświeżeniu i działa z historią przeglądarki. Bez wskazania widoku panel pokazuje lobby przed startem, a aktualny segment w trakcie gry. Dotychczasowy adres gracza `/game` otwiera zakładkę segmentu. Administrator nadal może używać `/game` jako podglądu.

Wszystkie widoki korzystają z jednego odczytu `/api/game/state` co cztery sekundy. Przyjęcie własnego zakładu wywołuje także odczyt od razu. Składy, salda, wypłaty i zmiany prowadzącego pochodzą z bazy Neon i są widoczne po kolejnym udanym odczycie. Krótka przerwa w połączeniu pozostawia ostatnie dostępne dane z komunikatem o ponawianiu synchronizacji. Ponowne dołączenie z tym samym pseudonimem aktywnego gracza przywraca jego drużynę i zapisane saldo.

## Technology stack

- Next.js 16, React 19, TypeScript, App Router
- Tailwind CSS 4 entry point plus purpose-built global CSS for the visual system
- `@neondatabase/serverless` for PostgreSQL access compatible with Neon/Vercel
- Zod for server-side request validation
- Node random tokens stored in Neon, delivered as HttpOnly, SameSite=Lax session cookies

## Project structure

```text
.
├── .env.example                         # Required server-side environment variables
├── .gitignore
├── AGENTS.md                            # Mandatory instructions for coding agents
├── README.md                            # This system overview
├── public/the floor/                        # The Floor ordered JSON and images
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
    │   ├── game-session.tsx + game-session.readme.txt
    │   ├── lobby-client.tsx + lobby-client.readme.txt
    │   ├── registration-form.tsx + registration-form.readme.txt
    │   └── team-selector.tsx + team-selector.readme.txt
    └── lib
        ├── chips.ts + chips.readme.txt
        ├── constants.ts + constants.readme.txt
        ├── database.ts + database.readme.txt
        ├── session.ts + session.readme.txt
        ├── types.ts + types.readme.txt
        └── validation.ts + validation.readme.txt
```

The tree also contains protected `solenizant/*`, `floor/*`, `sport/*`, `melodia/*`, and `pojedynki/*` segment routes with matching `.readme.txt` files, plus `src/lib/solenizant.ts`, `src/lib/floor.ts`, `src/lib/sport.ts`, `src/lib/melodia.ts`, and `src/lib/pojedynki.ts`. The Floor, SPORT, JAKA TO MELODIA?, and POJEDYNKI each add focused player/admin components. Admin game routes support direct segment selection and complete reset; player admin routes support exact chip adjustments and soft removal.

Every source file has a neighboring `.readme.txt` file. Read the focused file documentation before changing a file; it records its responsibility, interface, dependencies, persistence relationship, and extension boundary.

Segment VIII adds `src/app/api/segment/familiada/route.ts`, the server-only `src/lib/familiada.ts` rules and questions, and `src/components/familiada-screen.tsx`, `familiada-admin-controls.tsx` and `familiada.module.css` for the Polish views. Each has its own matching documentation file.

## Modules and responsibilities

| Area | Responsibility |
| --- | --- |
| `src/app` | Routes and server-rendered access gates. |
| `src/app/api` | Server-side registration/rejoining, login, logout, authenticated game synchronization, and protected game, segment, and player-admin transitions. |
| `src/components` | Responsive Polish casino-themed display components, including SOLENIZANT and focused The Floor, SPORT, JAKA TO MELODIA?, POJEDYNKI, and FAMILIADA player/admin views. |
| `src/lib/database.ts` | Neon queries, schema bootstrap/migration, mapping, constraints, rejoining, game/segment/player-admin reads, and authoritative writes and settlement for all segments, including Familiada buzzer arbitration and match wagers. |
| `src/lib/session.ts` | Creation/verification of database-backed opaque HttpOnly session cookies; never imported by client code. |
| `src/lib/validation.ts` | Shared server input schemas for segments, including the Familiada command contract, navigation, exact decimal balance, and player removal. |
| `src/lib/floor-content.ts` | Server-side loader for ordered The Floor content and images from `public/the floor/`. |
| `src/lib/familiada.ts` | Server-only ordered question bank, gameplay transitions and role-specific snapshot projection. |
| `src/lib/chips.ts` / `constants.ts` / `types.ts` / `solenizant.ts` / `floor.ts` / `sport.ts` / `melodia.ts` / `pojedynki.ts` | Decimal chip display helper, stable metadata/contracts, fixed questions, The Floor category metadata and timing, SPORT schedule, music metadata, and four-duel metadata shared by UI and server code. |

## Data model

`database.ts` creates the small initial schema on first use. This keeps a new Neon database deployment simple; as the project gains migrations, replace that bootstrap with versioned migrations while preserving the service API.

### `players`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key; stored in player session payload and normalized to a safe JavaScript number at the server persistence boundary. |
| `nickname` | `VARCHAR(24)` | Required; unique case-insensitively via `LOWER(nickname)` index. |
| `team_id` | `VARCHAR(16)` | Required; database CHECK restricts it to the four team IDs. |
| `tokens` | `NUMERIC(20,4)` | Defaults to 100; non-negative CHECK. Only server-side services may update it. |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()`; roster ordering key. |
| `active` | `BOOLEAN` | Active players are visible and can rejoin; removed players are inactive. |
| `removed_at` | `TIMESTAMPTZ` | Timestamp of a soft removal, otherwise `NULL`. |

Chip balances are represented as server decimal strings in the API snapshot and formatted only for display in clients. The application does not use browser floating-point arithmetic for balances.

### `game_state`

There is exactly one current game row (`id = 1`). It has `status` (`waiting` or `started`), nullable `started_at`, and `active_segment` (`solenizant`, `the-floor`, `sport`, `melodia`, `pojedynki`, or `familiada`). It stores independent segment stages. SPORT has a main-challenge sequence (0–7) and bonus sequence (0–1). Melodia has a song sequence (0–4), a winner and a settlement timestamp. Pojedynki has a duel sequence (0–3). Familiada stores both matches and their rounds in `familiada_state` and rotates the UUID `familiada_revision` on each gameplay change. Switching segments preserves saved progress.

### `solenizant_team_scores`

There is one row for each of the four stable team IDs. `points` starts at zero, is non-negative, and is entirely separate from player `tokens`; each selected team gains exactly one point when the administrator confirms a question.

### `solenizant_question_awards`

Each row is uniquely keyed by question index. Inserting this row, incrementing selected teams, and advancing the stage happen in one SQL statement. This unique record prevents retrying an admin request from awarding a question twice.

### `the_floor_duels`

The Floor has up to six durable category slots (`sequence` 0–5), each with a fixed category ID, stage, two competing team IDs, an active team ID, current item index, both stored team timer bases, a server turn timestamp, winning team, and one-time settlement timestamp. The client derives a smooth display countdown from the stored timer plus timestamp; it never writes elapsed time. Every control action locks the current duel and recalculates time in PostgreSQL using `NOW()`. Migration preserves legacy player-reference columns only to backfill the new team fields; new workflow writes team fields exclusively.

### `the_floor_bets`

Each eligible player can hold at most one bet per duel, targeting exactly one of the two competing teams. Members of either competing team cannot bet. A bet has a fixed `NUMERIC(20,4)` stake of 2 chips, result, payout, and settlement timestamp. The stake is debited only in persisted `betting` stage. The administrator confirms when to close betting and start the duel, including when some or all eligible players pass. Once the administrator stores a winning team, the closed pot is distributed to correct bets; when there are no correct bets all stakes are refunded. Division uses four decimal places, with any remainder assigned to the earliest correct bet so the pot is conserved exactly.

### The Floor: workflow drużynowy

For each category slot, the administrator sees all four teams, chooses the first and second competing side, then confirms the selection to open betting. Active players assigned to the other two teams may bet the fixed 2-chip stake on one of the selected teams. When the administrator confirms the start, the server closes betting and begins the team timer flow, even with an empty pot. When the duel ends, the administrator chooses one of the two teams, confirms the result, and only then can proceed to the next duel. The server validates every transition and guards settlement with a durable timestamp.

### Treści The Floor

Serwer odczytuje pliki JSON rekurencyjnie z katalogu `public/the floor/`. Kolejność pojedynków to **Znajome twarze**, **Lokalne miejsca**, **Loga**, **Czytanie od tyłu**, **Działania** i **Rebusy**. Nowa rozgrywka używa dostępnych zestawów, a panel prowadzącego zgłasza brakujące lub błędne pliki. Kolejność zagadek wynika z tablic w JSON-ie.

Działania i odwrócone wyrazy są wyświetlane jako duży tekst. Grafiki lokalne mają adresy pod `/the%20floor/`, a grafiki osadzone i zewnętrzne są podawane według identyfikatora kategorii i numeru pozycji. Proxy Next.js blokuje publiczny dostęp do źródłowych plików JSON. Wyłącznie zweryfikowana sesja administratora otrzymuje odpowiedź bieżącej pozycji w migawce. Pytanie i odpowiedź aktualizują się razem.

Niezakończony pojedynek wycofanej kategorii przechodzi na Rebusy od pierwszej pozycji, zachowując drużyny, zegary i zakłady. Zakończone pojedynki i rozliczenia pozostają w bazie.

Next.js dołącza materiały do śladów plików potrzebnych na Vercel. Po zmianie danych zrestartuj serwer lokalny lub wdróż nową wersję. Formaty i pliki opisuje [dokumentacja materiałów The Floor](public/the%20floor/README.md).

### SPORT: pairs, player ranks, and challenges

Starting SPORT opens a preparation stage. The administrator selects Pair A and Pair B from all four teams; the four selections must be distinct, so every team belongs to exactly one pair. The order is persistent: the first and second selected team are different sides of that pair. `Zatwierdź drużyny` saves and synchronizes the pairs first. The administrator then ranks every active member of each team. The available ranks are consecutive from 1 through that team's actual player count, each rank is unique, and the setup stays editable until the administrator starts the challenges.

The administrator and players see this Polish instruction during setup: **„Nadajcie rangi swoim zawodnikom od 1 do końca listy zawodników danej drużyny. Dany numer ma znaczenie!”**

The fixed, persisted schedule resolves Pair A/B only after those administrator selections; it never assumes a stable team-vs-team matchup:

| Challenge | Pair and numbered participants | Activity |
| --- | --- | --- |
| 1 | Pair A: first team #1 vs second team #2 | Pompki |
| 2 | Pair B: first team #1 vs second team #1 | Kto dłużej utrzyma ciężar? |
| 3 | Pair A: first team #2 and #3 vs second team #2 and #3 | Odtwórz pozycje z jogi |
| 4 | Pair B: first team #2 and #3 vs second team #2 and #3 | Odtwórz pozycje z jogi |
| 5 | Pair A: first team #4 vs second team #4 | Zdmuchnij kubek przeciwnikowi |
| 6 | Pair B: first team #4 vs second team #4 | Zdmuchnij kubek przeciwnikowi |
| 7 | Pair A: first team #5 vs second team #5 | Siłowanie na rękę |
| 8 | Pair B: first team #5 vs second team #5 | Siłowanie na rękę |

Ranks above 5 are retained and shown to the player, but do not change the fixed schedule. Before opening the first betting phase the server requires a complete ranking for every active player and at least five active ranked players in every team. If a team is too small, the administrator receives a clear Polish validation message instead of a failed challenge transition.

For each main challenge, only active members of the two non-competing teams can bet. Each eligible player may place one 2-chip bet. The administrator confirms the start of the real-world challenge and closes betting with any number of bets. The administrator then selects one of the persisted pair teams and confirms the result. The durable `settled_at` marker prevents duplicate settlement. Correct bettors receive their 2-chip stake plus 2 chips of profit; the profit is debited equally from active members of the losing competing team. Incorrect stakes are distributed equally among active members of the winning competing team. All split calculations are `NUMERIC(20,4)`, with a deterministic remainder, and transfers are saved in `sport_chip_transfers`.

### SPORT: bonus challenges

After all eight main challenges, SPORT opens two bonus rounds. All four teams participate and there is no betting. For each round the administrator sets one limb-count requirement for every team, starts the real-world challenge, selects the winning team, and enters a bounded number of bonus points. The transaction records the result once and adds those points to the winning team's existing `solenizant_team_scores` row; player chip balances are untouched.

### SPORT tables

`sport_pairings` stores Pair A/B and their ordered team sides. `sport_player_numbers` stores every active player's positive rank; its historical column name remains for compatibility, but its former upper limit of 5 is migrated away. `sport_challenges` stores the eight fixed sequences, pair slot, stage, winner, timestamps, and settlement marker. `sport_bets` stores the one eligible-player bet per challenge; `sport_chip_transfers` is the settlement ledger. `sport_bonus_rounds` and `sport_bonus_requirements` persist the two bonus results and per-team limb requirements.

### SPORT synchronization and rendering stability

The application uses the existing non-cacheable four-second polling of `/api/game/state`; it does not create a game WebSocket connection. The former SPORT setup error was a React hydration effect that recreated local pair/rank objects even when polling had returned equivalent persisted data. Repeated render updates could cause the maximum-update-depth loop and make Next.js development HMR report a closing WebSocket. Setup and bonus forms now hydrate only when a stable primitive key derived from persisted data changes, and their setters retain the existing object reference when pairs, ranks, or limb requirements are equal. Unsaved administrator selections are not overwritten by an otherwise identical poll, and the `intro` stage makes no local state update.

### `sessions`

Each login creates one opaque, randomly generated token. The token is held only in an HttpOnly cookie; Neon stores its role, optional player ID, and expiry. A token expires after seven days and is revoked from Neon on logout. This lets every protected page and admin mutation verify the session server-side without `SESSION_SECRET`.

### `chip_adjustments` and `admin_actions`

`chip_adjustments` is the permanent ledger for manual administrator balance changes. Every row stores the player, previous balance, new balance, signed difference, adjustment kind, and timestamp. `admin_actions` records segment navigation/restart, full reset, player balance changes, and player removal. Administrator balance adjustments intentionally may change the total number of virtual chips; they are an explicit party-game exception to transfer-only economic rules.

## Communication and authorization

- Registration normalizes a nickname server-side and first looks for an active case-insensitive match. A match creates a new opaque session for the existing player without changing team or balance; a new nickname validates a team and inserts a 100-chip player.
- Player nickname rejoining is a convenience mechanism, not strong authentication. Anyone who enters an active player's nickname can impersonate that private-party player. Administrator authority remains separate and requires the server-side administrator-password login.
- Soft-removed players are excluded from snapshots, have all player sessions revoked, and cannot reopen their inactive record just by entering the same nickname. The atomic deactivation retains their chip balance, bets, transactions, rankings, and completed history, so foreign keys and chip accounting remain intact while the player leaves every active roster immediately; an empty team remains selectable.
- Player removal accepts the dashboard's `{ playerId }` payload only after server-side administrator verification and positive-safe-ID validation. Neon normally returns `BIGSERIAL`/`int8` values as text; the previous strict `z.number()` check therefore returned 400 for a valid dashboard ID. The persistence boundary now enables numeric int8 parsing and the validator safely accepts only a transient canonical positive-decimal string ID from an already-open older snapshot. Malformed requests are server-logged by ID type and validation code only.
- The browser never sends a chip balance. It receives current balances in a read-only game snapshot.
- The read-only game-state route requires a current opaque session. A removed or expired session receives 401 on its next polling request and the client returns to the landing page.
- Admin login only accepts the fixed password `admin`; the comparison and session creation happen on the server.
- The start-game, all SOLENIZANT handlers, navigation/reset handlers, and player-admin handlers resolve and verify an administrator session in Neon before updating persistent state.
- The Floor team setup, betting lock, timer start, correct/pass, timeout, winner confirmation, next-duel, and restart handlers all require the same verified administrator session. Only a verified player session can place a Floor bet.
- SPORT setup, pair/number persistence, challenge start, winner confirmation, progression, bonus configuration, bonus scoring, and restart handlers require the same verified administrator session. Only a verified active player session can place a SPORT bet, and the server derives that player's eligibility from the two persisted challenge teams.
- JAKA TO MELODIA? team confirmation, song progression, scoring, tie resolution, reward settlement, completion, and restart require a verified administrator session.
- Opening scoring changes only the persisted admin stage; player UI intentionally renders the same question during both `question` and `scoring` stages.
- Confirming a score accepts only a bounded question index and unique team IDs. The server owns the one-point value and atomically prevents duplicate awards.
- A Floor `correct` action moves to the next image and switches the active team. A `pass` moves to the next image, deducts exactly 3 seconds, and intentionally keeps the same team active. Both teams start at 45 seconds; a zero server-calculated clock ends the duel and opens administrator winner selection.
- Floor configuration accepts exactly two distinct stable team IDs. The administrator sees all four teams and selects first and second side; no individual player is configured as a duel participant. Each active player from the other two teams may place one 2-chip bet.
- SPORT configuration accepts two ordered, disjoint team pairs and a complete consecutive ranking of every active roster member. Its schedule uses only saved ranks 1–5 and those pair slots, never hardcoded team IDs. The winner must be one of the current pair teams, and one SQL settlement marks the challenge to prevent duplicate chip transfers or score changes.
- Route pages also verify sessions on the server, so navigating directly to `/admin`, `/lobby`, or `/game` cannot bypass access rules.
- Cookies are HttpOnly, SameSite=Lax, secure in production, and expire after seven days. Their values are random opaque tokens, not role claims.

The administrator password is intentionally `admin` for this private game. Anyone who knows that password can administer the table, so do not use this configuration for an untrusted public deployment.

## Local development

1. Install Node.js 20.9+ (Node 22+ recommended).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and configure:

   ```env
   DATABASE_URL="your-neon-pooled-connection-string"
   ```

   Do not commit `.env.local`.

4. Start the application:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000`. Use any valid nickname and a house to join. Enter `admin` as the nickname to reveal the administrator-password input, then use `admin` as the password.

6. Validate before committing:

   ```bash
   npm run check
   ```

## Deploying to Vercel

1. Create a Neon project and copy its pooled `DATABASE_URL` connection string.
2. Import this Git repository in Vercel. The framework preset is Next.js; build command can remain `npm run build`.
3. Set `DATABASE_URL` for Production (and Preview if needed).
4. Deploy. The first request automatically creates or migrates the required tables, session table, SOLENIZANT score tables, The Floor duel/bet tables, SPORT pair/number/challenge/bet/transfer/bonus tables, JAKA TO MELODIA? song/score/lyric-auction/transfer tables, POJEDYNKI duel/bet tables, Familiada wager table, player-management ledger tables, and initial `game_state` row.
5. Verify a player can register and rejoin with the same normalized nickname, an admin can authenticate, start the game and all available segments, then select two Floor teams, try a 2-chip bet from an eligible remaining-team player, lock betting, run correct/pass team timer actions, select and confirm a winning team, and advance to the next slot. For SPORT, verify two disjoint ordered pairs, dynamic rankings from 1 through each team's player count, the required ranks 1–5, all eight scheduled challenges, only non-competing-team betting, result settlement, two no-bet limb-count bonuses, and team-score updates. For JAKA TO MELODIA?, verify team confirmation, the five numbered rounds, scoring and the optional lyric auction, tie resolution, insufficient-balance handling, and one-time settlement with a conserved chip total. For POJEDYNKI, verify all four team selections, optional 2-chip bets from remaining-team players, betting lock, only-competing-team winner confirmation, one-time settlement, and durable progression. Confirm that an undersized SPORT team gets the Polish validation message and that refreshing does not reset an unsaved, unchanged setup selection. For each betting segment, verify that cancelling the administrator's start confirmation keeps betting open, and that confirming closes it and starts play with zero bets or a partial pool. Check that only submitted bets settle. Also verify that reset restores active players to 100 chips and that the dashboard shows the waiting status.

## Important implementation decisions

- **No separate backend:** Next Route Handlers own sensitive writes and use the same Vercel deployment as the UI.
- **Persistent authoritative state:** Neon stores all player records, virtual chips, game/segment stage, question index, and team scores. React state is disposable.
- **Persistent nickname rejoining:** An active case-insensitive nickname maps to its existing record, team, and exact balance rather than creating a duplicate or allocating another 100 chips. It is deliberately documented as private-party convenience, not authentication.
- **Polling rather than WebSockets:** Four-second snapshot polling updates the player dashboard and administrator views and avoids a separate real-time service.
- **Database-backed sessions, not nicknames:** The nickname `admin` only changes the landing form; administrative authority exists solely after the server checks the fixed `admin` password and creates an opaque Neon session.
- **Schema constraints in addition to validation:** The database itself restricts team IDs, status values, non-negative tokens, the singleton game row, and case-insensitive nicknames.
- **Segment scoring is independent of chips:** SOLENIZANT writes only its team-score rows; player `tokens` are never accepted from the browser or spent by the segment.
- **The Floor is team-versus-team:** The administrator selects two distinct teams, never individual participants. Team IDs, active team, team clocks, winner team, and team bet targets are persisted; legacy player references are only backfilled during migration and are not used by new duels.
- **The Floor timer is server-derived:** Browser clocks are presentation only. Durable team timer bases plus a server timestamp are recalculated and locked for every admin action, preventing the frontend from extending a turn. When a duel ends, the administrator must select and confirm one competing team before settlement.
- **The Floor betting is a closed pot:** A fixed 2-chip stake is debited atomically from each eligible player outside the two competing teams who places a bet and paid only from that duel's pot. A four-place rounding remainder is assigned deterministically, so settlement never creates or loses chips.
- **SPORT pairs and ranks are administrator-controlled:** Pair A and Pair B are saved with ordered sides after the administrator selects all four teams. Every active player receives one persisted consecutive rank from 1 through the size of their team. Eight challenges resolve their participants only from those pair slots and ranks 1–5; no SPORT matchup is tied to a particular team ID.
- **SPORT form synchronization is bounded:** SPORT uses the existing polling architecture rather than application WebSockets. A stable persisted-data key controls one-time form hydration, eliminating the former effect/state dependency cycle, preserving unchanged local selections across polls, and preventing development HMR WebSocket warnings caused by the render loop.
- **SPORT betting reuses authoritative chip handling:** A fixed 2-chip stake is server-debited only from players outside the current pair. Correct bettors receive stake plus a fixed 2-chip profit funded evenly by the losing competing team, while incorrect stakes are distributed evenly to the winning competing team. All decimal remainders are deterministic and the durable transfer ledger plus challenge settlement marker block duplicate payouts.
- **SPORT bonuses affect only scores:** Both all-team limb challenges have persisted requirements, winner, and administrator-entered points. They update the existing team-score table once and never change chips.

## Segment V: JAKA TO MELODIA?

Prowadzący wybiera i zatwierdza wszystkie cztery drużyny, a przycisk **Rozpocznij segment** od razu otwiera **PIOSENKĘ NR 1**. Wszystkie drużyny rywalizują równocześnie w pięciu rundach według zasady „kto pierwszy, ten lepszy”. Muzyka jest odtwarzana poza aplikacją. Ekran graczy pokazuje numer i postęp rundy, punktację czterech drużyn oraz wyniki zapisanych piosenek.

Prowadzący klika **Przejdź do punktacji**, a gracze nadal widzą tę samą piosenkę. Pierwsza odpowiadająca drużyna może zdobyć po 1 punkcie za artystę i tytuł oraz do 5 punktów za wspólne śpiewanie. Pomyłka zeruje wyłącznie punkty za śpiewanie. Opcjonalna licytacja zapisuje drużyny, deklaracje 0–5 wersów, zwycięską drużynę i ocenę wykonania. Zwycięski licytant otrzymuje punkty za wykonanie, a drużyna pierwszej odpowiedzi zachowuje punkty za rozpoznanie. W jednej rundzie można przyznać łącznie maksymalnie 7 punktów. **Zatwierdź punkty** zapisuje wynik raz i aktualizuje tabelę segmentu oraz punktację ogólną. Po rundach 1–4 prowadzący otwiera następną piosenkę. Po rundzie 5 klasyfikacja pojawia się automatycznie.

### Nagroda i rozliczenie

Zwycięzcę wyłaniają punkty Segmentu V. Przy remisie prowadzący zapisuje wybór jednej z drużyn z najwyższym wynikiem. **Zatwierdź rozliczenie żetonów** przyznaje dokładnie 4 żetony każdemu aktywnemu zawodnikowi zwycięskiej drużyny. Pula jest finansowana w równych częściach przez wszystkich aktywnych zawodników pozostałych drużyn. Przy zapisie `NUMERIC(20,4)` niepodzielna reszta jest rozdzielana po 0,0001 żetonu według rosnącego identyfikatora gracza. Przy 5 zwycięzcach i 15 przegranych 5 graczy pokrywa po 1,3334 żetonu, a 10 po 1,3333. Zwycięzcy otrzymują łącznie 20 żetonów i tyle samo jest pobierane z pozostałych sald.

Jeśli brakuje aktywnych zawodników po jednej ze stron albo choć jedno saldo nie pozwala wykonać zaplanowanej operacji, całe rozliczenie pozostaje oczekujące. Prowadzący widzi przyczynę i może ponowić zatwierdzenie po rozwiązaniu problemu. Po zapisaniu rozliczenia przycisk **Zakończ segment** zamyka segment. Końcowa klasyfikacja i kwoty pozostają widoczne. Pasek gracza pokazuje jego aktualne saldo, a zakładki Lobby i Żetony graczy dają dostęp do składu drużyn i pozostałych sald.

### Stan, API i wdrożenie

- `game_state` przechowuje etap (`intro`, `ready`, `song`, `scoring`, `result`, `results`, `completed`), aktualną piosenkę, wskazanego zwycięzcę i znacznik rozliczenia. `melodia_songs`, `melodia_bids` i `melodia_team_scores` przechowują pięć rund, deklaracje wersów i wyniki drużyn.
- Wypłata, potrącenia, zapis poprzedniego i nowego salda dla każdego zawodnika w `melodia_chip_transfers` oraz znacznik rozliczenia powstają w jednej transakcji. Blokada stanu gry, ponowna walidacja lidera i unikatowy klucz piosenki finałowej oraz zawodnika zabezpieczają przed ponowieniem wypłaty. Migawka odświeżana co cztery sekundy pokazuje zakres potrąceń i własną zapisaną zmianę salda.
- Wszystkie zapisy wymagają sesji administratora. Ścieżki `/api/segment/melodia/` obejmują `configure`, `start`, `scoring`, `score`, `next`, `winner`, `settle`, `complete` i `restart`. Akcje dotyczące piosenki przyjmują jej trwały identyfikator.
- Migracja zwraca nierozliczone historyczne obciążenia, zachowuje trwające rundy oraz przenosi wcześniej rozliczone finały jako archiwalne. Restart segmentu czyści jego rundy i odejmuje ich wkład w punktację ogólną. Wykonane transfery pozostają zapisane, również po pełnym resecie gry.

## Segment VI: POJEDYNKI

POJEDYNKI contains exactly four consecutive team-versus-team duels. Before every duel the administrator sees all four teams and chooses two different competing sides; no individual player is selected. Each active player from the other two teams may make one prediction on either competing team. The fixed server-owned stake is **2 virtual chips**.

The persistent flow for each zero-based slot is `setup` → `betting` → `live` → `result`:

1. The administrator confirms two teams, opening betting.
2. Each eligible active player may submit one 2-chip bet. The database derives eligibility from the player session and selected team IDs.
3. The administrator confirms the start of the real-world duel, which locks betting with any number of bets.
4. The administrator chooses one of the competing teams and confirms the result.
5. The closed pot is settled once, then the administrator opens the next slot. After Duel 4 the segment shows a durable summary of all four winners.

`pojedynki_duels` has exactly four sequence rows and stores selected team sides, stage, winner, timestamps, and a `settled_at` guard. `pojedynki_bets` has one row per eligible bettor and duel, with a `NUMERIC(20,4)` 2-chip stake, result, and payout. Correct predictions share the closed pot equally using the established four-decimal deterministic remainder rule; with no correct prediction all current-duel stakes are refunded. No Pojedynki action modifies team scores.

The sixth segment has focused protected routes: administrator-only `start`, `configure`, `start-duel`, `finish`, `next`, `complete`, and `restart`, and player-only `bet` under `/api/segment/pojedynki/*`. All state is returned by the existing non-cacheable four-second snapshot poll. The player screen shows only the player's own wager, never another player's choice. Restarting only this segment refunds pending Pojedynki wagers and clears its four slot rows; it preserves teams, balances outside those pending wagers, completed settlement balances, scores, and all other segment data.
- **Explicit destructive actions:** Reopening or directly navigating to a segment never resets it. Segment restart and full-game reset are separate admin-only endpoints with Polish UI confirmation. Full reset preserves active registrations and teams but restores their balances to 100 and resets game/segment state.
- **Audited manual balances:** An exact chip balance change is server validated, uses `NUMERIC(20,4)`, records before/after/delta atomically, and is the only current operation allowed to add or remove virtual chips from the total.
- **Future expansion seam:** Add a dedicated fixed-question module, focused database service functions, new admin-only Route Handlers, then client components for a future segment. Keep chips and game state mutations server-owned and extend the snapshot contract deliberately.

## Segment VIII – FAMILIADA

### Mecze i zakłady

1. W panelu prowadzącego wybierz cztery różne drużyny i zapisz je jako dwie uporządkowane pary. Puste drużyny również można wybrać. Skład obu meczów można zmieniać do naciśnięcia **Rozpocznij segment**. Każdy mecz ma cztery własne pytania i osobną punktację.
2. Przed pierwszym pytaniem każdego meczu prowadzący otwiera zakłady albo je pomija. Aktywny gracz z jednej z pozostałych drużyn może postawić jeden zakład na zwycięzcę meczu za 2 wirtualne żetony. Prowadzący zamyka zakłady przed przejściem do pytania.
3. Po czterech pytaniach prowadzący potwierdza drużynę z większą liczbą punktów. Przy remisie wskazuje zwycięzcę spośród obu drużyn. Następnie przygotowuje drugi mecz albo kończy segment. Wyniki obu meczów pozostają dostępne w podsumowaniu.
4. Potwierdzenie rozlicza wszystkie zakłady na mecz według zasad SPORT. Trafiony zakład oddaje stawkę i wypłaca 2 żetony zysku finansowane po równo przez aktywnych członków przegranej drużyny. Stawki nietrafionych zakładów trafiają po równo do aktywnych członków wygranej drużyny. Salda mają cztery miejsca po przecinku, a resztę zaokrąglenia otrzymuje lub pokrywa najwcześniej zarejestrowany aktywny członek danej drużyny według daty rejestracji i ID. Jeśli brakuje uczestników potrzebnych do wykonania transferu lub wystarczającego salda, cały zapis wyniku i wypłaty czeka na ponowną próbę. Punkty z pytań są oddzielone od żetonów i punktacji ogólnej.

### Konfrontacja, tablica i punkty

1. Przed każdym pytaniem prowadzący wybiera po jednym aktywnym przedstawicielu obu drużyn. **Rozpocznij pytanie** pokazuje treść i właściwą liczbę ukrytych pól. Po **Aktywuj przyciski** tylko wybrani gracze mają przycisk **ODPOWIADAM!**. Pierwsze zgłoszenie zatwierdzone przez serwer blokuje przyciski i publikuje pseudonim. Przed oceną pierwszej odpowiedzi administrator może wskazać pierwszeństwo ręcznie lub zresetować przyciski. Po resecie można zmienić przedstawicieli.
2. Przedstawiciele odpowiadają ustnie. Pierwsza odpowiedź z pozycji 1 od razu daje prowadzenie jej drużynie. W pozostałych przypadkach drugi przedstawiciel ma jedną próbę. Prowadzi drużyna z wyżej punktowaną poprawną odpowiedzią. Przy dwóch błędach prowadzący ponawia konfrontację albo wskazuje drużynę, która przejmuje prowadzenie.
3. Każdą poprawną odpowiedź prowadzący odsłania w jej zapisanej pozycji. W pytaniu z `N` odpowiedziami pozycja `i` otrzymuje `N − i + 1` punktów. Każda poprawna odpowiedź zasila pulę raz, również podczas konfrontacji. Odsłonięcie całej tablicy daje prowadzącej drużynie pełną pulę.
4. Prowadzący rejestruje błędną lub powtórzoną odpowiedź przyciskiem **BŁĄD – X**. Pierwszy i drugi X pozwalają drużynie kontynuować. Trzeci X daje rywalom jedną próbę przejęcia. Poprawna ukryta odpowiedź powiększa pulę i oddaje ją rywalom. Nieudana próba pokazuje dodatkowy X i oddaje zebraną pulę drużynie prowadzącej. Błędy z konfrontacji rozstrzygają pierwszeństwo odpowiedzi, a trzy X liczą wyłącznie błędy drużyny prowadzącej.
5. Rozstrzygnięcie rundy od razu zapisuje zwycięzcę i jego punkty. Prowadzący może odsłonić pozostałe odpowiedzi pokazowo bez zmiany puli lub wyniku. Tablica czeka na **Następne pytanie** albo przejście do podsumowania po czwartej rundzie. Każde pytanie ma własne błędy, pulę, przedstawicieli i wynik.

### Pytania i klucz odpowiedzi

| Mecz | Pytanie | Odpowiedzi w kolejności z punktami |
| --- | --- | --- |
| 1.1 | Jakie jest najgorsze miejsce, w którym można zostać przyłapanym na kłamstwie? | W kościele (5), W pracy (na rozmowie kwalifikacyjnej) (4), W sądzie (3), W domu (2), Na policji (1) |
| 1.2 | Do czego mężczyźnie najtrudniej przyznać się, że nie jest w tym dobry? | Seks (8), Prowadzenie samochodu / orientacja w terenie (7), Naprawianie rzeczy (6), Sport (5), Gotowanie (4), Finanse (3), Słuchanie innych (2), Sprzątanie (1) |
| 1.3 | Co mogłoby się znaleźć na ziemi pod kolejką górską po przejażdżce? | Pieniądze / portfel (8), Telefon (7), Okulary (6), Czapka / kapelusz (5), Klucze (4), Wymiociny (3), But (2), Sztuczne zęby (1) |
| 1.4 | Zapytaliśmy 100 żonatych mężczyzn: Jaki jest jeden dobry aspekt twojej teściowej? | Jest miła / pozytywna (8), Dobrze gotuje (7), Mieszka daleko (6), Nie żyje (5), Jest cicha (4), Pilnuje wnuków (3), Jest zabawna (2), Jest bogata (1) |
| 2.1 | Jaki obcy akcent udają mężczyźni w barze, żeby poderwać kobietę? | Brytyjski (5), Australijski (4), Francuski (3), Włoski (2), Irlandzki (1) |
| 2.2 | Co skąpy mężczyzna mógłby wyjąć z lodówki i użyć zamiast żelu do włosów? | Majonez (7), Masło / margaryna (6), Olej (5), Galaretka (4), Surowe jajko (3), Bita śmietana (2), Smalec / tłuszcz (1) |
| 2.3 | W co człowiek może się „wsunąć” lub „wpaść”? | W wygodne ubrania / buty (4), W śpiączkę (3), Do wanny / pod prysznic (2), Do łóżka (1) |
| 2.4 | Więcej niż jedno zwierzę to: | Lama (7), Owca (6), Stado (5), Wataha (4), Ławica (3), Gromada (2), Rój (1) |

### Stan, API i wdrożenie

- `POST /api/segment/familiada` przyjmuje `{ revision, command }`. Akcje gracza to `buzz` i `bet`. `configure`, `start`, `open-betting`, `close-betting`, `start-question`, `replace-representatives`, `activate`, `reset-buzzer`, `respondent`, `answer`, `mistake`, `control`, `next`, `confirm-match`, `complete` i `restart` są dostępne wyłącznie dla zweryfikowanej sesji administratora.
- `game_state.familiada_state` przechowuje pary drużyn, osiem pytań i odpowiedzi, fazę, bieżący mecz i pytanie, ujawnione pozycje, przedstawicieli, pierwszeństwo, drużynę prowadzącą, błędy, pulę, rozstrzygnięcia i daty rozliczenia. Wynik meczu jest sumą zapisanych pul wygranych rund. Wspólna blokada wiersza gry i warunek aktualnej rewizji chronią przed akceptacją dwóch naciśnięć, ponowieniem błędu, powtórnym naliczeniem punktów i rozliczeniem tego samego meczu.
- `familiada_bets` zapisuje stawkę, typ, wynik, wypłatę i datę rozliczenia pod unikatowym kluczem meczu i gracza. Zatwierdzenie wyniku, rozliczenie zakładów, transfery i wpis audytu w `admin_actions` zapisują się atomowo. Restart segmentu zwraca oczekujące stawki i czyści stan Familiady. Zaksięgowane transfery pozostają w saldach. Pełny reset dodatkowo przywraca salda aktywnych graczy do 100.
- `GET /api/game/state` synchronizuje wszystkie ekrany co cztery sekundy i publikuje tylko zakład zalogowanego gracza. Dla gracza odpowiedź przed odsłonięciem ma wyłącznie pozycję i pustą wartość. Klucz bieżącego pytania otrzymuje zweryfikowany administrator. Dane pytań znajdują się w module serwerowym. Odświeżenie i nawigacja odczytują trwały postęp.
- Pierwsze żądanie po wdrożeniu automatycznie rozszerza `game_state` i tworzy `familiada_bets`. Po wdrożeniu sprawdź w dwóch przeglądarkach równoczesne użycie przycisków, widoczność odpowiedzi, oba rozstrzygnięcia przejęcia i wyniki zakładów. Sprawdź też powrót przez Lobby i zachowanie tablicy po odświeżeniu.

## Documentation maintenance

Whenever source code changes, update the matching `.readme.txt`; if modules or architecture move, also update this file’s tree and module descriptions. `AGENTS.md` makes this an explicit operating rule for future assistants.
