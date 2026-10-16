from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_server_opens_rsvps_before_accepting_requests():
    with patch('app.main.open_rsvp') as open_event:
        with TestClient(app) as client:
            open_event.assert_called_once_with()
            assert client.get('/api/health').status_code == 200


def test_server_refuses_to_start_if_opening_rsvps_fails():
    with patch('app.main.open_rsvp', side_effect=RuntimeError('Event missing')):
        with pytest.raises(RuntimeError, match='Event missing'):
            with TestClient(app):
                pass


def test_event_availability_is_never_cached():
    with patch('app.main.open_rsvp'), TestClient(app) as client:
        response = client.get('/api/v1/event')
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
