"""Celery tasks, scheduled by BEAT_SCHEDULE in app/config.py. Each task runs inside the Flask app
context, so it uses the same configuration, database session and payment gateway as the API."""

from __future__ import annotations

import smtplib

from celery import Celery, Task, shared_task
from flask import Flask, has_app_context

from .services.maintenance import ensure_price_history_partitions
from .services.notifications import send_order_confirmation as send_confirmation
from .services.password_reset import send_changed, send_reset
from .services.sweeper import sweep


def init_celery(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args, **kwargs):
            # Reuse an active app context (a task run inline from a request); a worker has none,
            # so it pushes its own app's context.
            if has_app_context():
                return self.run(*args, **kwargs)
            with app.app_context():
                return self.run(*args, **kwargs)

    celery = Celery(app.import_name, task_cls=FlaskTask)
    celery.config_from_object(app.config["CELERY"])
    celery.set_default()
    app.extensions["celery"] = celery
    return celery


@shared_task(name="forge.sweep_expired_reservations")
def sweep_expired_reservations() -> list[str]:
    return sweep().cancelled


@shared_task(
    name="forge.send_order_confirmation",
    autoretry_for=(smtplib.SMTPException, OSError),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=8,
)
def send_order_confirmation(order_id: int) -> bool:
    return send_confirmation(order_id)


_MAIL_RETRY = {
    "autoretry_for": (smtplib.SMTPException, OSError),
    "retry_backoff": True,
    "retry_backoff_max": 300,
    "max_retries": 5,
}


@shared_task(name="forge.send_password_reset", **_MAIL_RETRY)
def send_password_reset(user_id: int, token: str) -> bool:
    return send_reset(user_id, token)


@shared_task(name="forge.send_password_changed", **_MAIL_RETRY)
def send_password_changed(user_id: int) -> bool:
    return send_changed(user_id)


@shared_task(name="forge.maintain_price_history_partitions")
def maintain_price_history_partitions() -> list[str]:
    return ensure_price_history_partitions()
