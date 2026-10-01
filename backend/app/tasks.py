"""Celery tasks, scheduled by BEAT_SCHEDULE in app/config.py. Each task runs inside the Flask app
context, so it uses the same configuration, database session and payment gateway as the API."""

from __future__ import annotations

from celery import Celery, Task, shared_task
from flask import Flask

from .services.sweeper import sweep


def init_celery(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args, **kwargs):
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
