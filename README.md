# Forge

A PC hardware marketplace with a database-enforced build compatibility engine.
Customers assemble a PC build part by part; Forge validates socket, memory, form factor,
clearance and power compatibility, then checks out the whole build with a two-phase
stock reservation and Stripe payments.

Built for CMP3872 Database Programming (University of Namibia, 2026) with Flask,
SQLAlchemy 2.x and PostgreSQL 16.

![Entity relationship diagram](docs/erd.png)

## Stack

| Layer | Technology |
| --- | --- |
| API | Flask 3, versioned REST under `/api/v1` |
| ORM | SQLAlchemy 2.x (typed `Mapped[]` models, joined-table inheritance) |
| Database | PostgreSQL 16 (partitioning, triggers, generated columns, full-text search) |
| Migrations | Alembic via Flask-Migrate, reversible, drift-checked in CI |
| Cache and queues | Redis |
| Serving | Gunicorn behind Nginx |
| Packaging | Docker multi-stage image, Docker Compose |
| CI | GitHub Actions: lint, tests against real PostgreSQL, migration drift check |

## Quick start

```bash
cp .env.example .env        # then set real secrets
docker compose up --build -d
docker compose run --rm api flask seed catalog
docker compose run --rm api flask users create-admin --email you@example.com --first-name You --last-name Admin
curl http://localhost:8080/api/v1/health/ready
```

API documentation is then at http://localhost:8080/api/v1/docs/swagger/.

`migrate` runs as a one-shot service before the API starts, so schema changes are applied
exactly once per deploy instead of racing inside every API replica. PostgreSQL and Redis sit
on an internal network and are not reachable from outside the stack.

## Local development

`docker-compose.dev.yml` publishes PostgreSQL and Redis on `127.0.0.1` only and creates the
`forge_test` database on first start. Ports default to 5432 and 6379; set `FORGE_DB_PORT` or
`FORGE_REDIS_PORT` if either is taken on your machine. The connection URLs below read the
same variable, so they always match the published port.

```bash
export FORGE_DB_PORT=5432   # e.g. 5433 if another PostgreSQL already uses 5432
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db redis

cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export FLASK_APP=wsgi.py SECRET_KEY=dev JWT_SECRET_KEY=dev-only-jwt-secret-at-least-32-bytes \
       REDIS_URL=redis://127.0.0.1:${FORGE_REDIS_PORT:-6379}/0 \
       DATABASE_URL=postgresql+psycopg://forge:forge@127.0.0.1:${FORGE_DB_PORT}/forge \
       TEST_DATABASE_URL=postgresql+psycopg://forge:forge@127.0.0.1:${FORGE_DB_PORT}/forge_test \
       TEST_REDIS_URL=redis://127.0.0.1:${FORGE_REDIS_PORT:-6379}/15
flask db upgrade && flask seed catalog
pytest
```

Use `127.0.0.1`, not `localhost`. The ports are bound to IPv4 loopback only, and on Windows a
`localhost` connection tries `::1` first and stalls until that attempt times out.
`forge_test` is dropped and rebuilt by every test run, so never point `DATABASE_URL` at it.

## API

Versioned under `/api/v1`. The OpenAPI 3.1 document is generated from the same Pydantic models
that validate requests, so it cannot drift from the code:

- Spec: `/api/v1/docs/openapi.json`
- Swagger UI: `/api/v1/docs/swagger/`, Redoc: `/api/v1/docs/redoc/`

### Errors

Every error, whatever raised it, uses one envelope. `code` is stable and safe to branch on;
`request_id` matches the `X-Request-ID` response header for tracing.

```json
{"error": {"code": "email_taken", "message": "An account with this email address already exists.",
           "details": null, "request_id": "4f1c..."}}
```

Database rules surface as precise HTTP errors: the API maps the violated constraint name
(`diag.constraint_name`) to a status and code, for example `uq_users_email` to 409
`email_taken`, the `build_slot_limit` trigger to 409, and `ck_inventory_reserved_le_on_hand`
to 409 `stock_below_reserved`. Validation failures are 422 with per-field `details`.

