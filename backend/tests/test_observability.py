"""Request ids in logs, one access line per request, and Server-Timing with database time."""

import json
import logging
import re

from flask import g

from app.observability import JsonFormatter, RequestIdFilter

TIMING = re.compile(r'app;dur=[\d.]+;desc="Flask", db;dur=[\d.]+;desc="PostgreSQL, (\d+) statements"')


def test_server_timing_reports_app_and_database_time(client):
    response = client.get("/api/v1/products?kind=cpu")
    match = TIMING.fullmatch(response.headers["Server-Timing"])
    assert match, response.headers["Server-Timing"]
    assert int(match.group(1)) >= 1  # the listing ran at least one statement


def test_server_timing_can_be_turned_off(app, client):
    app.config["SERVER_TIMING"] = False
    try:
        assert "Server-Timing" not in client.get("/api/v1/products?kind=cpu").headers
    finally:
        app.config["SERVER_TIMING"] = True


def test_a_valid_incoming_request_id_is_kept_and_a_bad_one_replaced(client):
    kept = client.get("/api/v1/health/live", headers={"X-Request-ID": "abc123-from-nginx"})
    assert kept.headers["X-Request-ID"] == "abc123-from-nginx"
    replaced = client.get("/api/v1/health/live", headers={"X-Request-ID": "bad id with spaces"})
    assert re.fullmatch(r"[0-9a-f]{32}", replaced.headers["X-Request-ID"])


def test_each_request_logs_one_access_line_without_the_query_string(client, caplog, make_user, auth_headers):
    user = make_user()
    with caplog.at_level(logging.INFO, logger="forge.access"):
        response = client.get("/api/v1/products?q=secret-search-text", headers=auth_headers(user))
    [line] = [r for r in caplog.records if r.name == "forge.access"]
    assert line.path == "/api/v1/products" and "secret-search-text" not in line.getMessage()
    assert line.status == 200 and line.method == "GET"
    assert line.duration_ms >= line.db_ms >= 0 and line.db_queries >= 1
    assert response.headers["X-Request-ID"]


def test_the_access_line_names_the_signed_in_user(client, caplog, make_user, auth_headers):
    user = make_user()
    with caplog.at_level(logging.INFO, logger="forge.access"):
        client.get("/api/v1/auth/me", headers=auth_headers(user))
    [line] = [r for r in caplog.records if r.name == "forge.access"]
    assert line.user_id == user.id


def test_json_log_lines_carry_the_request_id_and_extra_fields(app):
    record = logging.makeLogRecord({"name": "forge.test", "levelname": "INFO", "msg": "hello %s", "args": ("there",)})
    record.status = 201
    with app.test_request_context("/api/v1/cart"):
        g.request_id = "req-42"
        RequestIdFilter().filter(record)
    entry = json.loads(JsonFormatter().format(record))
    assert entry["message"] == "hello there"
    assert entry["request_id"] == "req-42" and entry["status"] == 201 and entry["level"] == "INFO"


def test_outside_a_request_the_id_is_a_dash():
    record = logging.makeLogRecord({"msg": "beat tick"})
    RequestIdFilter().filter(record)
    assert record.request_id == "-"
