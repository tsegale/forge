def test_liveness(app):
    response = app.test_client().get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_readiness_reports_each_dependency(app):
    response = app.test_client().get("/api/v1/health/ready")
    body = response.get_json()
    assert body["checks"]["database"] == "ok"
    assert set(body["checks"]) == {"database", "redis"}
    assert response.status_code == (200 if body["status"] == "ok" else 503)
