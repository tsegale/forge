"""Health endpoints: liveness for the process, readiness for its dependencies."""


def test_liveness(app):
    response = app.test_client().get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_readiness_reports_each_dependency(app):
    response = app.test_client().get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}
