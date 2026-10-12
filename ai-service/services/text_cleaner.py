from __future__ import annotations

import difflib
import json
import os
import re
import time
import urllib.request

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "60.0"))
OLLAMA_CORRECTION_BUDGET_SECONDS = min(
    float(os.getenv("OCR_OLLAMA_BUDGET_SECONDS", "45.0")),
    45.0,
)
OCR_ENABLE_OLLAMA = os.getenv("OCR_ENABLE_OLLAMA", "true").lower() == "true"
OLLAMA_MAX_CHUNK_CHARS = 2400

# An edit is accepted only if the corrected line is at least this similar (0-1) to the
# original line, character by character. Raise it to be stricter, lower it to allow more.
MIN_LINE_SIMILARITY = float(os.getenv("OCR_MIN_LINE_SIMILARITY", "0.80"))
MAX_WORD_COUNT_CHANGE = 2      # corrected line may have at most this many words more/fewer
NEW_WORD_MIN_RESEMBLANCE = 0.6  # a new word must resemble some original word this much

IGNORED_PATTERNS = [
    r"^.*camscanner.*$",
    r"^cs\s*camscanner$",
    r"^camscanner$",
    r"^scanned\s+with.*$",
    r"^scanned\s+by.*$",
    r"^\*?\*?corrected text:?\*?\*?$",
    r"^here is the corrected.*$",
    r"^[\W_]+$",
]

_WORD = re.compile(r"[A-Za-z0-9']+")
_NUMBERED_LINE = re.compile(r"^\s*(\d+)\s*\|\s?(.*)$")


def is_watermark_or_noise(text: str) -> bool:
    cleaned = text.strip().lower()
    return any(re.match(pattern, cleaned) for pattern in IGNORED_PATTERNS)


# ── Validation ────────────────────────────────────────────────────────────────
def _words(text: str) -> list[str]:
    return [word.lower() for word in _WORD.findall(text)]


def is_safe_correction(original: str, corrected: str) -> bool:
    """True only if `corrected` is a small spelling-level edit of `original`."""
    corrected = corrected.strip()
    if not corrected:
        return False

    original_words = _words(original)
    corrected_words = _words(corrected)
    if not corrected_words:
        return False
    if abs(len(corrected_words) - len(original_words)) > MAX_WORD_COUNT_CHANGE:
        return False

    similarity = difflib.SequenceMatcher(None, original.lower(), corrected.lower()).ratio()
    if similarity < MIN_LINE_SIMILARITY:
        return False

    def resembles_any(word: str, pool: list[str]) -> bool:
        return word in pool or any(
            difflib.SequenceMatcher(None, word, other).ratio() >= NEW_WORD_MIN_RESEMBLANCE
            for other in pool
        )

    # Every word the model introduced must look like a repaired version of a word that
    # was already on this line. A word that resembles nothing is an invention.
    for word in corrected_words:
        if len(word) > 2 and not resembles_any(word, original_words):
            return False

    # And every real word on the line must survive (possibly repaired). This stops the
    # model from silently dropping words such as "without" or "spam".
    for word in original_words:
        if len(word) > 2 and not resembles_any(word, corrected_words):
            return False
    return True


# ── Ollama ────────────────────────────────────────────────────────────────────
def _ask_ollama(prompt: str, timeout: float = OLLAMA_TIMEOUT) -> str:
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "top_p": 0.9},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data.get("response", "").strip()


def _build_prompt(numbered_lines: str) -> str:
    return (
        "You are fixing misread or misspelled words in the OCR output of ONE student's "
        "handwritten exam answer. Every line is numbered like \"3| text\".\n\n"
        "Rules:\n"
        "1. Return EXACTLY one line for every input line, with the same number, in the "
        "same order, in the same format \"N| text\".\n"
        "2. Fix only words that are clearly misread or misspelled, using the "
        "neighbouring lines for context.\n"
        "3. Never merge, split, move, add or delete lines. Never add, remove or "
        "reorder words.\n"
        "4. Do not improve grammar, wording or punctuation. If a word could be correct, "
        "leave it as it is.\n"
        "5. If you are unsure about a word, leave it exactly as it is.\n"
        "6. Output only the numbered lines and nothing else.\n\n"
        "Example input:\n"
        "1| The qiuck brown fox jumps ovr\n"
        "2| the lazy dog\n"
        "Example output:\n"
        "1| The quick brown fox jumps over\n"
        "2| the lazy dog\n\n"
        "Now fix these lines:\n"
        f"{numbered_lines}"
    )


