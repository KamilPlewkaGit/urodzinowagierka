# The Grand Table

The Grand Table is a polished, casino-inspired multiplayer team game. A participant selects one of four teams, receives 100 virtual chips, and opens a live dashboard. A separately authenticated administrator controls SOLENIZANT, The Floor, SPORT, JAKA TO MELODIA?, POJEDYNKI, FAMILIADA, KTO GRA GRUBO, WYGRAĆ MUSI, ALKOHOLICY, and FINAŁ, manages available segments, resets/restarts explicit state, inspects players, sets an exact player balance, and safely deactivates a player.

The application handles registration and sessions, team points, virtual chips, administrator controls, and the listed segments. It contains no real-money functions or player-submitted answers.

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
  ├─ POST /api/segment/gold-challenge ─► Gold challenge admin actions and player nominations
  ├─ POST /api/segment/alkoholicy ────► Alkoholicy admin actions and player bets
  ├─ POST /api/segment/finale ────────► Admin-only FINAŁ transitions
  ├─ POST /api/admin/game/* ──────────► Admin-only navigation and full reset
  ├─ POST /api/admin/players/* ───────► Admin-only chip adjustment/deactivation
  └─ POST /api/game/start ──────────► Neon-verified admin session + UPDATE game_state
                                       │
                                    Neon PostgreSQL
```

Polling every four seconds, and every second while The Floor is active, needs no separate WebSocket service and works reliably in a Vercel serverless deployment. The state endpoint is explicitly non-cacheable. Each snapshot reads the stages, scores, rosters, and balances from one consistent database view.

## Panel gracza

Po dołączeniu otwiera się panel pod adresem `/lobby`. Pasek u góry ekranu komputera lub u dołu telefonu pokazuje aktualne saldo **Twoje żetony** i daje dostęp do trzech widoków.

- **Lobby** pokazuje wszystkie cztery drużyny, ich kolory, składy i liczebność, stan gry oraz segment wybrany przez prowadzącego. Puste drużyny pozostają widoczne.
- **Segment I**, **Segment II** itd. otwiera segment wybrany przez prowadzącego wraz z dotychczasowym przebiegiem, zakładami i wynikami. Przed startem pokazuje komunikat oczekiwania.
- **Punktacja** pokazuje wspólną klasyfikację czterech drużyn i osobną tabelę **Żetony graczy**, która pokazuje miejsce, pseudonim, drużynę i dokładne saldo każdego aktywnego gracza. Ranking zaczyna się od najwyższego salda, wyróżnia wiersz zalogowanego gracza i pokazuje ułamki z przecinkiem dziesiętnym. Przy równych saldach kolejność wynika z identyfikatorów graczy.

Przełączanie widoków zachowuje formularz aktualnego segmentu i trwające operacje zakładów. Parametr `widok` w adresie przywraca wybrany panel po odświeżeniu i działa z historią przeglądarki. Bez wskazania widoku panel pokazuje lobby przed startem, a aktualny segment w trakcie gry. Dotychczasowy adres gracza `/game` otwiera zakładkę segmentu. Administrator nadal może używać `/game` jako podglądu.

Wszystkie widoki korzystają ze wspólnej migawki `/api/game/state`. Ponadto gracze zgłaszają obecność urządzenia na potrzeby The Floor. Przyjęcie własnego zakładu wywołuje także odczyt od razu. Składy, salda, wypłaty i zmiany prowadzącego pochodzą z bazy Neon i są widoczne po kolejnym udanym odczycie. Krótka przerwa w połączeniu pozostawia ostatnie dostępne dane z komunikatem o ponawianiu synchronizacji. Ponowne dołączenie z tym samym pseudonimem aktywnego gracza przywraca jego drużynę i zapisane saldo.

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

The final segment adds `src/app/api/segment/finale/route.ts`, the server-only `src/lib/finale.ts`, and `src/components/finale-screen.tsx`, `finale-admin-controls.tsx` and `finale.module.css`, each with matching documentation.

The two segments before FINAŁ use `src/app/api/segment/gold-challenge/route.ts` and `src/app/api/segment/alkoholicy/route.ts`, with server rules in `src/lib/gold-challenge.ts` and `src/lib/alkoholicy.ts`. Their player screens, admin controls and CSS modules are in `src/components/` under the same name prefixes. The two player forms share `src/components/segment-command.ts` for submitting an intent and refreshing the snapshot.

## Modules and responsibilities

| Area | Responsibility |
| --- | --- |
| `src/app` | Routes and server-rendered access gates. |
| `src/app/api` | Server-side registration/rejoining, login, logout, authenticated game synchronization, and protected game, segment, and player-admin transitions. |
| `src/components` | Responsive Polish casino-themed player and administrator views for each segment. |
| `src/lib/database.ts` | Neon queries, schema bootstrap/migration, mapping, constraints, rejoining, game/segment/player-admin reads, and authoritative writes and settlement for all segments, including Familiada buzzer arbitration and match wagers. |
| `src/lib/session.ts` | Creation/verification of database-backed opaque HttpOnly session cookies; never imported by client code. |
| `src/lib/validation.ts` | Shared server input schemas for segments, including the Familiada command contract, navigation, exact decimal balance, and player removal. |
| `src/lib/floor-content.ts` | Server-side catalog, content addresses and preload manifest from `public/the floor/`. |
| `src/lib/familiada.ts` | Server-only ordered question bank, gameplay transitions and role-specific snapshot projection. |
| `src/lib/finale.ts` | Server-only qualification rules, four ordered questions, transitions, and answer projection. |
| `src/lib/alkoholicy.ts` / `src/lib/gold-challenge.ts` | Server rules for the two Alkoholicy games and role-specific nomination and reward previews for the gold challenge. |
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

There is exactly one current game row (`id = 1`). It has `status` (`waiting` or `started`), nullable `started_at`, and `active_segment` (`solenizant`, `the-floor`, `sport`, `melodia`, `pojedynki`, `familiada`, `gold-challenge`, `alkoholicy`, or `finale`). It stores independent segment stages. SPORT has a main-challenge sequence (0–7) and bonus sequence (0–1). Melodia has a song sequence (0–4), a winner and a settlement timestamp. Pojedynki has a duel sequence (0–3). Familiada, ALKOHOLICY, the gold challenge and FINAŁ store separate JSONB progress documents with UUID revisions in `game_state`. Switching segments preserves saved progress.

### `solenizant_team_scores`

There is one row for each of the four stable team IDs. `points` starts at zero and is independent of player `tokens`. Each selected team gains exactly one point when the administrator confirms a SOLENIZANT question. The global standings combine this stored balance with the persisted scoring events described below.

### Klasyfikacja ogólna drużyn

Odczyt punktacji dolicza do zapisanych punktów rozliczone zwycięstwa The Floor, po 1 punkcie za rozliczony pojedynek POJEDYNKÓW, zwycięstwo w głównym wyzwaniu SPORT, potwierdzony mecz Familiady i zwycięzcę Najdzielniejszego zawodnika. W Szczęśliwej szóstce dolicza po 1 punkcie za każdy trafiony, rozliczony głos do drużyny zapisanej przy stawce. Bonusy SPORT zachowują liczbę punktów wpisaną przez prowadzącego. Migawka `GET /api/game/state` przekazuje tę samą klasyfikację administratorowi i graczom.

Kluczem wyniku jest zapisany identyfikator pojedynku albo wyzwania, indeks meczu Familiady w bieżącym stanie segmentu, zapis zwycięzcy pierwszej złotej gry albo UUID głosowania i ID gracza. Odczyt obejmuje również wcześniejsze rozliczone wyniki, jeśli ich zapisy nadal istnieją. Ponowne żądanie i nawigacja nie tworzą dodatkowych zapisów punktowych. **Korekta punktacji drużyn** w panelu prowadzącego zastępuje wynik używany przez klasyfikację. Można zmienić zwycięzcę głównego wyzwania lub pojedynku na jednego z uczestników, decyzję o remisie w zakończonym meczu Familiady, przedstawiciela w pierwszej złotej grze lub numer w drugiej. Korekty weryfikują bieżącą rewizję. Zaksięgowane zakłady, zwroty i wypłaty pozostają w saldach.

### `solenizant_question_awards`

Each row is uniquely keyed by question index. Inserting this row, incrementing selected teams, and advancing the stage happen in one SQL statement. This unique record prevents retrying an admin request from awarding a question twice.

### `the_floor_duels`

The Floor has up to seven durable category slots (`sequence` 0–6), each with a fixed category ID, stage, two competing team IDs, an active team ID, a shuffled list of stable item IDs, the current position, both stored team timer bases, a server turn timestamp, winning team, and one-time settlement timestamp. The client derives a smooth display countdown from the stored timer plus timestamp; it never writes elapsed time. Every control action locks the current duel and recalculates time in PostgreSQL using `NOW()`. Migration preserves legacy player-reference columns only to backfill the new team fields; new workflow writes team fields exclusively.

Zatwierdzone i rozliczone zwycięstwo daje drużynie 1 punkt w klasyfikacji ogólnej. Dotyczy to także zapisanych wcześniej rozliczonych pojedynków. Restart The Floor usuwa wyniki i punkty tego segmentu oraz zwraca oczekujące stawki. Zaksięgowane wypłaty pozostają w saldach.

### `the_floor_bets`

Każdy gracz spoza rywalizujących drużyn może postawić jeden zakład za 2 żetony. Zapis zakładu rezerwuje stawkę. **Rozpocznij pojedynek** zamyka zakłady i uruchamia 45-sekundowy zegar pierwszej drużyny. Obie drużyny i ich zegary są widoczne na ekranach graczy. Po poprawnej odpowiedzi zmienia się tura, a **Pas** odbiera 3 sekundy i zostawia turę tej samej drużynie.

### Standardowe rozliczenie zakładów

The Floor, SPORT, POJEDYNKI, Familiada i pojedynki ALKOHOLIKÓW używają wspólnej reguły. Trafiony zakład zwraca stawkę i przynosi 2 żetony zysku. Zysk finansują aktywni członkowie przegranej drużyny. Stawki nietrafione rozdzielamy między aktywnych członków zwycięskiej drużyny. Gdy nikt nie trafi, wszystkie nietrafione stawki trafiają do zwycięskiej drużyny. Kalambury zachowują własną regułę puli i zwrotów.

Podział używa `NUMERIC(20,4)`. Reszty są rozdzielane po 0,0001 żetonu według daty rejestracji i ID. Zapis wyniku, zwolnienie stawek, zmiany sald i audyt następują atomowo pod blokadą stanu gry. Serwer sprawdza, czy suma zmian sald równa się rezerwie stawek. Brak aktywnego składu potrzebnego do transferu albo brak środków blokuje całość. Rozliczenie tego samego wyniku chroni znacznik rozliczenia albo zmiana rewizji stanu.

### Treści i gotowość The Floor

Kategorie to **Znajome twarze**, **Lokalne miejsca**, **Loga**, **Czytanie od tyłu**, **Działania**, **Rebusy** i **Politycy**. Serwer losuje kolejność danego zestawu przy zatwierdzaniu drużyn i zapisuje listę identyfikatorów pojedynku. Wszystkie ekrany widzą to samo pytanie, a odpowiedź pozostaje w zweryfikowanej migawce administratora. Zapisane pojedynki Loga i Lokalnych miejsc zachowują kolejność pozostałych kart po usunięciu pozycji z katalogu. W istniejącym niezakończonym segmencie kategoria Politycy trafia na koniec dostępnych pojedynków.

`GET /api/segment/floor/preload` zwraca wersjonowaną listę unikatowych grafik. Każdy klient wczytuje i dekoduje do czterech naraz. Adresy identyczne z tymi używanymi w grze mają identyfikator skrótu treści i używają pamięci podręcznej przeglądarki. `POST /api/segment/floor/preload` zapisuje obecność karty, postęp i błędy w `floor_device_presence`. Obecność wygasa po 30 sekundach bez raportu. Serwer wpuszcza do pojedynku, gdy urządzenie prowadzącego i wszystkie obecne urządzenia graczy zgłosiły dekodowanie całego aktualnego katalogu. Dołączające urządzenia też rozpoczynają wczytywanie. Panel prowadzącego pokazuje postęp i błędy według kategorii oraz ID pozycji. Ponowienie wczytuje wyłącznie brakujące zasoby.

Szczegóły plików i mapowań opisuje [dokumentacja materiałów The Floor](public/the%20floor/README.md).

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

For each main challenge, only active members of the two non-competing teams can bet. Each eligible player may place one 2-chip bet. The administrator confirms the start of the real-world challenge and closes betting with any number of bets. The administrator then selects one of the persisted pair teams and confirms the result. Each settled victory gives the team one point, including each two-versus-two yoga challenge. The durable `settled_at` marker prevents duplicate settlement. Correct bettors receive their 2-chip stake plus 2 chips of profit funded equally by active members of the losing competing team. Incorrect stakes are distributed equally among active members of the winning competing team. All split calculations are `NUMERIC(20,4)`, with a deterministic remainder, and transfers are saved in `sport_chip_transfers`.

### SPORT: bonus challenges

After all eight main challenges, SPORT opens two bonus rounds. All four teams participate and there is no betting. For each round the administrator sets one limb-count requirement for every team, starts the real-world challenge, selects the winning team, and enters a bounded number of bonus points. The transaction records the result once and adds those points to the winning team's existing `solenizant_team_scores` row; player chip balances are untouched.

### SPORT tables

`sport_pairings` stores Pair A/B and their ordered team sides. `sport_player_numbers` stores every active player's positive rank; its historical column name remains for compatibility, but its former upper limit of 5 is migrated away. `sport_challenges` stores the eight fixed sequences, pair slot, stage, winner, timestamps, and settlement marker. `sport_bets` stores the one eligible-player bet per challenge; `sport_chip_transfers` is the settlement ledger. `sport_bonus_rounds` and `sport_bonus_requirements` persist the two bonus results and per-team limb requirements.

Potwierdzenia `sport/finish` i `sport/bonus-finish` przyjmują `eventId` bieżącej rundy z migawki, a korekta przez `sport/finish` wymaga też `correctionRevision` równej `scoreRevision` wybranego wyzwania. Restart SPORT usuwa punkty z głównych wyzwań wraz z ich wynikami, zwraca oczekujące stawki i zachowuje rozliczone salda oraz przyznane punkty bonusowe.

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
4. Deploy. The first request automatically creates or migrates the required tables, session table, SOLENIZANT score tables, The Floor duel/bet tables, SPORT pair/number/challenge/bet/transfer/bonus tables, JAKA TO MELODIA? song/score/transfer tables, POJEDYNKI duel/bet tables, Familiada and Alkoholicy wager tables, gold challenge nomination and transfer tables, player-management ledger tables, and initial `game_state` row.
5. Verify a player can register and rejoin with the same normalized nickname, an admin can authenticate, start the game and all available segments, then select two Floor teams, try a 2-chip bet from an eligible remaining-team player, lock betting, run correct/pass team timer actions, select and confirm a winning team, and advance to the next slot. For SPORT, verify two disjoint ordered pairs, dynamic rankings from 1 through each team's player count, the required ranks 1–5, all eight scheduled challenges, only non-competing-team betting, result settlement, two no-bet limb-count bonuses, and team-score updates. For JAKA TO MELODIA?, verify team confirmation, the five numbered rounds, artist and title scoring, tie resolution, insufficient-balance handling, and one-time settlement with a conserved chip total. For POJEDYNKI, verify all four team selections, optional 2-chip bets from remaining-team players, betting lock, only-competing-team winner confirmation, one-time settlement, and durable progression. Confirm that an undersized SPORT team gets the Polish validation message and that refreshing does not reset an unsaved, unchanged setup selection. For each betting segment, verify that cancelling the administrator's start confirmation keeps betting open, and that confirming closes it and starts play with zero bets or a partial pool. Check that only submitted bets settle. Also verify that reset restores active players to 100 chips and that the dashboard shows the waiting status.

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
- **The Floor uses team-funded betting:** An eligible player stakes 2 chips. Losing team members fund profits and winning team members receive incorrect stakes.
- **SPORT pairs and ranks are administrator-controlled:** Pair A and Pair B are saved with ordered sides after the administrator selects all four teams. Every active player receives one persisted consecutive rank from 1 through the size of their team. Eight challenges resolve their participants only from those pair slots and ranks 1–5; no SPORT matchup is tied to a particular team ID.
- **SPORT form synchronization is bounded:** SPORT uses the existing polling architecture rather than application WebSockets. A stable persisted-data key controls one-time form hydration, eliminating the former effect/state dependency cycle, preserving unchanged local selections across polls, and preventing development HMR WebSocket warnings caused by the render loop.
- **SPORT betting reuses authoritative chip handling:** A fixed 2-chip stake is server-debited only from players outside the current pair. Correct bettors receive stake plus a fixed 2-chip profit funded evenly by the losing competing team, while incorrect stakes are distributed evenly to the winning competing team. All decimal remainders are deterministic and the durable transfer ledger plus challenge settlement marker block duplicate payouts.
- **SPORT bonuses affect only scores:** Both all-team limb challenges have persisted requirements, winner, and administrator-entered points. They update the existing team-score table once and never change chips.

## Segment V: JAKA TO MELODIA?

Prowadzący potwierdza cztery drużyny i uruchamia pięć kolejnych utworów odtwarzanych poza aplikacją. Wejście prowadzącego w punktację pozostawia graczy na tym samym utworze. Prowadzący wybiera odpowiadającą drużynę i zaznacza poprawnego wykonawcę oraz tytuł, po 1 punkcie za każde rozpoznanie. Maksimum to 2 punkty za utwór i 10 w segmencie. Zatwierdzenie utworu zapisuje punkty w tabeli segmentu i w klasyfikacji ogólnej raz.

Po piątym utworze prowadzący potwierdza lidera. Przy remisie wybiera spośród drużyn na pierwszym miejscu. Każdy aktywny zawodnik pozostałych drużyn wpłaca dokładnie 5 żetonów. Cała pula trafia do aktywnych zawodników zwycięskiej drużyny. Reszta dzielona jest po 0,0001 żetonu według ID. Podgląd zawiera wszystkie transfery. Zmiana składu od podglądu, brak aktywnego składu lub saldo przegranego poniżej 5 blokuje wypłatę.

`POST /api/segment/melodia/winner` potwierdza lidera, a `settle` przyjmuje również uporządkowane ID składu z podglądu. Transakcja blokuje grę i graczy, zatwierdza wynik, znacznik rozliczenia i wpisy `melodia_chip_transfers`. Zaksięgowane wypłaty pozostają archiwalne. Migracja przelicza tylko punktację nadal nierozliczonego segmentu na podstawie zapisanych rozpoznań, zachowując numer utworu i zapisane wyniki rozpoznań.

## Segment VI: POJEDYNKI

POJEDYNKI contains exactly four consecutive team-versus-team duels. Before every duel the administrator sees all four teams and chooses two different competing sides; no individual player is selected. Each active player from the other two teams may make one prediction on either competing team. The fixed server-owned stake is **2 virtual chips**.

The persistent flow for each zero-based slot is `setup` → `betting` → `live` → `result`:

1. The administrator confirms two teams, opening betting.
2. Each eligible active player may submit one 2-chip bet. The database derives eligibility from the player session and selected team IDs.
3. The administrator confirms the start of the real-world duel, which locks betting with any number of bets.
4. The administrator chooses one of the competing teams and confirms the result.
5. The confirmed winner earns one team point and standard chip transfers settle once. The administrator then opens the next slot. After Duel 4 the segment shows a durable summary of all four winners.

`pojedynki_duels` has four sequence slots and stores selected team sides, stage, winner, timestamps, and a `settled_at` guard. Each settled slot contributes one point, so the four duels award at most four points. `pojedynki_bets` has one row per eligible bettor and duel, with a `NUMERIC(20,4)` 2-chip stake, result, and payout. Duel settlement uses the standard team-funded rule.

The sixth segment has focused protected routes: administrator-only `start`, `configure`, `start-duel`, `finish`, `next`, `complete`, and `restart`, and player-only `bet` under `/api/segment/pojedynki/*`. The finish request uses the duel's `eventId` from the snapshot. Corrections also use the duel's `scoreRevision` as `correctionRevision`. The four-second snapshot poll shows each player their own wager. Restart refunds pending Pojedynki wagers and removes its four slot rows and their points. Settled payouts, teams and other segment data are preserved.
- **Explicit destructive actions:** Reopening or directly navigating to a segment never resets it. Segment restart and full-game reset are separate admin-only endpoints with Polish UI confirmation. Full reset preserves active registrations and teams but restores their balances to 100 and resets game/segment state.
- **Audited manual balances:** An exact chip balance change is server validated, uses `NUMERIC(20,4)`, records before/after/delta atomically, and is the only current operation allowed to add or remove virtual chips from the total.
- **Future expansion seam:** Add a dedicated fixed-question module, focused database service functions, new admin-only Route Handlers, then client components for a future segment. Keep chips and game state mutations server-owned and extend the snapshot contract deliberately.

## Segment VIII – FAMILIADA

### Mecze i zakłady

1. W panelu prowadzącego wybierz cztery różne drużyny i zapisz je jako dwie uporządkowane pary. Puste drużyny również można wybrać. Skład obu meczów można zmieniać do naciśnięcia **Rozpocznij segment**. Każdy mecz ma cztery własne pytania i osobną punktację.
2. Przed pierwszym pytaniem każdego meczu prowadzący otwiera zakłady albo je pomija. Aktywny gracz z jednej z pozostałych drużyn może postawić jeden zakład na zwycięzcę meczu za 2 wirtualne żetony. Prowadzący zamyka zakłady przed przejściem do pytania.
3. Po czterech pytaniach prowadzący potwierdza drużynę z większą liczbą punktów. Przy remisie wskazuje zwycięzcę spośród obu drużyn. Dopiero rozliczony mecz daje zwycięzcy 1 punkt w klasyfikacji ogólnej. Następnie prowadzący przygotowuje drugi mecz albo kończy segment. Wyniki obu meczów pozostają dostępne w podsumowaniu.
4. Potwierdzenie rozlicza wszystkie zakłady na mecz według zasad SPORT. Trafiony zakład oddaje stawkę i wypłaca 2 żetony zysku finansowane po równo przez aktywnych członków przegranej drużyny. Stawki nietrafionych zakładów trafiają po równo do aktywnych członków wygranej drużyny. Salda mają cztery miejsca po przecinku. Reszta jest rozdzielana po 0,0001 żetonu według daty rejestracji i ID. Jeśli brakuje uczestników potrzebnych do wykonania transferu lub wystarczającego salda, cały zapis wyniku i wypłaty czeka na ponowną próbę. Punkty z pytań są oddzielone od żetonów i punktacji ogólnej.

### Konfrontacja, tablica i punkty

1. Przed każdym pytaniem prowadzący wybiera po jednym aktywnym przedstawicielu obu drużyn. **Rozpocznij pytanie** pokazuje treść i właściwą liczbę ukrytych pól. Po **Aktywuj przyciski** tylko wybrani gracze mają przycisk **ODPOWIADAM!**. Pierwsze zgłoszenie zatwierdzone przez serwer blokuje przyciski i publikuje pseudonim. Przed oceną pierwszej odpowiedzi administrator może wskazać pierwszeństwo ręcznie lub zresetować przyciski. Po resecie można zmienić przedstawicieli.
2. Przedstawiciele odpowiadają ustnie. Pierwsza odpowiedź z pozycji 1 od razu daje prowadzenie jej drużynie. W pozostałych przypadkach drugi przedstawiciel ma jedną próbę. Prowadzi drużyna z wyżej punktowaną poprawną odpowiedzią. Przy dwóch błędach prowadzący ponawia konfrontację albo wskazuje drużynę, która przejmuje prowadzenie.
3. Każdą poprawną odpowiedź prowadzący odsłania w jej zapisanej pozycji. W pytaniu z `N` odpowiedziami pozycja `i` otrzymuje `N − i + 1` punktów. Każda poprawna odpowiedź zasila pulę raz, również podczas konfrontacji. Odsłonięcie całej tablicy daje prowadzącej drużynie pełną pulę.
4. Po konfrontacji obie drużyny widzą jeden wspólny licznik trzech błędów na pytanie. Prowadzący rejestruje błędną lub powtórzoną odpowiedź przyciskiem **BŁĄD – X**. Po trzecim X rywale mają jedną próbę przejęcia puli. Poprawna ukryta odpowiedź powiększa pulę i daje im wygraną w rundzie. Po błędzie pulę zdobywa drużyna prowadząca.
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

- `POST /api/segment/familiada` przyjmuje `{ revision, command }`. Akcje gracza to `buzz` i `bet`. `configure`, `start`, `open-betting`, `close-betting`, `start-question`, `replace-representatives`, `activate`, `reset-buzzer`, `respondent`, `answer`, `mistake`, `control`, `next`, `confirm-match`, `correct-match`, `complete` i `restart` są dostępne wyłącznie dla zweryfikowanej sesji administratora. `correct-match` przyjmuje indeks meczu `matchIndex` (0 albo 1) i `teamId` w celu korekty rozstrzygnięcia remisu.
- `game_state.familiada_state` przechowuje pary drużyn, osiem pytań i odpowiedzi, fazę, bieżący mecz i pytanie, ujawnione pozycje, przedstawicieli, pierwszeństwo, drużynę prowadzącą, błędy, pulę, rozstrzygnięcia i daty rozliczenia. Wynik meczu jest sumą zapisanych pul wygranych rund. Wspólna blokada wiersza gry i warunek aktualnej rewizji chronią przed akceptacją dwóch naciśnięć, ponowieniem błędu, powtórnym naliczeniem punktów i rozliczeniem tego samego meczu.
- `familiada_bets` zapisuje stawkę, typ, wynik, wypłatę i datę rozliczenia pod unikatowym kluczem meczu i gracza. Zatwierdzenie wyniku, rozliczenie zakładów, transfery i wpis audytu w `admin_actions` zapisują się atomowo. Restart segmentu zwraca oczekujące stawki i czyści stan Familiady. Zaksięgowane transfery pozostają w saldach. Pełny reset dodatkowo przywraca salda aktywnych graczy do 100.
- `GET /api/game/state` synchronizuje wszystkie ekrany co cztery sekundy i publikuje tylko zakład zalogowanego gracza. Dla gracza odpowiedź przed odsłonięciem ma wyłącznie pozycję i pustą wartość. Klucz bieżącego pytania otrzymuje zweryfikowany administrator. Dane pytań znajdują się w module serwerowym. Odświeżenie i nawigacja odczytują trwały postęp.
- `round.strikes` w migawce zawiera wspólny licznik od 0 do 3. Przy odczycie wcześniejszych zapisów liczniki drużyn są sumowane do maksymalnie trzech, a zapisane wyniki rund są zachowane.
- Pierwsze żądanie po wdrożeniu automatycznie rozszerza `game_state` i tworzy `familiada_bets`. Po wdrożeniu sprawdź w dwóch przeglądarkach równoczesne użycie przycisków, widoczność odpowiedzi, oba rozstrzygnięcia przejęcia i wyniki zakładów. Sprawdź też powrót przez Lobby i zachowanie tablicy po odświeżeniu.

## KTO GRA GRUBO, WYGRAĆ MUSI

**Gra 1 – Najdzielniejszy zawodnik.** Prowadzący wybiera od dwóch do czterech drużyn, gracze nominują po jednej osobie ze swojej drużyny, a prowadzący potwierdza przedstawicieli. Po podglądzie wpłat start pobiera 10 żetonów od każdego aktywnego członka wybranych drużyn, także od przyszłych zwycięzców. Pula i skład zostają zapisane przed fizycznym wyzwaniem. Po zatwierdzeniu zwycięskiego przedstawiciela jego drużyna otrzymuje 1 punkt w klasyfikacji ogólnej. Cała pula trafia do członków jego drużyny z zapisanego składu. Przy 20 wpłatach i pięciu zwycięzcach jest to 40 żetonów brutto i 30 zysku na zwycięzcę. Następnie **Przejdź do gry nr 2** otwiera drugą grę.

**Gra 2 – Szczęśliwa szóstka.** Każdy aktywny gracz może potwierdzić jeden numer od 1 do 6 za 10 żetonów. Głos jest zapisany jednokrotnie. Przed zamknięciem prowadzący widzi status głosowania i wielkość rezerwy. Po zamknięciu widzi też liczebności według numeru. Prowadzący wybiera i potwierdza poprawny numer, po czym osobno zatwierdza wypłatę i ujawnienie wyniku. Przy ujawnieniu każdy trafiony głos daje 1 punkt drużynie głosującego. Trafione głosy odzyskują stawki i dzielą wszystkie nietrafione stawki. Przy braku trafień wszyscy odzyskują pełne stawki, a drużyny dostają zero punktów. Wtedy można zakończyć segment albo jawnie otworzyć nową rundę, która zastępuje poprzednią w klasyfikacji.

Polecenia administratora `correct-winner` z `playerId` i `correct-number` z `number` korzystają z bieżącej rewizji `/api/segment/gold-challenge`. Zapis korekty zastępuje podstawę punktacji. W drugiej grze klasyfikacja przelicza głosy z tej samej rundy według skorygowanego numeru.

Obie gry zapisują rezerwę w `gold_stakes` według rundy i gracza. Pobrania i wypłaty trafiają do `gold_chip_transfers`. Blokada gry, rewizja i klucz rundy uniemożliwiają ponowne pobranie lub wypłatę. Dzielenie używa czterech miejsc po przecinku i rozdziela resztę według ID. Złożone głosy i uprawnienia do puli przetrwają rozłączenie. Przed ujawnieniem migawka gracza podaje tylko jego głos. Rozliczone wcześniej pierwsze wyzwanie można kontynuować od gry nr 2 z zachowaniem historycznych wypłat.

## ALKOHOLICY

Przedostatni segment, bezpośrednio przed **FINAŁEM**, składa się z dokładnie dwóch gier. Ekran powitalny wyświetla **ALKOHOLICY**, „Baw się dobrze!”, **Gra 1 – Kalambury** oraz **Gra 2 – Pojedynki**. Prowadzący rozpoczyna segment w panelu administratora. Cała aktywność odbywa się poza aplikacją.

### Gra 1 – Kalambury

1. Prowadzący zapisuje kolejność wszystkich czterech drużyn, również pustych. Każda drużyna ma jeden występ. Zawodnik pokazuje hasła swojej drużynie z wódką w ustach. Połknięcie alkoholu kończy występ. Limit zabawy poza aplikacją to trzy minuty. Każde odgadnięte hasło daje jeden punkt, maksymalnie sześć. Plansza pokazuje wyłącznie opis zasad, kolejność, aktywną drużynę i wyniki. Aplikacja nie odmierza czasu, nie dostarcza haseł i nie sprawdza przebiegu występu.
2. Przed pierwszym występem prowadzący może otworzyć opcjonalne zakłady lub rozpocząć grę od razu. Za 2 wirtualne żetony aktywny gracz może raz wytypować jedną z trzech pozostałych drużyn. Rozpoczęcie Kalamburów zamyka zakłady.
3. **Przyznaj punkty** zapisuje wynik 0–6 i dolicza go do punktacji ogólnej. Każdy występ podlega jednemu zatwierdzeniu. Przed rozliczeniem można skorygować zapisany wynik, a klasyfikacja zmienia się tylko o różnicę. Po ostatnim występie prowadzący przegląda tabelę **WYNIKI – KALAMBURY** i zatwierdza rozliczenie.
4. Wygrywa drużyna z największym wynikiem w Kalamburach. Przy remisie na pierwszym miejscu wszyscy obstawiający otrzymują zwrot pełnej stawki i nie ma dodatkowych transferów. Przy jednym zwycięzcy zamkniętą pulę dzielą trafione zakłady. Reszta przy podziale do czterech miejsc trafia do najwcześniej zapisanego trafionego zakładu. Jeżeli nikt nie trafił, istniejąca reguła zamkniętej puli zwraca stawki. Wyniki pokazują klasyfikację, zwycięzcę lub remis, podsumowanie zakładów i aktualne salda. **Przejdź do gry nr 2** jest dostępne po rozliczeniu.

### Gra 2 – Pojedynki

Prowadzący osobno wybiera dwie różne drużyny przed każdym z dwóch pojedynków. Można wybrać pustą drużynę lub powtórzyć drużynę w obu pojedynkach. Otwarcie zakładów blokuje zmianę składu. Gracze spoza pary mogą postawić po 2 żetony. Po fizycznym pojedynku prowadzący wybiera i zatwierdza zwycięzcę. Transakcja stosuje standardowe rozliczenie zakładów. Za wygranie pojedynku przyznaje się wyłącznie wynik pojedynku, a do klasyfikacji ogólnej trafiają punkty Kalamburów.

**Przejdź do pojedynku nr 2** pojawia się po rozliczeniu pierwszej pary, a **Zakończ segment** po rozliczeniu drugiej. `alkoholicy_state` przechowuje indeks pojedynku i wyniki obu par. `alkoholicy_bets` ma niezależne rynki 1 dla Kalamburów, 2 dla pojedynku nr 1, 3 dla pojedynku nr 2. Odświeżenie przywraca etap. Wcześniej rozliczony pojedynczy pojedynek zachowuje wynik i wypłaty jako pojedynek nr 1.

## FINAŁ

### Kwalifikacja

Prowadzący otwiera **FINAŁ** po segmencie ALKOHOLICY przez dotychczasową nawigację segmentów. Klasyfikacja wyświetla wszystkie cztery drużyny według punktacji ogólnej z `GameSnapshot.teamScores`.

Serwer proponuje dwie najlepsze drużyny. Przy remisie na granicy awansu prowadzący wybiera spośród drużyn z wynikiem dającym awans. Jeżeli remis dotyczy pierwszego miejsca, prowadzący wybiera też, która z uprawnionych drużyn zaczyna. Kolejność w tabeli przy remisie służy wyłącznie do prezentacji. **Zatwierdź finalistów** zapisuje parę, kolejność i punktację. Zmiana klasyfikacji przed startem wymaga ponownego potwierdzenia. Po **Rozpocznij finał** zapisana para i kolejność obowiązują przez wszystkie cztery pytania.

### Szacowanie i przebieg

1. **PYTANIE NR X** pokazuje treść pytania i finalistów. Drużyna z wyższą punktacją podaje szacunek ustnie, a prowadzący go zatwierdza. Przy remisie rozpoczyna drużyna wskazana przy kwalifikacji. Procenty i lata można zapisać z przecinkiem lub kropką, a liczbę osób podaje się w pełnych jednostkach.
2. Druga drużyna wybiera **WIĘCEJ** albo **MNIEJ**, a prowadzący zapisuje ten wybór. Szacunek i kierunek pojawiają się na wszystkich ekranach. **Pokaż odpowiedź** jest dostępne po zapisaniu obu zgłoszeń.
3. **POPRAWNA ODPOWIEDŹ** wyświetla wartość z klucza. Prowadzący ocenia, czy bliżej prawdy był szacunek lub wskazany kierunek, ręcznie wybiera jednego z finalistów i klika **Zatwierdź zwycięzcę**. Zapisany zwycięzca pojawia się na ekranie odpowiedzi.
4. **Pokaż koło fortuny** otwiera ekran **KOŁO FORTUNY**, podaje nazwę zwycięskiej drużyny i wyświetla „Czas zakręcić kołem fortuny!”. Po zakręceniu fizycznym kołem prowadzący wpisuje nieujemną całkowitą liczbę punktów i klika **Przyznaj punkty**. Serwer zapisuje nagrodę do punktacji ogólnej. Żetony graczy są odrębne.
5. **Następne pytanie** jest dostępne po potwierdzeniu punktów. Korektę obecnej nagrody albo wcześniejszej nagrody w podsumowaniu zapisuje się jako różnicę. Po czwartym kole podsumowanie pokazuje ranking wszystkich drużyn. Przy remisie prowadzący wskazuje jednego z liderów. Plansza **ZWYCIĘZCA GRY** wyróżnia zwycięzcę. **Zakończ grę** zapisuje ukończenie i pozostawia podsumowanie, wyniki poprzednich segmentów, punkty i żetony. Lobby pokazuje zakończenie gry. Prowadzący zachowuje dostęp do nawigacji i historii.

### Pytania i klucz organizatora

| Nr | Pytanie | Poprawna odpowiedź |
| --- | --- | --- |
| 1 | Ile procent kobiet w wieku produkcyjnym (tj. 18–60 lat) nie pracuje? | 20,3% |
| 2 | Ilu Polaków nosi nazwisko Plewka? | 1483 |
| 3 | Ilu Polaków zginęło podczas II wojny światowej? | 5,9 mln |
| 4 | Ile lat średnio trwa małżeństwo przed rozwodem? | 15 lat |

### Synchronizacja i trwałość

- `POST /api/segment/finale` przyjmuje `{ revision, command }` tylko od zweryfikowanego administratora. Polecenia to `confirm-finalists`, `start`, `estimate`, `direction`, `reveal`, `confirm-winner`, `show-wheel`, `award`, `next`, `overall-winner`, `complete` i `restart`. Baza sprawdza aktywny segment, rewizję i aktualną punktację podczas kwalifikacji oraz startu. Serwer pilnuje kolejności faz i odrzuca także ponowne potwierdzenie zwycięzcy.
- Klucz czterech pytań znajduje się w module serwerowym. `GET /api/game/state` podaje bieżący klucz przed ujawnieniem tylko zweryfikowanemu administratorowi. Ekran gracza i podgląd prezentacji pokazują wyłącznie ujawnioną odpowiedź. Istniejący odczyt co cztery sekundy synchronizuje ekrany, a odświeżenie strony przywraca zapisany stan. Lobby i obie formy podglądu żetonów nadal są dostępne.
- Pierwsze żądanie po wdrożeniu dodaje pola FINAŁU oraz nowy segment w ograniczeniu `game_state`. Jawny restart segmentu odwraca wyłącznie zapisane punkty z kół finału. Audyt zachowuje każde przyznanie, poprzednią kwotę i różnicę korekty. Pełny reset czyści również finał razem z dotychczasowym stanem gry.

## Testy integracyjne

Po `npm run build` uruchom `npm run test:game`. Testy startują lokalny build z jednorazową bazą PostgreSQL w PGlite i nie modyfikują bazy z `.env.local`. Obejmują dostęp do widoków wszystkich segmentów, zasoby i gotowość The Floor, przepływy zakładów, punktację, obie złote gry, remis Kalamburów i pełny finał.

## Documentation maintenance

Whenever source code changes, update the matching `.readme.txt`; if modules or architecture move, also update this file’s tree and module descriptions. `AGENTS.md` makes this an explicit operating rule for future assistants.
