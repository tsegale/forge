"""Alembic environment for Flask-Migrate: migrations run against the app's own engine and
SQLAlchemy metadata, so autogenerate compares the database with the models in app/models."""

import logging
import re
from logging.config import fileConfig

from flask import current_app

from alembic import context

config = context.config
# Keep the app's loggers (forge.access and friends) working when migrations run in-process.
fileConfig(config.config_file_name, disable_existing_loggers=False)
logger = logging.getLogger('alembic.env')


def get_engine():
    return current_app.extensions['migrate'].db.engine


def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace(
            '%', '%%')
    except AttributeError:
        return str(get_engine().url).replace('%', '%%')


config.set_main_option('sqlalchemy.url', get_engine_url())
target_db = current_app.extensions['migrate'].db

def get_metadata():
    if hasattr(target_db, 'metadatas'):
        return target_db.metadatas[None]
    return target_db.metadata


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=get_metadata(), literal_binds=True
    )

    with context.begin_transaction():
        context.run_migrations()


PARTITION_TABLE = re.compile(r"^price_history_(default|y\d{4}m\d{2})$")


def include_object(obj, name, type_, reflected, compare_to):
    """Monthly price_history partitions are created at runtime by a DB function,
    not by models, so autogenerate must not try to drop them."""
    table_name = name if type_ == "table" else getattr(getattr(obj, "table", None), "name", "")
    if reflected and compare_to is None and PARTITION_TABLE.match(table_name or ""):
        return False
    return True


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # this callback is used to prevent an auto-migration from being generated
    # when there are no changes to the schema
    # reference: http://alembic.zzzcomputing.com/en/latest/cookbook.html
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    conf_args = current_app.extensions['migrate'].configure_args
    conf_args.setdefault("include_object", include_object)
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives

    connectable = get_engine()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_metadata(),
            **conf_args
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
