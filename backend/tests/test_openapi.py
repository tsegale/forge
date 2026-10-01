"""The OpenAPI document is valid, complete, and describes errors and security accurately."""

import re

import pytest
from openapi_spec_validator import validate

SPEC_URL = "/api/v1/docs/openapi.json"
METHODS = {"get", "post", "put", "patch", "delete"}
PROTECTED = re.compile(r"^/api/v1/(admin/|auth/me$|auth/logout-all$)")


@pytest.fixture(scope="module")
def spec(app):
    response = app.test_client().get(SPEC_URL)
    assert response.status_code == 200
    return response.get_json()


def _operations(spec):
    for path, item in spec["paths"].items():
        for method, operation in item.items():
            if method in METHODS:
                yield path, method, operation


def test_document_is_valid_openapi(spec):
    validate(spec)
    assert spec["openapi"].startswith("3.1")
    assert spec["info"]["title"] == "Forge API"


def test_every_api_route_is_documented(app, spec):
    documented = {(path, method) for path, method, _ in _operations(spec)}
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith("/api/v1/") or rule.rule.startswith("/api/v1/docs"):
            continue
        path = re.sub(r"<(?:[^:>]+:)?([^>]+)>", r"{\1}", rule.rule)
        for method in rule.methods & {m.upper() for m in METHODS}:
            assert (path, method.lower()) in documented, f"{method} {path} is missing from the OpenAPI document"


def test_every_operation_is_described_and_tagged(spec):
    for path, method, operation in _operations(spec):
        assert operation.get("tags"), f"{method} {path} has no tag"
        assert operation.get("summary") or operation.get("description"), f"{method} {path} has no description"


def test_error_responses_use_the_shared_envelope(spec):
    for path, method, operation in _operations(spec):
        for status, response in operation["responses"].items():
            if int(status) >= 400 and not path.endswith("/health/ready"):
                schema = response["content"]["application/json"]["schema"]
                assert schema["$ref"].endswith("/ErrorResponse"), f"{method} {path} {status}"


def test_protected_operations_declare_bearer_auth(spec):
    assert spec["components"]["securitySchemes"]["bearerAuth"]["scheme"] == "bearer"
    for path, method, operation in _operations(spec):
        secured = {"bearerAuth": []} in operation.get("security", [])
        assert secured == bool(PROTECTED.match(path)), f"{method} {path}"


def test_conditional_request_statuses_are_documented(spec):
    responses = spec["paths"]["/api/v1/admin/inventory/{product_id}"]["patch"]["responses"]
    assert {"409", "412", "428"} <= set(responses)


def test_listing_documents_every_filter(spec):
    params = {p["name"] for p in spec["paths"]["/api/v1/products"]["get"]["parameters"]}
    assert {"q", "kind", "sort", "cursor", "limit", "socket", "vram_min_gb", "fits_gpu_length_mm"} <= params


def test_interactive_docs_are_served(client):
    response = client.get("/api/v1/docs/swagger/")
    assert response.status_code == 200
    assert SPEC_URL in response.get_data(as_text=True)
