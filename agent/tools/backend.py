"""Loan-workflow tools exposed to the LLM (Phase 1 = mock, typed, idempotent).

These return fixture data with NO external calls, so the full loan flow can be
driven on a real call without any banking integration or extra API spend.
Every figure Ken speaks (amount, rate, EMI, eligibility) MUST originate here —
the system prompt forbids inventing numbers.

Phase 2 will swap the bodies for real (typed-stub) backends behind the same
signatures, add hard timeouts, and move messaging/call-control to their own
modules per the build spec.
"""

from __future__ import annotations

import logging

from livekit.agents import function_tool

logger = logging.getLogger("loan-agent.tools")

# In-memory idempotency ledger for side-effecting calls (per worker process).
_IDEMPOTENCY: set[str] = set()


@function_tool
async def fetch_loan_eligibility(requested_amount: int, monthly_income: int) -> dict:
    """Check loan eligibility. Pass the requested loan amount and the customer's
    monthly income (both in rupees, both collected and confirmed from the customer).
    Returns whether eligible, the maximum approved amount, and a reason.
    Do NOT state any approval or amount before calling this."""
    logger.info(
        "tool fetch_loan_eligibility requested=%s income=%s",
        requested_amount,
        monthly_income,
    )
    # Mock policy: approve up to 10x monthly income, capped at 5,00,000.
    max_amount = min(monthly_income * 10, 500000)
    eligible = requested_amount <= max_amount
    return {
        "ok": True,
        "eligible": eligible,
        "requested_amount": requested_amount,
        "max_amount": max_amount,
        "reason": (
            "Approved within eligible limit"
            if eligible
            else f"Requested amount exceeds the eligible limit of {max_amount}"
        ),
    }


@function_tool
async def fetch_repayment_plan(user_id: str, amount: int, tenure_months: int) -> dict:
    """Compute the repayment offer for an approved amount and tenure (months).
    Returns the amount, annual interest rate, tenure, and monthly EMI.
    Read these exact numbers back to the customer; never invent them."""
    annual_rate = 0.18  # mock: 18% p.a.
    r = annual_rate / 12
    if r == 0 or tenure_months <= 0:
        emi = amount / max(tenure_months, 1)
    else:
        emi = amount * r * (1 + r) ** tenure_months / ((1 + r) ** tenure_months - 1)
    logger.info(
        "tool fetch_repayment_plan amount=%s tenure=%s emi=%.0f", amount, tenure_months, emi
    )
    return {
        "ok": True,
        "amount": amount,
        "annual_rate_percent": round(annual_rate * 100, 2),
        "tenure_months": tenure_months,
        "emi": round(emi),
    }


@function_tool
async def save_consent(user_id: str, terms_summary: str, idempotency_key: str) -> dict:
    """Record the customer's explicit consent to the exact terms shown.
    Call ONLY after the customer clearly agrees. Idempotent."""
    if idempotency_key in _IDEMPOTENCY:
        logger.info("tool save_consent DEDUP key=%s", idempotency_key)
        return {"ok": True, "saved": True, "duplicate": True}
    _IDEMPOTENCY.add(idempotency_key)
    logger.info("tool save_consent user_id=%s terms=%r", user_id, terms_summary)
    return {"ok": True, "saved": True, "consent_id": idempotency_key}


@function_tool
async def update_onboarding_status(user_id: str, stage: str, status: str) -> dict:
    """Update the onboarding status for a stage (e.g. stage='decision', status='accepted').
    Idempotent."""
    logger.info("tool update_onboarding_status user_id=%s %s=%s", user_id, stage, status)
    return {"ok": True}


@function_tool
async def send_whatsapp_agreement(user_id: str, idempotency_key: str) -> dict:
    """Send the loan agreement link over WhatsApp. Idempotent: one link per key.
    Only tell the customer it was 'sent' after this returns sent=True."""
    if idempotency_key in _IDEMPOTENCY:
        logger.info("tool send_whatsapp_agreement DEDUP key=%s", idempotency_key)
        return {"ok": True, "sent": True, "duplicate": True}
    _IDEMPOTENCY.add(idempotency_key)
    link = f"https://anoxaa.example/agreement/{idempotency_key}"
    logger.info("tool send_whatsapp_agreement user_id=%s link=%s", user_id, link)
    return {"ok": True, "sent": True, "agreement_url": link}


# Registered on the agent (single source of truth for what the LLM can call).
LOAN_TOOLS = [
    fetch_loan_eligibility,
    fetch_repayment_plan,
    save_consent,
    update_onboarding_status,
    send_whatsapp_agreement,
]
