"""Central configuration for the loan-onboarding voice agent.

=============================================================================
 VERIFIED API FACTS (livekit-agents==1.6.3, checked against installed package
 on 2026-06-24 — re-verify on any version bump)
=============================================================================
 - API shape: Form A — explicit plugins + WorkerOptions + cli.run_app.
 - AgentSession turn/interruption knobs are FLAT kwargs (not a nested object).
 - STT:  deepgram.STT(model, language)           env: DEEPGRAM_API_KEY
 - TTS:  deepgram.TTS(model)                     env: DEEPGRAM_API_KEY
         (Deepgram Aura — no Cartesia key in this setup)
 - LLM:  openai.LLM(model, base_url, api_key)    env: OPENROUTER_API_KEY
         base_url="https://openrouter.ai/api/v1"
         Phase 2 note: switch to livekit-plugins-google native plugin when
         tools are added — OpenRouter can break streaming tool-calls.
 - VAD:  silero.VAD.load()    [deprecated in 1.6.3, still functional]
 - Turn: MultilingualModel()  [deprecated in 1.6.3, still functional]
=============================================================================
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

PROFILE = os.environ.get("PROFILE", "prod").strip().lower()
IS_DEV = PROFILE == "dev"

# ── LiveKit Cloud ────────────────────────────────────────────────────────
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

# ── Provider keys ────────────────────────────────────────────────────────
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# ── Model strings ────────────────────────────────────────────────────────
STT_MODEL = os.environ.get("STT_MODEL", "nova-3")
# en-IN (Indian English) is far more accurate for our users than "multi".
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "en-IN")

# Deepgram Aura TTS (reuses DEEPGRAM_API_KEY). aura-2 = more natural English.
# Note: Deepgram has no Indian-accent voice; for a true Hindi/Indian voice use
# Cartesia Sonic-3 or ElevenLabs.
TTS_MODEL = os.environ.get("DEEPGRAM_TTS_MODEL", "aura-2-cordelia-en")

# LLM via OpenRouter (OpenAI-compatible endpoint)
LLM_MODEL = os.environ.get("LLM_MODEL", "google/gemini-3.1-flash-lite")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# ── Avatar (Beyond Presence talking head) ────────────────────────────────
AVATAR_ENABLED = os.environ.get("AVATAR_ENABLED", "false").strip().lower() in (
    "1",
    "true",
    "yes",
)
BEY_API_KEY = os.environ.get("BEY_API_KEY", "")
BEY_AVATAR_ID = os.environ.get("BEY_AVATAR_ID", "")

# ── Turn-taking knobs (tuned for hesitant Bharat users) ─────────────────
# Higher min delay so a haltering speaker ("my full name is ... Hitakshi") is
# not committed mid-sentence and split into multiple turns.
MIN_ENDPOINTING_DELAY = 1.3
MAX_ENDPOINTING_DELAY = 6.0
ALLOW_INTERRUPTIONS = True
MIN_INTERRUPTION_DURATION = 0.5
RESUME_FALSE_INTERRUPTION = True
FALSE_INTERRUPTION_TIMEOUT = 2.0


def require_keys() -> None:
    """Fail fast with a clear message if required keys are missing.
    Skipped in dev profile."""
    if IS_DEV:
        return
    missing = [
        name
        for name, val in (
            ("LIVEKIT_URL", LIVEKIT_URL),
            ("LIVEKIT_API_KEY", LIVEKIT_API_KEY),
            ("LIVEKIT_API_SECRET", LIVEKIT_API_SECRET),
            ("DEEPGRAM_API_KEY", DEEPGRAM_API_KEY),
            ("OPENROUTER_API_KEY", OPENROUTER_API_KEY),
        )
        if not val
    ]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ".\nCopy .env.example to .env and fill them in."
        )
