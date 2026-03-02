# GitHub CI Workflows + Docker Compose Plan

## Context Summary

| Item | Details |
|---|---|
| **Monorepo** | Turborepo with npm workspaces |
| **API** | `apps/api/` — Python 3.12 + FastAPI + uv, already has multi-stage Dockerfile |
| **Web** | `apps/web/` — Next.js 14 + Bun, already has multi-stage Dockerfile |
| **Shared pkg** | `packages/shared/` — TS package used by web |
| **Registry** | GitHub Container Registry (`ghcr.io`) |
| **Repo** | `keelfy/family-budget-app` |
| **Existing CI** | None (no `.github/` directory) |
| **Existing Dockerfiles** | Both already multi-stage — will keep as-is |
| **Existing docker-compose.yml** | Local build-based, will be kept unchanged |

## Files to Create

| # | File | Description |
|---|---|---|
| 1 | `.github/workflows/ci-api.yml` | CI workflow for API — builds Docker image, pushes to GHCR on main |
| 2 | `.github/workflows/ci-web.yml` | CI workflow for Web — builds Docker image, pushes to GHCR on main |
| 3 | `docker-compose.prod.yml` | Production compose using GHCR images |

## Files to Keep Unchanged

| File | Reason |
|---|---|
| `apps/api/Dockerfile` | Already a proper multi-stage build |
| `apps/web/Dockerfile` | Already a proper multi-stage build |
| `docker-compose.yml` | Stays as local development build file |

## Workflow Specifications

### `.github/workflows/ci-api.yml`

- **Triggers**: Push to `main` (paths: `apps/api/**`), PRs (paths: `apps/api/**`)
- **Build**: Always (validates Dockerfile on PRs)
- **Push**: Only on `main` (event `push`)
- **Image**: `ghcr.io/keelfy/family-budget-app/api`
- **Tags**: `latest` on main, git SHA tag
- **Context**: `apps/api/`
- **Cache**: GitHub Actions cache (`type=gha`)

### `.github/workflows/ci-web.yml`

- **Triggers**: Push to `main` (paths: `apps/web/**`, `packages/shared/**`, `package.json`, `turbo.json`, `bun.lockb`), PRs (same paths)
- **Build**: Always
- **Push**: Only on `main`
- **Image**: `ghcr.io/keelfy/family-budget-app/web`
- **Tags**: `latest` on main, git SHA tag
- **Context**: `.` (repo root, since web Dockerfile copies from monorepo root)
- **Dockerfile**: `apps/web/Dockerfile`
- **Cache**: GitHub Actions cache (`type=gha`)

### `docker-compose.prod.yml`

- References `ghcr.io/keelfy/family-budget-app/api:latest` and `ghcr.io/keelfy/family-budget-app/web:latest`
- Uses `env_file` directives pointing to `.env` files for runtime config
- Includes networking, ports, restart policies, `depends_on`

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Separate workflows per app** | Yes | Independent triggers on path changes; API and web can deploy independently |
| **Push to GHCR only on `main`** | Build on PR, push only on main merge | Prevents polluting registry with PR images |
| **Dockerfiles** | Keep existing | Both are already well-structured multi-stage builds |
| **Build args for env vars** | Not baked in | Runtime env vars via docker-compose `environment:` block; no secrets in images |
| **Cache strategy** | GitHub Actions cache (`type=gha`) | Native, fast, no extra config needed |
| **Docker Compose strategy** | Separate prod file | Keep existing `docker-compose.yml` for local builds, add `docker-compose.prod.yml` with GHCR image references |
| **Image naming** | Repo-prefixed | `ghcr.io/keelfy/family-budget-app/api` and `ghcr.io/keelfy/family-budget-app/web` |

## GitHub Actions Used

Both workflows use:
- `actions/checkout@v4`
- `docker/setup-buildx-action@v3`
- `docker/login-action@v3`
- `docker/metadata-action@v5`
- `docker/build-push-action@v6`

## Tagging Strategy

| Condition | Tags Applied |
|---|---|
| Push to `main` | `latest`, `sha-<short-sha>` |
| PR (build-only, no push) | N/A — image is built but not pushed |
| Git tag `v*` | `<semver>`, `latest` |
