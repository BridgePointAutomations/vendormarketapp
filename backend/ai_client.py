"""Claude client wrapper. Enforces JSON-only responses with retry."""
import os
import json
import re
from typing import Any, Optional

from anthropic import AsyncAnthropic

ANTHROPIC_API_KEY = os.environ['ANTHROPIC_API_KEY']
MODEL_NAME = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-4-5-20250929')

SYSTEM_PROMPT = (
    'You are the MarketOps AI assistant for solo market vendors '
    '(farmers markets, craft fairs). You reply with ONE JSON object or array '
    'and nothing else - no prose, no markdown fences, no commentary. '
    'Base every number on the provided history; if history is sparse, say so '
    "in the rationale and set confidence='low'. Never invent data."
)

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)


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
    # session_hint is kept for call-site compatibility; the Messages API is
    # stateless per-request so there's no session to attach it to.
    last_err: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            message = await _client.messages.create(
                model=MODEL_NAME,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{'role': 'user', 'content': user_prompt}],
            )
            raw = ''.join(block.text for block in message.content if block.type == 'text')
            return _extract_json(raw)
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f'AI response invalid after retries: {last_err}')
