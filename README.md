# Forge

A PC hardware marketplace with a database-enforced build compatibility engine.
Customers assemble a PC build part by part; Forge validates socket, memory, form factor,
clearance and power compatibility as they go, then checks out the whole build with a two-phase
stock reservation and Stripe payments. Administrators fulfil, refund and restock from the same
app.

Built for CMP3872 Database Programming (University of Namibia, 2026) with Flask,
SQLAlchemy 2.x and PostgreSQL 16 behind a React and TypeScript frontend.

![Entity relationship diagram](docs/erd.png)

## Stack

| Layer | Technology |
| --- | --- |
| API | Flask 3, versioned REST under `/api/v1` |
| ORM | SQLAlchemy 2.x (typed `Mapped[]` models, joined-table inheritance) |
| Database | PostgreSQL 16 (partitioning, triggers, generated columns, full-text search) |
| Migrations | Alembic via Flask-Migrate, reversible, drift-checked in CI |
| Cache, rate limits, queues | Redis; Celery worker and beat |
| Payments | Stripe (PaymentIntents, Payment Element, signed webhooks), test mode |
| Frontend | React 19, TypeScript (strict), Vite, React Router 7, TanStack Query, Tailwind CSS 4, Radix |
| API client | Generated from the OpenAPI document (openapi-typescript, openapi-fetch) |
| Serving | Gunicorn behind Nginx, which also serves the built frontend on the same origin |
| Packaging | Docker multi-stage images, Docker Compose |
| Testing | pytest on real PostgreSQL; Vitest, Testing Library and MSW; Playwright with axe |
| CI | GitHub Actions: backend, frontend and end-to-end jobs (see [Testing](#testing)) |

## Quick start

```bash
cp .env.example .env        # then set real secrets
docker compose up --build -d
docker compose run --rm api flask seed catalog
docker compose run --rm api flask users create-admin --email you@example.com --first-name You --last-name Admin
curl http://localhost:8080/api/v1/health/ready
```

The app is then at http://localhost:8080 and the API documentation at
http://localhost:8080/api/docs.

`migrate` runs as a one-shot service before the API starts, so schema changes are applied
exactly once per deploy instead of racing inside every API replica. PostgreSQL and Redis sit
on an internal network and are not reachable from outside the stack.

Nginx serves the built frontend and proxies `/api` to Gunicorn, so the app and the API share
one origin: no CORS, and the refresh cookie can be `SameSite=Strict`. Hashed assets are cached
for a year, `index.html` never, and every response carries a strict Content Security Policy
(this origin plus Stripe.js and its frames), `X-Frame-Options: DENY`, `nosniff` and a referrer
policy, defined once in `nginx/security-headers.conf`.

### Demo stack (production images, test-mode payments, caught email)

The demo runs the production compose file plus the development override, which adds Mailpit and
points every service's outgoing email at it (production otherwise requires a real `MAIL_SERVER`).
`.env` needs the secrets from `.env.example` and test-mode Stripe keys.

```bash
# 1. Forward Stripe test-mode webhooks to the stack (official Stripe CLI, https://docs.stripe.com/stripe-cli).
#    It prints "Your webhook signing secret is whsec_...": put that in .env as STRIPE_WEBHOOK_SECRET.
#    --events lists exactly the events the API handles (current CLI versions require the list).
stripe listen \
  --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled \
  --forward-to http://127.0.0.1:8080/api/v1/webhooks/stripe

# 2. In a second terminal: build and start everything, then seed and create an admin.
export COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml   # on Windows use ; instead of :
docker compose up -d --build --wait
docker compose run --rm api flask seed demo --yes
```

`flask seed demo` is an idempotent reset for presentations: it restores the catalog and its seeded
stock, clears orders, carts and builds, and creates the accounts below, five past orders (paid,
fulfilling, shipped, delivered, refunded) and a validated build. Run it again before each demo.
It refuses to run under the production configuration without `--yes`.

> **Demo only.** These credentials are public. Never run `flask seed demo` against a real store.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo-admin@example.com` | `forge-demo-admin-2026` |
| Customer | `demo-customer@example.com` | `forge-demo-customer-2026` |

| What | Where |
| --- | --- |
| The app | http://localhost:8080 |
| API through Nginx | http://localhost:8080/api/v1 |
| API documentation | http://localhost:8080/api/docs |
| Emails sent by the worker (Mailpit) | http://127.0.0.1:8025 |

Pay with Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC). The webhook marks
the order paid, the stock moves from reserved to sold, and the confirmation email appears in
Mailpit. `4000 0000 0000 0002` is declined, to show the retry. If you change
`STRIPE_WEBHOOK_SECRET`, run `docker compose up -d` again so the services pick it up. If
PostgreSQL's port 5432 is taken locally, also `export FORGE_DB_PORT=5433`.

#### The demo path

The same path runs in CI as a Playwright test, with axe accessibility checks on every screen.

1. **Browse and search** as the demo customer: search `x3d` and open the Ryzen 7 7800X3D.
2. **Configure**: "Add to build", then choose each remaining part. Every picker lists only parts
   compatible with the rest of the build, the panel updates conflicts, warnings, missing parts
   and the power estimate live, and a guest's build is saved to the account at sign-in.
3. **Validate**, then **check out this build** to the saved address. Stock is reserved for 15
   minutes, with a countdown on the pay screen.
4. **Pay**: a declined card leaves the form in place for another try; a good card shows
   "Confirming" until Stripe's webhook marks the order paid. If the hold runs out, "Start a fresh
   checkout" releases the order and puts the same parts back.
5. **Order history**: the order, its status timeline, and "Buy again".
6. **Fulfil as the admin**: the orders table offers only the next legal step (start fulfilment,
   mark shipped, mark delivered) and refunds where the state machine allows them. Inventory
   editing shows "stock changed, reload" if someone else changed the stock first.

## Local development

`docker-compose.dev.yml` publishes PostgreSQL and Redis on `127.0.0.1` only and creates the
`forge_test` database on first start. Ports default to 5432 and 6379; set `FORGE_DB_PORT` or
`FORGE_REDIS_PORT` if either is taken on your machine. The connection URLs below read the
same variable, so they always match the published port.

```bash
export FORGE_DB_PORT=5432   # e.g. 5433 if another PostgreSQL already uses 5432
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db redis mailpit

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

Run the API with `flask run --host 127.0.0.1 --port 8080`, then the frontend:

```bash
cd frontend
npm ci
npm run dev        # http://127.0.0.1:5173; proxies /api to FORGE_API_ORIGIN (default http://127.0.0.1:8080)
npm test           # unit and component tests
npm run typecheck && npm run lint && npm run format:check
```

`flask run` loads a `.env` file from the repository root if there is one (python-dotenv), so
Stripe keys there apply to the development server too.

### Payments without Stripe keys

Without `STRIPE_SECRET_KEY` (or with `PAYMENT_GATEWAY=fake`) the API uses an in-process fake
gateway, and the pay screen shows a clearly marked test panel instead of Stripe's card form.
"Pay" and "Simulate a declined card" call `POST /api/test/payments/{order_number}`, which builds
the event Stripe would send, signs it with the webhook secret and runs it through the normal
webhook processing, signature check included, so the order is paid by exactly the code a real
payment uses. That route exists only with the fake gateway, which the production configuration
refuses, and it is not part of the public API.

## API

Versioned under `/api/v1`. The OpenAPI 3.1 document is generated from the same Pydantic models
that validate requests, so it cannot drift from the code:

- Swagger UI: `/api/docs` (try requests with "Authorize" and an access token)
- Redoc reference: `/api/docs/redoc/`
- OpenAPI document: `/api/docs/openapi.json`

The documentation pages load Swagger UI and Redoc from jsDelivr at pinned versions with
Subresource Integrity, and the API sends them their own Content Security Policy (that CDN only, no
inline script); the rest of the app keeps its stricter policy. A Playwright test fails if either
page hits a policy violation.

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
  token is treated as theft and revokes the whole token family (RFC 9700). The exception is a
  short grace window (`REFRESH_REUSE_GRACE_SECONDS`, default 10): if the token was rotated
  moments ago and its successor is still unused, the caller gets that same successor back, so
  two tabs refreshing at once or a retried request do not end the session. No new token is
  minted in that case. A login's family has an absolute 30-day lifetime that rotation cannot
  extend.
- Login is limited to 5 attempts per minute per IP and 10 failures per 15 minutes per account
  (across IPs), stored in Redis; 429 responses carry `Retry-After`. Behind Nginx the limiter
  keys on the address Nginx appends to `X-Forwarded-For` (`TRUSTED_PROXY_COUNT=1`), so a client
  cannot pick its own key by sending that header.
- If Redis becomes unreachable, limiting continues with in-memory counters instead of failing
  open, and switches back once Redis recovers. Those counters are per Gunicorn worker and are
  not shared, so during an outage the effective limit is the configured limit multiplied by
  the number of workers that receive the traffic: with the image's 3 workers, up to 15 login
  attempts per minute per IP per container, and the per-account limit is likewise
  multiplied. Counters also start from zero when the fallback engages.
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

### Builds and compatibility

Customers save builds (`/builds`, with parts under `/builds/{id}/items`) and check them with the
compatibility engine: a set of independent rules behind one interface, each reporting
structured findings with a stable code, a severity and the measured values behind it.

| Rule | Conflict | Warning |
| --- | --- | --- |
| Socket | CPU and motherboard sockets differ | |
| Memory | wrong DDR generation, more modules than slots, more capacity than supported | more than one distinct kit |
| Form factor | case does not take the board's form factor | |
| GPU clearance | card longer than the case allows | |
| PSU form factor | ATX supply in an SFX bay | SFX in an ATX bay (bracket), SFX-L in an SFX bay |
| Cooler | no mounting for the socket, tower too tall, radiator without a mount | rated below the CPU's sustained power |
| Storage | more M.2 drives than slots, more SATA drives than ports | |
| Power | sustained load above the supply's rating | load above 80%, below the GPU vendor's recommendation, transient spikes beyond tolerance, 16-pin card without a native cable |

The power budget counts the CPU at its sustained package limit, each graphics card at board
power, and allowances for the rest. Graphics cards spike to about twice board power for
microseconds: ATX 3.x supplies are specified to ride through 200% excursions, ATX 2.x supplies
are not, so the same spike can warn on one supply and not another.

A report separates `compatible` (no conflicts) from `complete` (nothing missing). Missing parts
include the required kinds plus a graphics card when the CPU has no integrated graphics, and a
cooler when the CPU is sold without one.

- `POST /builds/{id}/validate` records the outcome: a build becomes `validated` only when it is
  both compatible and complete. It locks the build row before reading the parts, and every part
  change takes the same lock and resets a validated build to draft (a database trigger), so a
  validated status always describes exactly the parts that were checked.
- `POST /compatibility/check` evaluates an unsaved part list, for configuring before signing in.
- `GET /products?kind=psu&compatible_with=12,40,77` lists only parts that would not conflict with
  those parts (a CPU, board, PSU, case or cooler is judged as a replacement for the current one).
  Each rule expresses its conflicts as SQL, so filtering stays in the query and keyset pagination
  keeps working; parts that would only add warnings stay listed with their warning codes. A
  parity test checks that the SQL filters and the engine agree for every seeded part against a
  set of reference builds.

### Cart, checkout and payments

Guests keep a cart behind an HttpOnly cookie token; signing in merges it into the account's cart.
Checkout (`POST /checkout`) accepts the cart or a validated build, and either a saved address
(`/addresses`) or an inline one; the address is snapshotted onto the order.

Checkout is two-phase, and no row lock is ever held across a network call:

1. One transaction locks the inventory rows (always in `product_id` order, so concurrent checkouts
   cannot deadlock), checks availability (409 `insufficient_stock` lists each short line), snapshots
   prices, and inserts stock reservations with an expiry. A trigger moves the units from available to
   reserved. It commits.
2. Only then is the Stripe PaymentIntent created, with an `Idempotency-Key` derived from the order,
   so a retry returns the same intent instead of a second charge.

`POST /webhooks/stripe` verifies the signature, then records the event with
`INSERT ... ON CONFLICT DO NOTHING` in the same transaction as its effects, so each event is applied
exactly once however often it is delivered. Before an order is marked paid, the payment's amount and
currency must match the order total; the database enforces the same rule on every transition into
`paid`. A payment that arrives after the reservation expired and the order was cancelled re-reserves
the stock if it is still there, or is refunded automatically; either outcome is recorded.

Prices include Namibian VAT (15%). VAT is computed once on the gross total in integer cents, with
exact half-up rounding, and the net amounts are derived from it, so `total = subtotal + tax +
shipping` always holds. Shipping is a flat VAT-inclusive fee, free above a threshold (both
configurable).

Customers see their orders under `/orders` and can cancel an unpaid one.
`POST /orders/{order_number}/reorder` puts an order's parts back in the cart (skipping any no longer
sold, and saying which): checkout empties the cart, so this is how a customer checks out again after
an unpaid order's hold expires, and it doubles as "buy again".

Admins move paid orders through fulfilling, shipped and delivered, and refund through Stripe; a
refund is checked against the order state machine before any money moves. Every status change
records the acting user. The admin order list and detail include `next_steps` and `refundable`,
read from the same `order_status_transitions` table the trigger enforces, so a client offers only
legal actions without encoding the rules itself.

`GET /config` gives clients the store settings they need (currency, VAT rate, shipping rule,
reservation hold, payment provider and Stripe publishable key), and `GET /component-kinds` the
component kinds with their per-build limits.

### Background jobs

A Celery worker and a single beat scheduler (Redis broker) run:

- the reservation sweeper, every minute: it claims expired unpaid orders with
  `FOR UPDATE SKIP LOCKED`, so parallel sweepers never block each other or a webhook, releases their
  stock, cancels them, and then cancels their PaymentIntents;
- monthly `price_history` partition maintenance, creating the next months' partitions ahead of time;
- the order confirmation email, sent exactly once per order.

In development, Mailpit catches every email: http://127.0.0.1:8025.

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
| A validated build always describes its current parts | `BEFORE` trigger on `build_items` locks the build and resets it to draft |
| An ordered build's parts can no longer change, and it cannot be deleted | `BEFORE` triggers on `build_items` and `builds` |
| Order status follows the state machine | `BEFORE UPDATE` trigger against the `order_status_transitions` table |
| Every status change is audited with the acting user | `AFTER` trigger reading a transaction-scoped setting set via `set_config()` |
| Every price change is recorded | Trigger into `price_history`, range-partitioned by month |
| Audit tables are append-only | `BEFORE UPDATE` triggers that raise |
| Stock moves only through reservations | Trigger on `stock_reservations` adjusts reserved and on-hand stock and bumps the inventory version |
| No overselling | CHECK `quantity_reserved <= quantity_on_hand`, reached only through the reservation trigger |
| An order is paid only by a matching successful payment | Trigger on every transition into `paid` |
| Payment outcomes are append-only | `BEFORE UPDATE` trigger on `payment_events` |
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

## Frontend

A single-page React app in `frontend/`, served by Nginx from the same origin as the API.

| Screen | What it does |
| --- | --- |
| Catalog and product | Search, kind filters with per-kind spec filters, cursor paging, stock, add to cart or build |
| Configurator | One row per component kind; pickers filtered to compatible parts; live conflicts, warnings, missing parts and power meter; save and validate |
| Cart and checkout | Quantities, stock warnings, VAT and shipping totals; saved or one-off address; short lines named on 409 |
| Pay | Stripe Payment Element, reservation countdown, decline retry, "confirming" until the webhook lands, fresh checkout after expiry |
| Orders | History with status filter and "buy again"; detail with status timeline and cancel |
| Admin | Orders with legal next steps and refunds (with reason); inventory with stock, price and availability editing |

Design decisions worth knowing:

- **Session.** The access token is kept in memory only, never in browser storage; the refresh token
  is the API's HttpOnly cookie. Refreshes are single-flight within a tab and, through the Web Locks
  API, across tabs, so tabs never race to rotate the same token; a BroadcastChannel shares new
  tokens and sign-outs between tabs.
- **Cache.** TanStack Query holds server state. User-specific queries are keyed by the session
  and wait until it is restored, so a reload never shows a guest's cart to a signed-in user, and
  the whole cache is cleared at sign-in and sign-out. 4xx answers are not retried, except 429,
  which is retried after `Retry-After`.
- **Build draft.** The configurator's draft lives in local storage so a guest can build without an
  account. A draft linked to a saved build records its owner and is cleared at sign-out, or as
  soon as the app finds it belongs to anyone other than the signed-in user.
- **Payment form.** Stripe's iframe takes the card details, so they never reach Forge. The pay
  screen never re-renders on its clock; only the countdown does, so the Stripe element is not
  disturbed while the customer types.
- **Money.** Amounts are integer cents end to end; typed prices are parsed with string arithmetic,
  never floats.
- **Accessibility.** Light theme, inline SVG icons, labelled controls, focus-trapped dialogs, and
  colour tokens that meet WCAG AA contrast; axe checks every demo-path screen in CI.

### Typed API client

The frontend's TypeScript types are generated from the backend's OpenAPI document, so a change to
an endpoint that the frontend does not account for fails the type check. After changing the API:

```bash
cd backend && python scripts/export_openapi.py > ../frontend/src/api/openapi.json
cd ../frontend && npm run api:types
```

CI fails if either file is stale.

## Dependencies

Direct dependencies live in `backend/requirements.in` (runtime) and `backend/requirements-dev.in`
(tools, constrained to the runtime lock). `pip-tools` compiles them into fully pinned
`requirements.txt` and `requirements-dev.txt`, including every transitive package. Compile on Linux,
the platform the image runs on, so platform-specific packages resolve correctly:

```bash
cd backend
docker run --rm -v "$PWD":/w -w /w python:3.12-slim sh -c "pip install -q pip-tools==7.6.1 && \
  pip-compile -q --strip-extras --allow-unsafe -o requirements.txt requirements.in && \
  pip-compile -q --strip-extras --allow-unsafe -o requirements-dev.txt requirements-dev.in"
```

Add `--upgrade-package <name>` to move one dependency deliberately. CI runs `pip check` after
installing, so an incompatible set fails the build instead of being installed silently.

## Testing

**Backend** (`cd backend && pytest`, about 530 tests). Tests run against a real PostgreSQL
database, never SQLite, because triggers, partitions and composite constraints are part of what is
under test. The session fixture rebuilds the schema, runs every migration up, down to base and up
again (proving each `downgrade()` works), then seeds the catalog. Each test runs in a transaction
that is rolled back; concurrency tests (checkout races, sweeper against webhook) use real commits.
Payments use the fake gateway, but webhooks always go through real signature verification.

**Frontend** (`cd frontend && npm test`, about 100 tests). Vitest with Testing Library renders the
real route tree; MSW answers the API at the network level, and fixtures are typed against the
generated schema so they cannot drift from it. Stripe's components are mocked at the module
boundary; the real Payment Element is covered end to end.

**End to end** (`cd frontend && npx playwright test`, against a running stack at `E2E_BASE_URL`):

| Spec | Covers |
| --- | --- |
| `demo-path.spec.ts` | The demo path above, with axe (WCAG 2.1 A and AA) on every screen |
| `checkout-expiry.spec.ts` | An expired hold: payment withdrawn, fresh checkout with the same parts |
| `payment.stripe.spec.ts` | Real Stripe test mode: a declined card, then a good one (runs with `E2E_STRIPE=1`) |
| `api-docs.spec.ts` | Swagger UI and Redoc render under their own policy, with no policy or integrity violations |

CI runs on every push and pull request:

| Job | Steps |
| --- | --- |
| `backend` | `pip check`, ruff, pytest with coverage, `flask db check` (no model or migration drift), committed OpenAPI document is current |
| `frontend` | Generated API types are current, type check, ESLint (strict type-checked), Prettier, unit tests, production build |
| `e2e` | Migrates and seeds a fresh database, serves the production build, runs Playwright with simulated payments |
| `e2e-stripe` | Manual (`workflow_dispatch`): the same suite against Stripe test mode, with webhooks forwarded by the Stripe CLI. Needs the `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` repository secrets (test-mode keys only; the job refuses live ones) |

## Project structure

```
backend/
  app/
    api/v1/          versioned REST blueprints
    api/spec.py      request validation and OpenAPI generation (spectree + Pydantic)
    models/          SQLAlchemy models (identity, catalog, builds, commerce, engagement)
    schemas/         Pydantic request and response models
    security/        password hashing, JWTs, route guards
    compat/          compatibility engine: rules, power budget, report (pure, no database access)
    payments/        payment gateway interface, Stripe and in-process implementations, simulator
    services/        business logic (auth, catalog, builds, cart, checkout, webhooks, sweeper, ...)
    tasks.py         Celery tasks; celery_app.py is the worker entry point
    errors.py        error envelope; db_errors.py maps constraint names to HTTP errors
    cli.py           flask seed catalog, flask seed demo, flask users create-admin
    demo.py          the demo data reset behind flask seed demo
  migrations/        Alembic: 0001 schema, 0002 reference data and database logic,
                     0003 pg_trgm search and refresh token families,
                     0004 compatibility inputs and build guards,
                     0005 checkout and payment integrity
  seed/catalog.json  62 real components with manufacturer specs
  scripts/           ERD, DBML and OpenAPI exporters
  tests/
frontend/
  src/
    app/             router, query client and store configuration
    api/             generated OpenAPI types and the typed client
    auth/            in-memory session, cross-tab refresh, route guard
    builds/ cart/ orders/ admin/ catalog/ payments/   data access per area
    pages/           screens, one folder per area
    components/      layout and shared UI (buttons, fields, dialogs, alerts)
    lib/             money, time and navigation helpers
    test/            MSW server, typed fixtures, render helpers
  e2e/               Playwright specs
docs/                ERD and schema exports
nginx/               Nginx image (builds the frontend), site config, security headers
scripts/ci/          starts the end-to-end stack in CI
.github/             workflow and the shared end-to-end setup action
```

## Known limitations

- One currency (NAD) and one VAT rate; shipping is a flat fee with a free threshold.
- Email is sent only for order confirmation; shipping and delivery are visible in the order
  timeline but not emailed.
- Refunds are full refunds; partial refunds and returns are not modelled.
- During a Redis outage, rate limits fall back to per-worker in-memory counters (see
  [Authentication](#authentication)).

## Roadmap

- [x] Phase 1: schema, migrations, database logic, seed data, Docker, CI
- [x] Phase 2: authentication (JWT access and refresh rotation, RBAC, rate limiting), catalog API, OpenAPI docs
- [x] Phase 3: build compatibility engine and compatible-parts filtering
- [x] Phase 4: cart, two-phase checkout with reservations, Stripe webhooks, Celery workers
- [x] Phase 5: React frontend (catalog, configurator, cart and checkout, payments, orders, admin), end-to-end tests
- [ ] Phase 6: production-stack run, documentation, release
