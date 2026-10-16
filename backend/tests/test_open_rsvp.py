from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from app.database import engine
from app.scripts.open_rsvp import OPEN_RSVP_SQL, VERIFY_RSVP_SQL, open_rsvp


def test_opens_closed_event_with_exact_sql_and_is_repeatable():
    # Real PostgreSQL with an outer rollback: no committed event state is changed.
    with engine.connect() as connection:
        outer = connection.begin()
        try:
            connection.execute(text("UPDATE events SET rsvp_open = false WHERE slug = 'zade-turns-two'"))

            @contextmanager
            def begin():
                with connection.begin_nested():
                    yield connection

            @contextmanager
            def connect():
                yield connection

            isolated_engine = SimpleNamespace(begin=begin, connect=connect)
            with patch('app.scripts.open_rsvp.engine', isolated_engine):
                open_rsvp()
                assert connection.scalar(text(VERIFY_RSVP_SQL)) is True
                open_rsvp()
                assert connection.scalar(text(VERIFY_RSVP_SQL)) is True
            assert OPEN_RSVP_SQL == "UPDATE events SET rsvp_open = true WHERE slug = 'zade-turns-two';"
        finally:
            outer.rollback()


def test_missing_event_fails_instead_of_claiming_success():
    fake_engine = MagicMock()
    fake_engine.begin.return_value.__enter__.return_value.execute.return_value.rowcount = 0
    with patch('app.scripts.open_rsvp.engine', fake_engine):
        with pytest.raises(RuntimeError, match='Seed the event'):
            open_rsvp()
    fake_engine.connect.assert_not_called()


def test_failed_post_commit_verification_stops_startup():
    fake_engine = MagicMock()
    fake_engine.begin.return_value.__enter__.return_value.execute.return_value.rowcount = 1
    fake_engine.connect.return_value.__enter__.return_value.scalar.return_value = False
    with patch('app.scripts.open_rsvp.engine', fake_engine):
        with pytest.raises(RuntimeError, match='verification failed'):
            open_rsvp()
