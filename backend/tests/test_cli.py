"""Management commands."""

from sqlalchemy import select

from app.models import User
from app.models.enums import UserRole
from app.security.passwords import verify_password

ARGS = ["users", "create-admin", "--email", "Root@Example.com", "--first-name", "Root", "--last-name", "Admin"]
PASSWORD = "an admin passphrase"


def test_create_admin_prompts_for_password(app, session):
    result = app.test_cli_runner().invoke(args=ARGS, input=f"{PASSWORD}\n{PASSWORD}\n")
    assert result.exit_code == 0, result.output
    user = session.scalar(select(User).where(User.email == "root@example.com"))
    assert user.role is UserRole.ADMIN
    assert verify_password(user.password_hash, PASSWORD)


def test_create_admin_enforces_password_policy(app, session):
    result = app.test_cli_runner().invoke(args=[*ARGS, "--password", "short"])
    assert result.exit_code != 0
    assert "password" in result.output
    assert session.scalar(select(User).where(User.email == "root@example.com")) is None


def test_create_admin_refuses_existing_email(app, session, make_user):
    make_user(email="root@example.com")
    result = app.test_cli_runner().invoke(args=[*ARGS, "--password", PASSWORD])
    assert result.exit_code != 0
    assert "already exists" in result.output
