"""Create the configured development database, preserving an existing database."""
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from app.config import get_settings


def create_database():
    url = make_url(get_settings().database_url)
    if not url.database:
        raise ValueError("DATABASE_URL must name a database")
    with psycopg.connect(
        host=url.host, port=url.port or 5432, user=url.username,
        password=url.password, dbname="postgres", autocommit=True,
    ) as connection:
        exists = connection.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,)).fetchone()
        if not exists:
            connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(url.database)))
            print("Development database created.")
        else:
            print("Database already exists; preserving it.")


if __name__ == "__main__":
    create_database()
