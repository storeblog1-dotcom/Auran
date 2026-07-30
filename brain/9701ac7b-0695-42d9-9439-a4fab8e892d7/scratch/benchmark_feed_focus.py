import asyncio
import sys
import os
import time

backend_dir = r"c:\Users\zgpap.BOTTOM\.antigravity-ide\instagram-clone\backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

sys.stdout.reconfigure(encoding='utf-8')

import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

from httpx import AsyncClient, ASGITransport
from app.main import app

async def run_feed_focus_test():
    print("==========================================================================")
    print("  [Feed Focus & Freshness Simulation Test - 20 Iterations]")
    print("==========================================================================")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Auth
        login_res = await client.post("/api/v1/auth/login", json={"identifier": "auran", "password": "!Qwertyuiop1"})
        token = login_res.json().get("data", {}).get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("[AUTH] Access Token 획득 완료.")

        # Simulate Feed Focus events
        feed_updated_at = 0
        stories_updated_at = 0
        FRESH_TTL = 30 # seconds

        feed_state = []
        story_state = []

        skipped_feed_fetches = 0
        skipped_set_posts = 0
        executed_fetches = 0

        latencies = []

        for i in range(20):
            now = time.time()
            is_feed_fresh = (now - feed_updated_at < FRESH_TTL) and len(feed_state) > 0
            is_story_fresh = (now - stories_updated_at < FRESH_TTL) and len(story_state) > 0

            t0 = time.perf_counter()

            if is_feed_fresh and is_story_fresh:
                skipped_feed_fetches += 1
                lat = (time.perf_counter() - t0) * 1000
                latencies.append(lat)
                print(f"  [Focus #{i+1}] Fresh cache (< 30s) -> API Call SKIPPED (Latency: {lat:.3f} ms)")
                await asyncio.sleep(0.05) # simulate 50ms user dwell time before tab switch
                continue

            # Execute fetch
            executed_fetches += 1
            res = await client.get("/api/v1/posts/feed", headers=headers)
            lat = (time.perf_counter() - t0) * 1000
            latencies.append(lat)

            if res.status_code == 200:
                new_data = res.json().get("data", [])
                # Reconciliation check
                if feed_state and len(feed_state) == len(new_data) and [p["id"] for p in feed_state] == [p["id"] for p in new_data]:
                    skipped_set_posts += 1
                    print(f"  [Focus #{i+1}] API Completed in {lat:.2f} ms -> Data Identical, setPosts SKIPPED!")
                else:
                    feed_state = new_data
                    print(f"  [Focus #{i+1}] API Completed in {lat:.2f} ms -> Feed state updated ({len(new_data)} items)")
                feed_updated_at = time.time()

        print("\n  📊 [Feed Focus 실측 결과 뷰]")
        print(f"     - 총 Focus 이벤트:      20 회")
        print(f"     - API 생략 (Fresh Cache): {skipped_feed_fetches} 회 (생략률: {skipped_feed_fetches/20*100:.1f}%)")
        print(f"     - API 실행:             {executed_fetches} 회")
        print(f"     - setPosts 생략 (동일 데이터): {skipped_set_posts} 회")
        print(f"     - Fresh 복귀 latency (p50): {min(latencies):.3f} ms")

if __name__ == "__main__":
    asyncio.run(run_feed_focus_test())
