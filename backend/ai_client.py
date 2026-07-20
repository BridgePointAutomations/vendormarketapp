"""Claude client wrapper. Enforces JSON-only responses with retry."""
import os
import json
import re
import uuid
from typing import Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
MODEL_PROVIDER = 'anthropic'
MODEL_NAME = 'claude-sonnet-4-6'

SYSTEM_PROMPT = (
    'You are the MarketOps AI assistant for solo market vendors '
    '(farmers markets, craft fairs). You reply with ONE JSON object or array '
    'and nothing else - no prose, no markdown fences, no commentary. '
    'Base every number on the provided history; if history is sparse, say so '
    "in the rationale and set confidence='low'. Never invent data."
)


def _extract_json(text: str) -> Any:
    if not text:
        raise ValueError('Empty AI response')
    cleaned = text.strip()
    fence = re.search(r'```(?:json)?\s*(.*?)```', cleaned, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    if not cleaned.startswith(('{', '[')):
        candidates = [i for i in (cleaned.find('{'), cleaned.find('[')) if i != -1]
        if not candidates:
            raise ValueError(f'No JSON found in response: {cleaned[:200]}')
        cleaned = cleaned[min(candidates):]
    return json.loads(cleaned)


async def ask_claude(user_prompt: str, session_hint: Optional[str] = None, max_retries: int = 2) -> Any:
    last_err: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        sid = f"{session_hint or 'ai'}-{uuid.uuid4().hex[:8]}-{attempt}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=sid,
            system_message=SYSTEM_PROMPT,
        ).with_model(MODEL_PROVIDER, MODEL_NAME)
        try:
            raw = await chat.send_message(UserMessage(text=user_prompt))
            return _extract_json(raw)
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f'AI response invalid after retries: {last_err}')
