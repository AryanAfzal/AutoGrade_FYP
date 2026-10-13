import json
import os
import re
import time
import urllib.request

import symspellpy
from symspellpy import SymSpell


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "60.0"))
OCR_ENABLE_OLLAMA = os.getenv("OCR_ENABLE_OLLAMA", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
OLLAMA_CORRECTION_BUDGET_SECONDS = float(
    os.getenv("OLLAMA_CORRECTION_BUDGET_SECONDS", "45.0")
)

sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
try:
    symspell_directory = os.path.dirname(symspellpy.__file__)
    dictionary_path = os.path.join(
        symspell_directory,
        "frequency_dictionary_en_82_765.txt",
    )
    if os.path.exists(dictionary_path):
        sym_spell.load_dictionary(dictionary_path, term_index=0, count_index=1)

    bigram_path = os.path.join(
        symspell_directory,
        "frequency_bigramdictionary_en_243_342.txt",
    )
    if os.path.exists(bigram_path):
        sym_spell.load_bigram_dictionary(
            bigram_path,
            term_index=0,
            count_index=2,
        )
except Exception as error:
    print(f"SymSpell dictionary initialization warning: {error}")


OCR_REPLACEMENTS = [
    (r"\b0([a-zA-Z]{2,})\b", r"o\1"),
    (r"\b1([a-zA-Z]{2,})\b", r"l\1"),
    (r"^\s*([QqGgBb#\s]*0?(\d+))[:.-]?\s*$", r"Q# \2:"),
    (r"\b([Qq][#\s]*0?(\d+))\b", r"Q# \2:"),
]

IGNORED_PATTERNS = [
    r"^.*camscanner.*$",
    r"^cs\s*camscanner$",
    r"^camscanner$",
    r"^scanned\s+with.*$",
    r"^scanned\s+by.*$",
    r"^\*?\*?corrected text:?\*?\*?$",
    r"^here is the corrected.*$",
    r"^[\W_]+$",
    r"^[\d\s.,;:\-_=+/\\|~*^]+$",
]


def is_watermark_or_noise(text: str) -> bool:
    cleaned = text.strip().lower()
    return any(re.match(pattern, cleaned) for pattern in IGNORED_PATTERNS)


def _request_ollama(prompt: str, timeout: float = OLLAMA_TIMEOUT) -> str:
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "top_p": 0.9},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data.get("response", "").strip()


def correct_with_ollama(
    full_text: str,
    timeout: float = OLLAMA_TIMEOUT,
) -> str:
    """Ask local Ollama to repair OCR errors without rewriting the answer."""
    prompt = (
        "You are an OCR post-processing system.\n\n"
        "The following text was extracted from a handwritten document.\n"
        "Correct OCR errors while preserving the original meaning.\n\n"
        "Rules:\n"
        "1. Fix spelling and obvious OCR mistakes "
        "(e.g., 'Jorge Languaqe Models' -> 'Large Language Models', "
        "'feild' -> 'field', 'requlaly' -> 'regularly').\n"
        "2. Fix missing spaces, broken words, and punctuation.\n"
        "3. Correct words using the surrounding context.\n"
        "4. Preserve technical terms, numbers, formulas, and code.\n"
        "5. Do not add information that is not supported by the OCR text.\n"
        "6. Do not summarize or rewrite unnecessarily.\n"
        "7. Preserve question headers (e.g., 'Q# 01:') and list formatting "
        "on separate lines.\n"
        "8. Return ONLY the corrected text directly without preamble or "
        "commentary.\n\n"
        "OCR TEXT:\n"
        f"{full_text}"
    )

    corrected = _request_ollama(prompt, timeout=timeout)
    lines = [line.strip() for line in corrected.splitlines() if line.strip()]
    return "\n".join(line for line in lines if not is_watermark_or_noise(line))


def correct_spelling_symspell(text: str) -> str:
    """Apply known OCR substitutions and offline SymSpell correction."""
    if not text:
        return text

    header_match = re.match(
        r"^(([Qq]\s*#?\s*\d+|Question\s*\d+)[:.]?\s*)(.*)$",
        text,
        re.IGNORECASE,
    )
    if header_match:
        prefix = header_match.group(1)
        body = header_match.group(3)
    else:
        prefix = ""
        body = text

    for pattern, replacement in OCR_REPLACEMENTS:
        body = re.sub(pattern, replacement, body, flags=re.IGNORECASE)

    try:
        suggestions = sym_spell.lookup_compound(body, max_edit_distance=2)
    except Exception as error:
        print(f"SymSpell correction warning: {error}")
        suggestions = []
    if suggestions and suggestions[0].term:
        corrected = suggestions[0].term
        if body and body[0].isupper() and corrected:
            corrected = corrected[0].upper() + corrected[1:]
        body = corrected

    return f"{prefix}{body}".strip()


def clean_results(
    ocr_results: list[dict],
    deadline: float | None = None,
) -> list[dict]:
    """Filter OCR noise, try Ollama correction, then use offline SymSpell."""

    valid_lines = []
    for item in ocr_results:
        raw = item["text"].strip()
        if raw and not is_watermark_or_noise(raw):
            for pattern, replacement in OCR_REPLACEMENTS:
                raw = re.sub(pattern, replacement, raw, flags=re.IGNORECASE)
            raw = raw.strip()
            if raw and not is_watermark_or_noise(raw):
                valid_lines.append(raw)

    if not valid_lines:
        return []

    combined_text = "\n".join(valid_lines)
    try:
        if not OCR_ENABLE_OLLAMA:
            raise RuntimeError("Ollama OCR correction is disabled.")
        remaining_time = (
            OLLAMA_TIMEOUT
            if deadline is None
            else min(OLLAMA_TIMEOUT, deadline - time.monotonic())
        )
        if remaining_time <= 0:
            raise TimeoutError("Ollama correction budget has expired.")
        print(f"Applying AI post-correction with Ollama ({OLLAMA_MODEL})...")
        ai_corrected_text = correct_with_ollama(
            combined_text,
            timeout=remaining_time,
        )
        corrected_lines = [
            line.strip()
            for line in ai_corrected_text.splitlines()
            if line.strip()
        ]
        final_results = [
            {"text": line, "confidence": 0.98}
            for line in corrected_lines
            if not is_watermark_or_noise(line)
        ]
        if final_results:
            print(
                f"Ollama post-correction applied successfully "
                f"({len(final_results)} lines)."
            )
            return final_results
    except Exception as error:
        print(
            f"Ollama AI correction unavailable ({error}). "
            "Falling back to SymSpell..."
        )

    cleaned = []
    for item in ocr_results:
        raw_text = item["text"].strip()
        if not raw_text or is_watermark_or_noise(raw_text):
            continue

        for pattern, replacement in OCR_REPLACEMENTS:
            raw_text = re.sub(pattern, replacement, raw_text, flags=re.IGNORECASE)

        cleaned_text = correct_spelling_symspell(raw_text)
        if cleaned_text and not is_watermark_or_noise(cleaned_text):
            cleaned.append(
                {
                    "text": cleaned_text,
                    "confidence": item.get("confidence", 0.90),
                }
            )

    return cleaned
