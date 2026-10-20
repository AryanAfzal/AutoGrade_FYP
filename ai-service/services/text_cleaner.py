import json
import os
import re
import shutil
import subprocess
import time
import urllib.request

import symspellpy
from symspellpy import SymSpell

# Configuration
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
    os.getenv("OLLAMA_CORRECTION_BUDGET_SECONDS", "180.0")
)

_ollama_start_attempted = False


def ensure_ollama_running() -> bool:
    """Ensure local Ollama server is running; if not, start `ollama serve` in the background."""
    global _ollama_start_attempted
    tags_url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags"
    try:
        with urllib.request.urlopen(tags_url, timeout=2.0) as resp:
            if resp.status == 200:
                return True
    except Exception:
        pass

    if _ollama_start_attempted:
        return False

    _ollama_start_attempted = True
    ollama_bin = shutil.which("ollama")
    if not ollama_bin:
        local_candidate = os.path.expandvars(
            r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
        )
        if os.path.exists(local_candidate):
            ollama_bin = local_candidate

    if not ollama_bin:
        return False

    try:
        print(f"[text_cleaner] Starting Ollama background server via {ollama_bin} serve ...")
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen(
            [ollama_bin, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        for _ in range(16):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen(tags_url, timeout=1.5) as resp:
                    if resp.status == 200:
                        print("[text_cleaner] Ollama server is up and ready.")
                        return True
            except Exception:
                continue
    except Exception as error:
        print(f"[text_cleaner] Could not auto-start Ollama: {error}")

    return False


# Initialize SymSpell for fast offline spelling correction
sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
try:
    base_dir = os.path.dirname(symspellpy.__file__)
    dict_path = os.path.join(base_dir, "frequency_dictionary_en_82_765.txt")
    if os.path.exists(dict_path):
        sym_spell.load_dictionary(dict_path, term_index=0, count_index=1)

    bigram_path = os.path.join(
        base_dir, "frequency_bigramdictionary_en_243_342.txt"
    )
    if os.path.exists(bigram_path):
        sym_spell.load_bigram_dictionary(
            bigram_path, term_index=0, count_index=2
        )
except Exception as e:
    print(f"SymSpell dictionary init: {e}")

# General handwriting OCR character confusables (domain-agnostic)
GENERAL_OCR_CONFUSABLES = [
    (r"\b0([a-zA-Z]{2,})\b", r"o\1"),       # 0ver -> over
    (r"\b([a-zA-Z]{2,})0\b", r"\1o"),       # int0 -> into
    (r"\b1([a-zA-Z]{2,})\b", r"l\1"),       # 1azy -> lazy
    (r"\b([a-zA-Z]{2,})1\b", r"\1l"),       # cal1 -> call
    (r"\s*([,\.:;])\s*([,\.:;])+", r"\1"),  # multiple repeated punctuation
    (r"\s+ex\s+[\'\"`]\s+", " "),           # OCR scan edge noise
    (r"\s+[\.:;]\s+", " "),                 # floating punctuation between words
]

# Question header patterns (handles Qno 1:-), Q#01:, Q# 02, #01., C#O2, #O3, PHO 1 ., 00, no 26- ms:, Q#?:, Qno1)A Ans:-)
HEADER_PREFIX_PATTERN = r"(?:[Oo0]{2,3}|(?:Q\s*(?:no\.?|uestion\s*(?:no\.?)?|#|\.)?|PH[O0o#]?|P#|[A-Za-z0-9]\s*#|#|no\.?)\s*[Oo0\s]*([?\d]+)?)"

HEADER_PATTERN_STANDALONE = re.compile(
    rf"^{HEADER_PREFIX_PATTERN}\s*[:.\-)=~]*(?:\s*\(?[A-Za-z]?\)?\s*[:.\-)=~]*\s*(?:ans|ms|anwser|answer)[\s:.\-]*)?$",
    re.IGNORECASE,
)
HEADER_PATTERN_INLINE = re.compile(
    rf"^{HEADER_PREFIX_PATTERN}\s*[:.\-)=~]*(?:\s*\(?[A-Za-z]?\)?\s*[:.\-)=~]*\s*(?:ans|ms|anwser|answer)[\s:.\-]*)?\s+(.+)$",
    re.IGNORECASE,
)

# Watermarks and scanner noise to ignore
IGNORED_PATTERNS = [
    r"^.*camscanner.*$",
    r"^cs\s*camscanner.*$",
    r"^.*63\s*camscanner.*$",
    r"^camscanner.*$",
    r"^scanned\s+with.*$",
    r"^scanned\s+by.*$",
    r"^\*?\*?corrected text:?\*?\*?$",
    r"^here is the corrected.*$",
    r"^[\W_]+$",
    r"^[\d\s.,;:\-_=+/\\|~*^]+$",
]


def parse_header_line(text: str):
    """
    Parses a line of text to check if it contains a question header.
    Returns: (is_header: bool, detected_number: int | None, remaining_text: str)
    """
    if not text:
        return False, None, ""
    t = text.strip()

    # Standalone header match (e.g. Q#01:, C#O2, #O3, Q#?:, 00, no 26- ms:, Qno1)A Ans:-)
    m_stand = HEADER_PATTERN_STANDALONE.match(t)
    if m_stand:
        raw_n = m_stand.group(1)
        num = int(raw_n) if raw_n and raw_n.isdigit() else None
        return True, num, ""

    # Inline header match (e.g. Qno 1:-) Large language models...)
    m_inline = HEADER_PATTERN_INLINE.match(t)
    if m_inline:
        raw_n = m_inline.group(1)
        num = int(raw_n) if raw_n and raw_n.isdigit() else None
        rest = m_inline.group(2).strip()
        # If rest is just answer marker like 'Ans:-' or 'ms:'
        if re.match(
            r"^(?:\(?[A-Za-z]?\)?\s*[:.\-)=~]*\s*)?(?:ans|ms|anwser|answer)[\s:.\-]*$",
            rest,
            re.IGNORECASE,
        ):
            return True, num, ""
        return True, num, rest

    return False, None, t


def looks_like_header_token(text: str) -> bool:
    if not text:
        return False
    is_h, _, _ = parse_header_line(text)
    return is_h


def normalize_header_text(text: str) -> str:
    is_h, num, rest = parse_header_line(text)
    if is_h:
        prefix = f"Q#{num:02d}:" if num is not None and num > 0 else "Q#?:"
        return f"{prefix} {rest}".strip() if rest else prefix
    return text


def is_watermark_or_noise(text: str) -> bool:
    if not text:
        return True
    cleaned = text.strip()
    c_lower = cleaned.lower()
    # Watermarks always take precedence over header tokens
    if (
        "camscanner" in c_lower
        or "scanned with" in c_lower
        or "scanned by" in c_lower
    ):
        return True
    for pattern in IGNORED_PATTERNS:
        if re.match(pattern, c_lower):
            return True
    if looks_like_header_token(cleaned):
        return False
    return False


def pre_clean_general_ocr(text: str) -> str:
    """Domain-agnostic cleanup of common OCR scanning noise."""
    res = text
    for pat, repl in GENERAL_OCR_CONFUSABLES:
        res = re.sub(pat, repl, res)
    return res.strip()


def infer_sequential_number(detected_num: int | None, expected_num: int) -> int:
    """
    Intelligently ensures question numbers in an exam follow a logical sequence: 1, 2, 3...
    If OCR misreads 'Qno 2' as '00', '0', '26', or misses a digit, it recovers
    the correct sequential question number automatically.
    """
    if detected_num is None or detected_num <= 0:
        return expected_num
    if detected_num == expected_num:
        return expected_num
    # If detected_num starts with expected_num (e.g. 26 when expected 2, due to ':-)' read as '6-')
    if str(detected_num).startswith(str(expected_num)):
        return expected_num
    # If detected number is far out of sequence (e.g. OCR noise 26, 42 when expected is 2)
    if detected_num > expected_num + 2:
        return expected_num
    return detected_num


def segment_page_questions(
    page_items: list,
    page_num: int = 1,
    start_expected_num: int = 1,
) -> list:
    """
    Segments OCR lines into question blocks with headers and raw answer lines.
    Applies sequential numbering intelligence to guarantee accurate Q# labeling.
    """
    questions = []
    curr_detected_num = None
    curr_lines = []
    curr_confs = []
    has_header_started = False

    def flush_question():
        nonlocal curr_detected_num, curr_lines, curr_confs
        if curr_lines:
            questions.append(
                {
                    "detected_num": curr_detected_num,
                    "page": page_num,
                    "raw_lines": list(curr_lines),
                    "confidence": (
                        round(sum(curr_confs) / len(curr_confs), 2)
                        if curr_confs
                        else 0.90
                    ),
                }
            )
            curr_lines = []
            curr_confs = []

    for item in page_items:
        text = item["text"].strip()
        conf = item.get("confidence", 0.90)

        if not text or is_watermark_or_noise(text):
            continue

        is_h, num_val, rest = parse_header_line(text)
        if is_h:
            flush_question()
            curr_detected_num = num_val
            has_header_started = True
            if rest:
                curr_lines = [rest]
                curr_confs = [conf]
            continue

        # Question ending with ? (e.g. What is CI/CD?)
        if text.endswith("?") and len(text) < 120 and not curr_lines:
            flush_question()
            curr_detected_num = None
            has_header_started = True
            curr_lines = [text]
            curr_confs = [conf]
            continue

        # Regular answer line
        if not has_header_started:
            curr_detected_num = start_expected_num
            has_header_started = True

        curr_lines.append(text)
        curr_confs.append(conf)

    flush_question()

    # Intelligently assign sequential question numbers
    expected_num = start_expected_num
    for q in questions:
        actual_num = infer_sequential_number(q.get("detected_num"), expected_num)
        q["question_number"] = actual_num
        q["question"] = f"Q#{actual_num:02d}:"
        expected_num = actual_num + 1

    return questions


def clean_answer_with_ollama(
    raw_lines: list,
    question_header: str,
    timeout: float = OLLAMA_TIMEOUT,
) -> str:
    """
    Sends a single question's OCR text to Ollama for zero-shot context-aware post-correction.
    Uses strict fidelity instructions to eliminate hallucinations and output ONLY the answer text.
    """
    raw_text = "\n".join(raw_lines).strip()
    if not raw_text:
        return ""

    if not OCR_ENABLE_OLLAMA:
        raise RuntimeError("Ollama OCR correction is disabled.")

    ensure_ollama_running()

    cleaned_input = pre_clean_general_ocr(raw_text)

    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "system": (
            "You are an automated grading system OCR text cleaner for student exam papers.\n"
            "You receive raw, noisy OCR lines for one single student answer.\n"
            "Task: Repair spelling, broken words, and OCR errors into clean, natural English sentences.\n"
            "Rules:\n"
            "1. Output ONLY the clean answer text directly. No intro, no conversational preambles, no quotes, no question headers.\n"
            "2. Do NOT invent new topics or medical/healthcare contexts.\n"
            "3. Stay as close to the student's handwritten words as possible. Do not extrapolate."
        ),
        "prompt": f'Clean the OCR errors in this student answer for {question_header}:\n"""\n{cleaned_input}\n"""',
        "stream": False,
        "options": {
            "temperature": 0.0,
            "top_p": 0.1,
            "stop": ["Question:", "Q#", "Qno", "Certainly", "Sure,"],
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        corrected = data.get("response", "").strip()

        # 1. Post-filtering cleanups to remove accidental code block formatting
        corrected = re.sub(r"```(?:[a-zA-Z]+)?\s*", "", corrected)
        corrected = re.sub(r"\s*```", "", corrected)

        # 2. Aggressively strip conversational preambles (e.g. "Certainly! Here is...", "Here is the polished version...", "Sure! ...")
        corrected = re.sub(
            r"^(?:certainly!?|sure!?|here\s+(?:is|are)|below\s+is|the\s+following\s+is|this\s+is)[^\n]*\n+",
            "",
            corrected,
            flags=re.IGNORECASE,
        ).strip()

        # 3. Strip any embedded headers at start (e.g. "Q#01:", "Q#02:", "Qno 1:-)", "Q#?:")
        corrected = re.sub(
            r"^(?:Q\s*(?:no\.?|uestion\s*(?:no\.?)?|#|\.)?|PH[O0o#]?|P#|[A-Za-z0-9]\s*#|#)\s*[Oo0\s]*[?\d]*[:.\-)=~]*\s*",
            "",
            corrected,
            flags=re.IGNORECASE,
        ).strip()

        # 4. Strip stray "(See page...)" or similar hallucinations
        corrected = re.sub(
            r"\(?\s*see\s+page\s*[\d\s.,;:]+\)?",
            "",
            corrected,
            flags=re.IGNORECASE,
        ).strip()

        # 5. Strip surrounding quotes
        corrected = re.sub(r'^["\']|["\']$', "", corrected).strip()
        return corrected


def correct_spelling_symspell(text: str) -> str:
    """Fast offline compound spell checking using SymSpell and regex rules."""
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

    body = pre_clean_general_ocr(body)

    try:
        suggestions = sym_spell.lookup_compound(body, max_edit_distance=2)
        if suggestions and suggestions[0].term:
            corrected = suggestions[0].term
            if body and body[0].isupper() and len(corrected) > 0:
                corrected = corrected[0].upper() + corrected[1:]
            body = corrected
    except Exception:
        pass

    return f"{prefix}{body}".strip()


def clean_answer_fallback(raw_lines: list) -> str:
    raw_text = "\n".join(raw_lines).strip()
    pre = pre_clean_general_ocr(raw_text)
    lines = [l.strip() for l in pre.split("\n") if l.strip()]
    result = []
    for line in lines:
        if not line or is_watermark_or_noise(line):
            continue
        cleaned = correct_spelling_symspell(line)
        if cleaned and not is_watermark_or_noise(cleaned):
            result.append(cleaned)
    return " ".join(result).strip()


def clean_question_answer(
    raw_lines: list,
    question_header: str = "Q#01:",
    timeout: float = OLLAMA_TIMEOUT,
) -> str:
    """Cleans a single question's answer using Ollama, falling back to SymSpell if unavailable."""
    if not raw_lines:
        return ""
    try:
        print(
            f"[text_cleaner] Refining {question_header} with Ollama ({OLLAMA_MODEL})..."
        )
        corrected = clean_answer_with_ollama(
            raw_lines, question_header, timeout=timeout
        )
        if corrected:
            print(f"[text_cleaner] Ollama refined {question_header} -> {corrected[:80]}...")
            return corrected
    except Exception as e:
        print(f"Ollama per-question cleaning unavailable ({e}). Using fallback...")

    return clean_answer_fallback(raw_lines)


def clean_results(
    ocr_results: list[dict],
    deadline: float | None = None,
    question_header: str = "Q#01:",
) -> list[dict]:
    """Clean a list of OCR line dicts for a single question using Ollama (or SymSpell fallback)."""
    raw_lines = [
        item["text"].strip()
        for item in ocr_results
        if item.get("text") and not is_watermark_or_noise(item["text"].strip())
    ]
    if not raw_lines:
        return []

    timeout = (
        OLLAMA_TIMEOUT
        if deadline is None
        else max(5.0, min(OLLAMA_TIMEOUT, deadline - time.monotonic()))
    )
    cleaned_paragraph = clean_question_answer(
        raw_lines, question_header=question_header, timeout=timeout
    )
    if cleaned_paragraph:
        return [{"text": cleaned_paragraph, "confidence": 0.98}]

    cleaned = []
    for item in ocr_results:
        raw_text = item["text"].strip()
        if not raw_text or is_watermark_or_noise(raw_text):
            continue
        cleaned_text = correct_spelling_symspell(raw_text)
        if cleaned_text and not is_watermark_or_noise(cleaned_text):
            cleaned.append(
                {
                    "text": cleaned_text,
                    "confidence": item.get("confidence", 0.90),
                }
            )
    return cleaned
