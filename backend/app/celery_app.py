"""Celery entry point: ``celery -A app.celery_app worker`` and ``celery -A app.celery_app beat``."""

from . import create_app

flask_app = create_app()
celery = flask_app.extensions["celery"]
