import base64
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.core.config import settings
from app.modules.governance.service import classify_moderation_result, decrypt_secret, encrypt_secret, installation_hmac
from app.modules.reports.schemas import ReportCreate


class GovernanceSafetyTests(unittest.TestCase):
    def test_installation_identifier_is_hmac_not_raw(self) -> None:
        with patch.object(settings, "installation_hmac_secret", "test-only-secret"):
            first = installation_hmac("installation-123456")
            second = installation_hmac("installation-123456")
        self.assertEqual(first, second)
        self.assertEqual(len(first or ""), 64)
        self.assertNotIn("installation", first or "")

    def test_integration_secret_round_trip_uses_authenticated_encryption(self) -> None:
        key = base64.urlsafe_b64encode(bytes(range(32))).decode("ascii")
        with patch.object(settings, "integration_master_key", key):
            encrypted, nonce, fingerprint, last_four = encrypt_secret("openai", "sk-example-1234")
            credential = type("Credential", (), {"provider": "openai", "encrypted_secret": encrypted, "nonce": nonce})()
            self.assertEqual(decrypt_secret(credential), "sk-example-1234")
        self.assertNotIn("sk-example", encrypted)
        self.assertEqual(last_four, "1234")
        self.assertEqual(len(fingerprint), 64)

    def test_multi_reason_report_requires_at_least_one_reason(self) -> None:
        with self.assertRaises(ValidationError):
            ReportCreate(target_type="post", target_id="10000000-0000-4000-8000-000000000001")
        report = ReportCreate(target_type="post", target_id="10000000-0000-4000-8000-000000000001", reason_codes=["hate", "harassment"])
        self.assertEqual(report.reason_code, "hate")
        self.assertEqual(report.reason_codes, ["hate", "harassment"])

    def test_content_decision_never_implies_account_sanction(self) -> None:
        self.assertEqual(classify_moderation_result({"sexual": True}, {"sexual": 0.95}), "rejected")
        self.assertEqual(classify_moderation_result({"hate": True}, {"hate": 0.70}), "review_required")
        self.assertEqual(classify_moderation_result({"sexual": False}, {"sexual": 0.01}), "safe")


if __name__ == "__main__":
    unittest.main()
