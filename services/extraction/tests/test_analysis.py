"""Tests for the analysis module and analysis API routes.

Uses an in-memory SQLite database with the Apple Messages schema and
deterministic sample data (see conftest.py).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from chatpulse_extraction import analysis
from chatpulse_extraction.db import ChatDB
from chatpulse_extraction.main import app

# ---------------------------------------------------------------------------
# Direct analysis function tests
# ---------------------------------------------------------------------------


class TestMessageCountsByContact:
    """Tests for analysis.message_counts_by_contact."""

    def test_returns_all_handles(self, sample_db: ChatDB) -> None:
        results = analysis.message_counts_by_contact(sample_db)
        handle_ids = {r["handle_id"] for r in results}
        # We have 3 handles with normal messages.
        assert len(handle_ids) == 3

    def test_excludes_reactions(self, sample_db: ChatDB) -> None:
        results = analysis.message_counts_by_contact(sample_db)
        # Handle 1 has 4 normal messages + 1 reaction.  Only 4 should count.
        handle_1 = next(r for r in results if r["handle_id"] == 1)
        assert handle_1["total"] == 4

    def test_sent_received_split(self, sample_db: ChatDB) -> None:
        results = analysis.message_counts_by_contact(sample_db)
        handle_1 = next(r for r in results if r["handle_id"] == 1)
        assert handle_1["sent"] == 2
        assert handle_1["received"] == 2


class TestMessagesOverTime:
    """Tests for analysis.messages_over_time."""

    def test_day_interval_returns_buckets(self, sample_db: ChatDB) -> None:
        results = analysis.messages_over_time(sample_db, interval="day")
        assert len(results) >= 1
        assert all("period" in r and "count" in r for r in results)

    def test_month_interval(self, sample_db: ChatDB) -> None:
        results = analysis.messages_over_time(sample_db, interval="month")
        # All sample data is in 2024-06, so there should be exactly 1 bucket.
        assert len(results) == 1
        assert results[0]["period"] == "2024-06"


class TestTopContacts:
    """Tests for analysis.top_contacts."""

    def test_limit_respected(self, sample_db: ChatDB) -> None:
        results = analysis.top_contacts(sample_db, limit=2)
        assert len(results) <= 2

    def test_ordered_descending(self, sample_db: ChatDB) -> None:
        results = analysis.top_contacts(sample_db, limit=10)
        counts = [r["message_count"] for r in results]
        assert counts == sorted(counts, reverse=True)


class TestAverageResponseTime:
    """Tests for analysis.average_response_time."""

    def test_returns_results(self, sample_db: ChatDB) -> None:
        results = analysis.average_response_time(sample_db)
        # We should have at least one handle with a computable response time.
        assert len(results) >= 1

    def test_response_time_positive(self, sample_db: ChatDB) -> None:
        results = analysis.average_response_time(sample_db)
        for r in results:
            assert r["avg_response_seconds"] > 0


class TestBusiestHours:
    """Tests for analysis.busiest_hours."""

    def test_returns_hour_buckets(self, sample_db: ChatDB) -> None:
        results = analysis.busiest_hours(sample_db)
        hours = {r["hour"] for r in results}
        # All hours should be in [0, 23].
        assert all(0 <= h <= 23 for h in hours)

    def test_total_matches_non_reaction_messages(self, sample_db: ChatDB) -> None:
        results = analysis.busiest_hours(sample_db)
        total = sum(r["count"] for r in results)
        # 10 total messages minus 2 reactions = 8 normal messages.
        assert total == 8


class TestReactionSummary:
    """Tests for analysis.reaction_summary."""

    def test_returns_reaction_types(self, sample_db: ChatDB) -> None:
        results = analysis.reaction_summary(sample_db)
        types = {r["reaction_type"] for r in results}
        # Sample data has tapback types 2001 (Liked) and 2000 (Loved).
        assert 2000 in types
        assert 2001 in types

    def test_labels_attached(self, sample_db: ChatDB) -> None:
        results = analysis.reaction_summary(sample_db)
        for r in results:
            assert "label" in r
            assert r["label"] in (
                "Loved",
                "Liked",
                "Disliked",
                "Laughed",
                "Emphasised",
                "Questioned",
            )


# ---------------------------------------------------------------------------
# API route tests
# ---------------------------------------------------------------------------


@pytest.fixture()
def client() -> TestClient:
    """FastAPI test client."""
    return TestClient(app)


class TestAnalysisRoutes:
    """Integration tests for the /analysis/ endpoints."""

    def test_message_counts_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/analysis/message-counts", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_timeline_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/analysis/timeline", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_timeline_invalid_interval(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get(
            "/analysis/timeline",
            params={"db_path": sample_db_path, "interval": "century"},
        )
        assert resp.status_code == 400

    def test_top_contacts_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get(
            "/analysis/top-contacts",
            params={"db_path": sample_db_path, "limit": 5},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 5

    def test_response_times_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/analysis/response-times", params={"db_path": sample_db_path})
        assert resp.status_code == 200

    def test_heatmap_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/analysis/heatmap", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        data = resp.json()
        for bucket in data:
            assert 0 <= bucket["hour"] <= 23

    def test_reactions_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/analysis/reactions", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2  # Loved + Liked in sample data

    def test_missing_db_returns_404(self, client: TestClient) -> None:
        resp = client.get(
            "/analysis/message-counts",
            params={"db_path": "/nonexistent/chat.db"},
        )
        assert resp.status_code == 404


class TestExtractionRoutes:
    """Integration tests for the /extract/ endpoints."""

    def test_messages_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/extract/messages", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 10  # All messages including reactions.

    def test_messages_with_limit(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get(
            "/extract/messages",
            params={"db_path": sample_db_path, "limit": 3},
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 3

    def test_contacts_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/extract/contacts", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        assert resp.json()["count"] == 3

    def test_chats_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get("/extract/chats", params={"db_path": sample_db_path})
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

    def test_chat_messages_endpoint(self, client: TestClient, sample_db_path: str) -> None:
        resp = client.get(
            "/extract/chats/1/messages",
            params={"db_path": sample_db_path},
        )
        assert resp.status_code == 200
        # Chat 1 has 7 messages (5 + 2 from the email handle).
        assert resp.json()["count"] == 7


class TestHealthEndpoint:
    """Tests for the /health endpoint."""

    def test_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
