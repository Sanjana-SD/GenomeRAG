"""Central configuration: loads .env once and exposes service settings."""
import json
import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"


def groq_model() -> str:
    return os.getenv("GROQ_MODEL") or DEFAULT_GROQ_MODEL


def groq_chat(client, messages, max_tokens: int = 250, temperature: float = 0.7) -> str:
    """Run a chat completion with the configured model and return the text.

    gpt-oss models spend completion tokens on hidden reasoning, so reasoning
    effort is kept low and extra headroom is added to max_tokens.
    """
    model = groq_model()
    kwargs = {}
    if model.startswith("openai/gpt-oss"):
        kwargs["reasoning_effort"] = "low"
        max_tokens += 400
    completion = client.chat.completions.create(
        model=model, messages=messages, max_tokens=max_tokens, temperature=temperature, **kwargs
    )
    return (completion.choices[0].message.content or "").strip()


def supabase_key() -> str:
    """Server-side Supabase key. SUPABASE_SERVICE_ROLE_KEY wins if both are set."""
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or ""


def supabase_key_kind() -> str:
    """Classify the configured key without revealing it: secret | publishable | service_role | anon | unknown | missing."""
    key = supabase_key()
    if not key:
        return "missing"
    if key.startswith("sb_secret_"):
        return "secret"
    if key.startswith("sb_publishable_"):
        return "publishable"
    if key.count(".") == 2:
        import base64
        try:
            part = key.split(".")[1]
            part += "=" * (-len(part) % 4)
            return json.loads(base64.urlsafe_b64decode(part)).get("role", "unknown")
        except Exception:
            return "unknown"
    return "unknown"


def get_supabase_client():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL"), supabase_key()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not set in .env")
    return create_client(url, key)
