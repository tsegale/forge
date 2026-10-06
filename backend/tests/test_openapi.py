"""The OpenAPI document is valid, complete, and describes errors and security accurately."""

import re

import pytest
from openapi_spec_validator import validate

SPEC_URL = "/api/docs/openapi.json"
METHODS = {"get", "post", "put", "patch", "delete"}
PROTECTED = re.compile(
    r"^/api/v1/(admin/|builds|addresses|checkout|orders|reviews/|alerts|auth/me$|auth/me/password$|auth/logout-all$|products/\{slug\}/reviews/mine$)"
)
# Paths that are public to read but need a session to write.
PROTECTED_WRITES = {("post", "/api/v1/products/{slug}/reviews")}
# Under a protected prefix, but deliberately public.
PUBLIC = {("get", "/api/v1/builds/featured")}


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
        if not rule.rule.startswith("/api/v1/"):
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
        operation_id = (method.lower(), path)
        protected = (bool(PROTECTED.match(path)) or operation_id in PROTECTED_WRITES) and operation_id not in PUBLIC
        assert secured == protected, f"{method} {path}"


def test_conditional_request_statuses_are_documented(spec):
    responses = spec["paths"]["/api/v1/admin/inventory/{product_id}"]["patch"]["responses"]
    assert {"409", "412", "428"} <= set(responses)


def test_listing_documents_every_filter(spec):
    params = {p["name"] for p in spec["paths"]["/api/v1/products"]["get"]["parameters"]}
    assert {"q", "kind", "sort", "cursor", "limit", "socket", "vram_min_gb", "fits_gpu_length_mm"} <= params


def test_api_docs_open_swagger_ui(client):
    for path in ("/api/docs", "/api/docs/"):
        response = client.get(path)
        assert response.status_code == 302 and response.headers["Location"].endswith("/api/docs/swagger/")


@pytest.mark.parametrize("page", ["/api/docs/swagger/", "/api/docs/redoc/"])
def test_docs_pages_load_pinned_assets_under_their_own_policy(client, page):
    response = client.get(page)
    html = response.get_data(as_text=True)
    assert response.status_code == 200 and SPEC_URL in html
    # Every third-party asset is version-pinned and integrity-checked; nothing runs inline.
    external = re.findall(r'(?:src|href)="(https://[^"]+)"', html)
    assert external and all("@" in url and url.startswith("https://cdn.jsdelivr.net/npm/") for url in external)
    assert html.count('integrity="sha384-') == len(external)
    assert not re.search(r"<script>(?!\s*</script>)", html)
    policy = response.headers["Content-Security-Policy"]
    assert (
        "script-src 'self' https://cdn.jsdelivr.net" in policy
        and "'unsafe-inline'" not in policy.split("script-src")[1].split(";")[0]
    )


def test_swagger_start_up_script_is_served_and_the_api_keeps_no_docs_policy(client):
    script = client.get("/api/docs/swagger-init.js")
    assert script.status_code == 200 and script.mimetype == "text/javascript"
    assert "SwaggerUIBundle" in script.get_data(as_text=True)
    assert "Content-Security-Policy" not in client.get("/api/v1/health/live").headers
