from __future__ import annotations

from stock_sync_web.database import WebDatabase


def test_password_hash_accepts_only_the_matching_password() -> None:
    encoded = WebDatabase._hash_password("correct horse battery staple")

    assert WebDatabase._verify_password("correct horse battery staple", encoded)
    assert not WebDatabase._verify_password("wrong password", encoded)


def test_malformed_password_hash_is_rejected_without_error() -> None:
    malformed_values = ["", "plain-text", "pbkdf2_sha256$bad$hash", "unknown$1$salt$digest"]

    assert all(not WebDatabase._verify_password("password", value) for value in malformed_values)
