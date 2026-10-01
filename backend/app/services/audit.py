"""Pass request context to database triggers for the current transaction only."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def set_actor(session: Session, user_id: int | None) -> None:
    """Expose the acting user to audit triggers (transaction-scoped, like SET LOCAL).

    set_config() is used instead of SET LOCAL because SET cannot take bound parameters,
    and interpolating the value would open an injection path.
    """
    session.execute(
        text("SELECT set_config('forge.actor_id', :uid, true)"),
        {"uid": "" if user_id is None else str(int(user_id))},
    )