def _parse_numbered(reply: str) -> dict[int, str]:
    parsed: dict[int, str] = {}
    for raw_line in reply.splitlines():
        match = _NUMBERED_LINE.match(raw_line)
        if match:
            parsed.setdefault(int(match.group(1)), match.group(2).strip())
    return parsed


def correct_lines(lines: list[str], deadline: float | None = None) -> list[str]:
    """
    Return one line for every input line. A line is replaced by the model's version
    only when is_safe_correction() accepts it; otherwise the original is kept.
    """
    result = list(lines)
    edited = unchanged = rejected = missing = 0
    skipped = 0
    started_at = time.perf_counter()
    if deadline is None:
        deadline = time.monotonic() + OLLAMA_CORRECTION_BUDGET_SECONDS

    # Split into chunks that fit in the model's comfortable context.
    start = 0
    while start < len(lines):
        end, size = start, 0
        while end < len(lines) and (end == start or size + len(lines[end]) + 6 <= OLLAMA_MAX_CHUNK_CHARS):
            size += len(lines[end]) + 6
            end += 1

        numbered = "\n".join(f"{i + 1}| {lines[start + i]}" for i in range(end - start))
        remaining_seconds = deadline - time.monotonic()
        if remaining_seconds <= 0:
            skipped += end - start
            start = end
            continue

        try:
            reply = _parse_numbered(
                _ask_ollama(
                    _build_prompt(numbered),
                    timeout=min(OLLAMA_TIMEOUT, remaining_seconds),
                )
            )
        except Exception as error:
            print(f"[text_cleaner] Ollama unavailable ({error}); keeping raw OCR for these lines.")
            start = end
            continue

        for i in range(end - start):
            candidate = reply.get(i + 1)
            if candidate is None:
                missing += 1
            elif is_safe_correction(lines[start + i], candidate):
                if candidate != lines[start + i]:
                    result[start + i] = candidate
                    edited += 1
                else:
                    unchanged += 1
            else:
                rejected += 1
        start = end

    if edited or unchanged or rejected or missing or skipped:
        print(
            f"[text_cleaner] LLM: {edited} line(s) corrected, {unchanged} unchanged, "
            f"{rejected} rejected as unsafe, {missing} missing from the reply "
            f"{skipped} skipped after the per-sheet time budget "
            f"(all uncorrected lines keep the raw OCR text); "
            f"elapsed={time.perf_counter() - started_at:.1f}s."
        )
    return result


def correct_with_ollama(full_text: str) -> str:
    """Kept for backward compatibility: guarded correction of multi-line text."""
    lines = [line.strip() for line in full_text.splitlines() if line.strip()]
    return "\n".join(correct_lines(lines))


# ── Public function ───────────────────────────────────────────────────────────
def clean_results(
    ocr_results: list[dict],
    deadline: float | None = None,
) -> list[dict]:
    valid_items = []
    for item in ocr_results:
        raw_text = item["text"].strip()
        if raw_text and not is_watermark_or_noise(raw_text):
            valid_items.append({**item, "text": raw_text})

    if not valid_items:
        return []

    original_lines = [item["text"] for item in valid_items]
    final_lines = (
        correct_lines(original_lines, deadline=deadline)
        if OCR_ENABLE_OLLAMA
        else original_lines
    )

    cleaned = []
    for item, line in zip(valid_items, final_lines):
        if not line or is_watermark_or_noise(line):
            continue
        confidence = item.get("confidence")
        cleaned.append(
            {"text": line, "confidence": round(float(confidence), 2) if confidence is not None else 0.0}
        )
    return cleaned