"""Minimal LiveKit token server + static frontend host.

Serves two things on http://localhost:8000:
  GET /       → frontend/index.html
  GET /token  → mints a LiveKit access token (never done in the browser)

Run:
  source .venv/bin/activate
  python server/token_server.py
"""

from __future__ import annotations

import os
import pathlib
import uuid

from aiohttp import web
from dotenv import load_dotenv
from livekit.api import AccessToken, VideoGrants

load_dotenv()

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"


async def handle_token(request: web.Request) -> web.Response:
    room = request.rel_url.query.get("room", "loan-demo")
    identity = request.rel_url.query.get("identity", f"user-{uuid.uuid4().hex[:6]}")

    token = (
        AccessToken(
            api_key=os.environ["LIVEKIT_API_KEY"],
            api_secret=os.environ["LIVEKIT_API_SECRET"],
        )
        .with_identity(identity)
        .with_name(identity)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    return web.json_response(
        {"token": token, "url": os.environ["LIVEKIT_URL"], "room": room, "identity": identity},
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def handle_index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(
        FRONTEND_DIR / "index.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


app = web.Application()
app.router.add_get("/token", handle_token)
app.router.add_get("/", handle_index)

if __name__ == "__main__":
    port = int(os.environ.get("TOKEN_SERVER_PORT", 8000))
    print(f"\n  Token server running → http://localhost:{port}\n")
    web.run_app(app, host="127.0.0.1", port=port, print=None)
