"""Write the OpenAPI document to stdout, deterministically (sorted keys), without a database.

    python scripts/export_openapi.py > ../frontend/src/api/openapi.json

The frontend generates its TypeScript types from this file, and CI fails if it is stale.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Building the spec needs the app and its routes, not live services: placeholders suffice.
for name, value in {
    "SECRET_KEY": "openapi-export",
    "JWT_SECRET_KEY": "openapi-export-placeholder-key-32-bytes",
    "TEST_DATABASE_URL": "postgresql+psycopg://openapi:openapi@127.0.0.1:1/openapi",
    "TEST_REDIS_URL": "redis://127.0.0.1:1/15",
}.items():
    os.environ.setdefault(name, value)

from app import create_app  # noqa: E402
from app.api.spec import api  # noqa: E402

app = create_app("testing")
with app.test_request_context():
    json.dump(api.spec, sys.stdout, indent=2, sort_keys=True, ensure_ascii=False)
    sys.stdout.write("\n")
