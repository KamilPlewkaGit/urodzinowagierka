# Instructions for AI coding agents

Before changing this repository:

1. Read `README.md` in full to understand the system boundary and current stage.
2. Read the `.readme.txt` next to every source file you intend to edit, plus the documentation for directly related modules.
3. Preserve the architecture: Next.js Route Handlers perform sensitive writes; `src/lib/database.ts` is the persistence boundary; browser components never become authoritative for chips, roles, or game state.
4. Keep the scope narrow. Do not add games, betting, transfers, real-money features, broad refactors, or infrastructure the current feature does not require.
5. Update each edited source file's matching `.readme.txt` in the same change. Create a matching `.readme.txt` whenever creating a source file.
6. Update `README.md` when the folder structure, architecture, data model, API contract, dependencies, or deployment steps change.
7. Validate with `npm run typecheck` and, for meaningful behavior changes, `npm run build` before handoff.
8. For changes to game progression, scoring, or settlement, run `npm run test:game` after the build. The suite uses a temporary database and leaves existing games alone.

Security rules:

- Validate all external input on the server with `src/lib/validation.ts` or an equivalent focused schema.
- Do not expose `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, raw database errors, or sensitive server modules to client components.
- Require a verified server-side admin session for every admin-only action.
- Do not accept balances or game-state changes from the browser.

Documentation is a functional requirement, not optional cleanup. Keep it concise, accurate, and useful for context retrieval.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
