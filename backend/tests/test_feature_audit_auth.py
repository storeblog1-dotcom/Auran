import unittest
from types import SimpleNamespace

from jose import jwt

from app.common.exceptions import BadRequestException
from app.core.config import settings
from app.modules.feature_audit.service import create_session, ip_hmac, validate_new_password


class FeatureAuditAuthTests(unittest.TestCase):
    def test_new_password_requires_length_and_complexity(self):
        with self.assertRaises(BadRequestException):
            validate_new_password("short", "short")
        with self.assertRaises(BadRequestException):
            validate_new_password("abcdefghijkl", "abcdefghijkl")
        validate_new_password("Auran-Audit-2026!", "Auran-Audit-2026!")

    def test_session_is_signed_and_versioned(self):
        token, csrf = create_session(SimpleNamespace(session_version=7))
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        self.assertEqual(payload["purpose"], "feature_audit_session")
        self.assertEqual(payload["version"], 7)
        self.assertEqual(payload["csrf"], csrf)

    def test_ip_identifier_is_hmac_not_plain_ip(self):
        fingerprint = ip_hmac("203.0.113.10")
        self.assertEqual(len(fingerprint), 64)
        self.assertNotIn("203.0.113.10", fingerprint)


if __name__ == "__main__":
    unittest.main()