### Authentication

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register` | Create a customer account (the admin role cannot be self-assigned) |
| `POST /auth/login` | Returns a 15-minute access token; sets the refresh token cookie |
| `POST /auth/refresh` | Rotates the refresh token and issues a new access token |
| `POST /auth/logout`, `POST /auth/logout-all` | End this session, or every session |
| `GET /auth/me` | The authenticated user |

- Passwords are hashed with Argon2id (RFC 9106 parameters) and transparently re-hashed when
  parameters change. Unknown emails still run a hash, so timing does not reveal accounts.
- Access tokens are HS256 JWTs with pinned algorithm, issuer, audience and token type.
- The refresh token lives only in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to
  `/api/v1/auth`. Every refresh rotates it under a row lock. Presenting an already-rotated
  token is treated as theft and revokes the whole token family (RFC 9700). A login's family
  has an absolute 30-day lifetime that rotation cannot extend.
- Login is limited to 5 attempts per minute per IP and 10 failures per 15 minutes per account
  (across IPs), stored in Redis; 429 responses carry `Retry-After`.
- Roles are re-read from the database on every request, so deactivation and demotion take
  effect immediately. Create the first administrator with
  `flask users create-admin --email ... --first-name ... --last-name ...` (password is prompted).

### Catalog

`GET /products` filters on spec columns (`kind=gpu&vram_min_gb=16&length_max_mm=340`),
category subtrees, brands, price and stock, and sorts by price, name, newest or relevance.
Unknown parameters are rejected with 422 rather than silently ignored.

Search (`q`) combines PostgreSQL full-text search with `pg_trgm`: trigram substring matching
finds fragments inside model numbers that full-text search cannot (`x3d` finds the 7800X3D),
and word similarity tolerates typos (`ryzn`). Both use a GIN trigram index.

Pagination is keyset-based: each page compares `(sort_key, id)` with the previous page's last
row, so pages stay consistent while data changes and deep pages cost the same as the first.
`next_cursor` is signed and bound to its query; tampering or reusing it with other filters is
a 400.

### Administration

`PATCH /admin/products/{id}` changes price or availability (price changes are recorded in the
partitioned `price_history` table by a trigger). Stock edits use HTTP conditional requests
for optimistic concurrency: `GET /admin/inventory/{id}` returns the row version as an `ETag`,
and `PATCH` requires `If-Match` with it, answering 412 if someone else changed the stock first,
428 if `If-Match` is missing, and 409 if the new level would fall below reserved stock.

## Database design

The schema is in third normal form. The few deliberate denormalisations are snapshots
(order lines and order addresses copy name, SKU, price and address at purchase time) so
that history is immutable when the catalog or a user's address book changes later.

### Polymorphic catalog

`products` is the supertype. Each core component kind has its own spec table (`cpu_specs`,
`gpu_specs`, `motherboard_specs` ...) mapped with SQLAlchemy joined-table inheritance, so
`select(Product)` returns typed `CpuProduct`, `GpuProduct` instances. Loose accessories
(fans, thermal paste) have no spec table and keep their attributes in an indexed JSONB column.

### Invariants enforced by the database

Business rules that must hold regardless of which code path writes are enforced in
PostgreSQL, not only in Python:

| Rule | Mechanism |
| --- | --- |
| A spec row can only belong to a product of its own kind | Constant `kind_code` column with CHECK, plus composite FK to `products(id, kind_code)` |
| A product can only sit in a category of the same kind | Composite FK to `categories(id, kind_code)` |
| A build item's kind always matches its product | Composite FK to `products(id, kind_code)` |
| Per-build slot limits (one CPU, up to four memory kits) | Constraint trigger; locks the parent build row to serialise concurrent inserts |
| Every product has exactly one inventory row | `AFTER INSERT` trigger |
| Reserved stock never exceeds stock on hand | CHECK constraints |
| Order status follows the state machine | `BEFORE UPDATE` trigger against the `order_status_transitions` table |
| Every status change is audited with the acting user | `AFTER` trigger reading a transaction-scoped setting set via `set_config()` |
| Every price change is recorded | Trigger into `price_history`, range-partitioned by month |
| Audit tables are append-only | `BEFORE UPDATE` triggers that raise |
| Order totals are internally consistent | CHECK `total = subtotal + tax + shipping` |
| Email uniqueness is case-insensitive | `CITEXT` column |
| One default address per user per type | Partial unique index |

Money is stored as integer minor units (cents). Constraint names follow a fixed naming
convention, so the API can map a violated constraint to a precise error response.

### Diagrams

`docs/erd.png` and `docs/erd.svg` are rendered, and `docs/schema.dbml` is exported, directly
from the SQLAlchemy metadata, so they cannot drift from the code:

```bash
cd backend
python scripts/export_dbml.py > ../docs/schema.dbml   # paste into dbdiagram.io
cd scripts && python render_erd.py ../../docs         # requires Graphviz
```

## Testing

Tests run against a real PostgreSQL database, never SQLite, because triggers, partitions
and composite constraints are part of what is under test. The session fixture rebuilds the
schema, runs every migration up, down to base and up again (proving each `downgrade()`
works), then seeds the catalog. Each test runs in a transaction that is rolled back.

## Project structure

```
backend/
  app/
    api/v1/          versioned REST blueprints
    api/spec.py      request validation and OpenAPI generation (spectree + Pydantic)
    models/          SQLAlchemy models (identity, catalog, builds, commerce, engagement)
    schemas/         Pydantic request and response models
    security/        password hashing, JWTs, route guards
    services/        business logic (auth sessions, catalog queries, ...)
    errors.py        error envelope; db_errors.py maps constraint names to HTTP errors
    cli.py           flask seed catalog, flask users create-admin
  migrations/        Alembic: 0001 schema, 0002 reference data and database logic,
                     0003 pg_trgm search and refresh token families
  seed/catalog.json  62 real components with manufacturer specs
  scripts/           ERD and DBML generators
  tests/
docs/                ERD and schema exports
nginx/               reverse proxy config
```

## Roadmap

- [x] Phase 1: schema, migrations, database logic, seed data, Docker, CI
- [x] Phase 2: authentication (JWT access and refresh rotation, RBAC, rate limiting), catalog API, OpenAPI docs
- [ ] Phase 3: build compatibility engine and compatible-parts filtering
- [ ] Phase 4: cart, two-phase checkout with reservations, Stripe webhooks, Celery workers
- [ ] Phase 5: React frontend
- [ ] Phase 6: hardening, documentation, demo
