import unittest

from app.common.exceptions import BadRequestException
from app.modules.posts.youtube import _extract_video_id, _has_explicit_age_restriction


class YouTubeVerificationTests(unittest.TestCase):
    def test_accepts_only_standard_https_watch_url(self) -> None:
        self.assertEqual(
            _extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1"),
            "dQw4w9WgXcQ",
        )

    def test_rejects_short_live_and_shorts_urls(self) -> None:
        for url in (
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ):
            with self.assertRaises(BadRequestException):
                _extract_video_id(url)

    def test_recognizes_explicit_youtube_age_restriction(self) -> None:
        self.assertTrue(_has_explicit_age_restriction({"contentRating": {"ytRating": "ytAgeRestricted"}}))
        self.assertFalse(_has_explicit_age_restriction({"contentRating": {}}))
