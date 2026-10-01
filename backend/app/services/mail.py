"""Outgoing email. SMTP in development and production (Mailpit locally), an in-memory outbox in
tests. Messages are multipart: plain text plus an HTML alternative."""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from flask import current_app

OUTBOX_KEY = "forge.outbox"


@dataclass(frozen=True, slots=True)
class Mail:
    to: str
    subject: str
    text: str
    html: str


def outbox() -> list[Mail]:
    """Messages sent with the memory backend (tests)."""
    return current_app.extensions.setdefault(OUTBOX_KEY, [])


def send(mail: Mail) -> None:
    cfg = current_app.config
    if cfg["MAIL_BACKEND"] == "memory":
        outbox().append(mail)
        return
    message = EmailMessage()
    message["From"] = cfg["MAIL_FROM"]
    message["To"] = mail.to
    message["Subject"] = mail.subject
    message.set_content(mail.text)
    message.add_alternative(mail.html, subtype="html")
    with smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=10) as smtp:
        if cfg["MAIL_USE_TLS"]:
            smtp.starttls()
        if cfg["MAIL_USERNAME"]:
            smtp.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
        smtp.send_message(message)
