# UboOwnershipTreeResolver

UboOwnershipTreeResolver builds the layered ownership tree behind any business entity and deterministically computes who clears the 25% beneficial-ownership and substantial-control thresholds, so a BOI (Beneficial Ownership Information) report names the correct natural persons.

It multiplies direct ownership percentages through nested holding companies, trusts, and intermediate entities to compute each natural person's effective indirect ownership, applies the FinCEN 25% test and the substantial-control test, records the documented basis for each control finding, detects discrepancies against previously filed sets, and produces versioned snapshots with before/after diffs plus exportable rosters and ownership-chain diagrams.

This is a deterministic analysis platform: given an ownership graph, the same inputs always produce the same beneficial-owner set. The math is transparent, auditable, and every percentage is traceable to a chain of edges.

See [docs/idea.md](docs/idea.md) for the full product specification, data model, and feature list.

## Stack

- **Backend:** Hono (Node, TypeScript, ESM) + Drizzle ORM over Neon Postgres. Runs with `node --import tsx/esm` (no compile step at runtime). API mounted under `/api/v1`.
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4, TypeScript strict. Auth via `@neondatabase/auth` (Neon Auth). The browser calls a same-origin `/api/proxy/*` route that resolves the session server-side and forwards an `X-User-Id` header to the backend.
- **Database:** Neon Postgres. The schema must be provisioned out-of-band (drizzle-kit push or the Neon console); the app does not create its own tables. On boot the backend runs an idempotent seed for built-in sample scenarios.
- **Deploy:** Backend on Render (see `render.yaml`), frontend on Vercel. `docker-compose.yml` brings backend + web up together locally.

## Local Development

Prerequisites: Node 22+, pnpm, and a Neon Postgres database (or any Postgres) with the schema provisioned.

### Backend

```bash
cd backend
pnpm install
# create backend/.env (see env vars below)
pnpm dev
```

The API listens on `http://localhost:3001` with a health check at `/health`.

### Frontend

```bash
cd web
pnpm install
# create web/.env.local (see env vars below)
pnpm dev
```

The web app runs on `http://localhost:3000`.

### Docker Compose

```bash
docker compose up --build
```

This starts the backend on port 3001 and the web app on port 3000.

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is the only `NEXT_PUBLIC_*` variable and is read by the proxy route to reach the backend. The `NEON_AUTH_*` variables are server-only.

On Render, set `DATABASE_URL` and `FRONTEND_URL` as service environment variables (`sync: false`).

## Pricing

All features are free for signed-in users. There is no paid tier and no billing gate; creating an account unlocks the full ownership-graph editor, effective-ownership resolution, control-test worksheets, snapshots, diffs, discrepancy detection, and exports.
