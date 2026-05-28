"""Phase 0 — bare realtime voice loop for the loan-onboarding agent "Ken".

Stack (this setup):
  STT: Deepgram Nova-3 (multi-language, Hindi + English)
  LLM: Gemini Flash via OpenRouter (openai-compatible, base_url=openrouter.ai)
  TTS: Deepgram Aura
  VAD: Silero · Turn detection: multilingual model

CARDINAL RULE: We do NOT hand-roll VAD, turn-taking, interruption, or echo
cancellation. AgentSession owns the entire realtime loop. We only configure
its built-ins.

Echo: AEC is the CLIENT's job — enable it on the browser mic track. The
built-in adaptive interruption + false-interruption resume handle coughs/echo.
TEST WITH HEADPHONES FIRST.

Run:
  python -m agent.main download-files   # one-time: fetch VAD + turn-detector models
  python -m agent.main dev              # local dev worker (connects to LiveKit Cloud)
  python -m agent.main start            # production worker
"""

from __future__ import annotations

import logging

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    RoomOutputOptions,
    WorkerOptions,
    cli,
    metrics,
)
from livekit.plugins import deepgram, silero
from livekit.plugins import openai as lk_openai
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from . import config
from .prompts.system_prompts import SYSTEM_PROMPT
from .tools.backend import LOAN_TOOLS

logger = logging.getLogger("loan-agent")


class Assistant(Agent):
    """Ken, the loan-onboarding officer: persona + workflow + loan tools."""

    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT, tools=LOAN_TOOLS)


def prewarm(proc: JobProcess) -> None:
    """Load Silero VAD model once per worker process (not per job)."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    config.require_keys()

    await ctx.connect()
    logger.info("connected to room: %s", ctx.room.name)

    session = AgentSession(
        stt=deepgram.STT(
            model=config.STT_MODEL,
            language=config.STT_LANGUAGE,
            api_key=config.DEEPGRAM_API_KEY,
        ),
        llm=lk_openai.LLM(
            model=config.LLM_MODEL,
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
        ),
        tts=deepgram.TTS(
            model=config.TTS_MODEL,
            api_key=config.DEEPGRAM_API_KEY,
        ),
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
        # Tuned for hesitant Bharat users — longer end-of-turn delay, barge-in on,
        # false interruptions (cough/echo) rejected and resumed from.
        min_endpointing_delay=config.MIN_ENDPOINTING_DELAY,
        max_endpointing_delay=config.MAX_ENDPOINTING_DELAY,
        allow_interruptions=config.ALLOW_INTERRUPTIONS,
        min_interruption_duration=config.MIN_INTERRUPTION_DURATION,
        resume_false_interruption=config.RESUME_FALSE_INTERRUPTION,
        false_interruption_timeout=config.FALSE_INTERRUPTION_TIMEOUT,
    )

    _wire_observability(session)

    # Optional Beyond Presence avatar: a talking head publishes the agent's
    # audio+video into the room. When enabled we disable the agent's own audio
    # output (the avatar republishes it, lip-synced) but keep transcription on.
    output_options = None
    if config.AVATAR_ENABLED and config.BEY_API_KEY:
        try:
            from livekit.plugins import bey

            avatar = bey.AvatarSession(
                avatar_id=config.BEY_AVATAR_ID or None,
                api_key=config.BEY_API_KEY,
            )
            await avatar.start(session, room=ctx.room)
            output_options = RoomOutputOptions(
                audio_enabled=False, transcription_enabled=True
            )
            logger.info("avatar enabled (Beyond Presence)")
        except Exception as e:
            # Spec: avatar down must fall back to voice-only automatically.
            logger.error("avatar failed, falling back to voice-only: %s", e)
            output_options = None

    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_output_options=output_options,
    )

    # Kick off the workflow at the GREETING stage. AgentSession guarantees one
    # reply here; no loop or re-greeting logic.
    await session.generate_reply(
        instructions="Begin the loan application at the GREETING stage: greet the "
        "customer warmly in Indian English, introduce yourself as Ken from Anoxaa, "
        "say you will help them apply for a personal loan, and then ask for their "
        "full name. Do not assume any of their details."
    )


def _wire_observability(session: AgentSession) -> None:
    """Structured stdout logging (full observability module arrives in Phase 1+)."""

    @session.on("metrics_collected")
    def _on_metrics(ev) -> None:
        metrics.log_metrics(ev.metrics)

    @session.on("user_input_transcribed")
    def _on_transcript(ev) -> None:
        if getattr(ev, "is_final", False):
            logger.info("user: %s", getattr(ev, "transcript", ""))

    @session.on("conversation_item_added")
    def _on_item(ev) -> None:
        item = getattr(ev, "item", None)
        if item:
            logger.info("turn: role=%s", getattr(item, "role", "?"))

    @session.on("agent_state_changed")
    def _on_agent_state(ev) -> None:
        logger.info(
            "agent_state: %s -> %s",
            getattr(ev, "old_state", "?"),
            getattr(ev, "new_state", "?"),
        )

    @session.on("error")
    def _on_error(ev) -> None:
        logger.error("session error: %s", ev)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
