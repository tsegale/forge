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
curl http://localhost:8080/api/v1/health/ready
```

`migrate` runs as a one-shot service before the API starts, so schema changes are applied
exactly once per deploy instead of racing inside every API replica. PostgreSQL and Redis sit
on an internal network and are not reachable from outside the stack.

## Local development

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export FLASK_APP=wsgi.py SECRET_KEY=dev \
       DATABASE_URL=postgresql+psycopg://forge:forge@localhost/forge \
       TEST_DATABASE_URL=postgresql+psycopg://forge:forge@localhost/forge_test
flask db upgrade && flask seed catalog
pytest
```

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
    models/          SQLAlchemy models (identity, catalog, builds, commerce, engagement)
    services/        business logic (compatibility engine, checkout, ...)
    cli.py           flask seed catalog
  migrations/        Alembic: 0001 schema, 0002 reference data and database logic
  seed/catalog.json  62 real components with manufacturer specs
  scripts/           ERD and DBML generators
  tests/
docs/                ERD and schema exports
nginx/               reverse proxy config
```

## Roadmap

- [x] Phase 1: schema, migrations, database logic, seed data, Docker, CI
- [ ] Phase 2: authentication (JWT access and refresh rotation, RBAC), catalog API, OpenAPI docs
- [ ] Phase 3: build compatibility engine and compatible-parts filtering
- [ ] Phase 4: cart, two-phase checkout with reservations, Stripe webhooks, Celery workers
- [ ] Phase 5: React frontend
- [ ] Phase 6: hardening, documentation, demo
