import difflib
import os
import re
import tempfile
import time
from typing import Optional

import pdfplumber


def extract_student_info(file_path: str) -> dict:
    student_name = "Unknown"
    reg_no = "Unknown"
    name_pattern = re.compile(
        r"(?:student\s*name|name)\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    reg_pattern = re.compile(
        r"(?:reg(?:istration)?\s*(?:no|number|#)|roll\s*no)\s*[:\-]\s*([A-Za-z0-9\-]+)",
        re.IGNORECASE,
    )
    try:
        with pdfplumber.open(file_path) as pdf:
            text = pdf.pages[0].extract_text() or ""
            for line in text.splitlines():
                if student_name == "Unknown":
                    m = name_pattern.search(line)
                    if m:
                        student_name = m.group(1).strip()
                if reg_no == "Unknown":
                    m = reg_pattern.search(line)
                    if m:
                        reg_no = m.group(1).strip()
                if student_name != "Unknown" and reg_no != "Unknown":
                    break
    except Exception as e:
        print(f"[pdf_parser] extract_student_info error: {e}")

    # Fallback: extract roll number from filename (e.g. SP23-BCS-047.pdf or SP23-047.pdf)
    if reg_no == "Unknown":
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        roll_match = re.search(
            r"((?:SP|FA)\s*\d{2}(?:[\s_\-]+[A-Z]{2,4})?[\s_\-]+\d{1,4})",
            base_name,
            re.IGNORECASE,
        )
        if roll_match:
            reg_no = re.sub(r"[\s_]+", "-", roll_match.group(1).upper())

    return {"studentName": student_name, "registrationNo": reg_no}


def _parse_answers_from_lines(
    lines: list[str],
    expected_question_count: Optional[int] = None,
    expected_question_texts: Optional[list[str]] = None,
) -> list[dict]:
    answers = []
    numbered_q = re.compile(
        r"^(?:Q(?:uestion)?\s*(\d+)|(\d+))[.\):\-]?\s*(.*)$",
        re.IGNORECASE,
    )
    bare_q = re.compile(r"^Question\s*[:\-]\s*", re.IGNORECASE)
    answer_marker = re.compile(r"^(?:answer|ans)\s*[:\-]", re.IGNORECASE)
    header_fields = re.compile(
        r"^(?:name|reg(?:istration)?\s*(?:no|number)?|subject|course|date|roll\s*no)\s*[:\-]",
        re.IGNORECASE,
    )

    current_q_num: Optional[int] = None
    q_counter = 0
    collecting_answer = False
    answer_lines: list[str] = []

    def flush_answer():
        if current_q_num is not None and answer_lines:
            answers.append(
                {
                    "questionNumber": current_q_num,
                    "answerText": " ".join(answer_lines).strip(),
                }
            )

    for line in lines:
        line = line.strip()
        if not line or header_fields.match(line):
            continue
        prompt_number = _match_question_prompt(
            line,
            expected_question_texts,
        )
        if prompt_number is not None:
            if prompt_number == current_q_num:
                continue
            flush_answer()
            current_q_num = prompt_number
            collecting_answer = True
            answer_lines = []
            continue
        if _is_short_question_heading(line):
            next_question = (current_q_num or 0) + 1
            if (
                expected_question_count is None
                or next_question <= expected_question_count
            ):
                flush_answer()
                current_q_num = next_question
                collecting_answer = True
                answer_lines = []
                continue
        ocr_qm = _EXPLICIT_OCR_QUESTION_HEADER.match(line)
        if ocr_qm:
            question_number = int(ocr_qm.group(1))
            upper_bound = expected_question_count or 99
            if 1 <= question_number <= upper_bound:
                flush_answer()
                current_q_num = question_number
                collecting_answer = True
                inline_answer = ocr_qm.group(2).strip()
                answer_lines = [inline_answer] if inline_answer else []
                continue
        qm = numbered_q.match(line)
        if qm:
            question_number = int(qm.group(1) or qm.group(2))
            explicit_header = bool(qm.group(1))
            upper_bound = expected_question_count or 99
            bare_header_shape = bool(
                re.match(r"^\d{1,2}(?:\s*[.):\-]\s*.*)?$", line)
            )
            is_sequential_number = (
                current_q_num is None and question_number == 1
            ) or (
                current_q_num is not None
                and question_number == current_q_num + 1
            )
            if question_number <= upper_bound and (
                explicit_header or (is_sequential_number and bare_header_shape)
            ):
                flush_answer()
                current_q_num = question_number
                collecting_answer = True
                inline_answer = qm.group(3).strip()
                answer_lines = [inline_answer] if inline_answer else []
                continue
            if collecting_answer:
                answer_lines.append(line)
            continue
        if bare_q.match(line):
            flush_answer()
            q_counter += 1
            current_q_num = q_counter
            collecting_answer = True
            answer_lines = []
            continue
        if answer_marker.match(line):
            if current_q_num is None:
                current_q_num = 1
            collecting_answer = True
            inline = answer_marker.sub("", line).strip()
            answer_lines = [inline] if inline else []
            continue
        if collecting_answer:
            answer_lines.append(line)

    flush_answer()
    return sorted(answers, key=lambda answer: answer["questionNumber"])


def _extract_answers_with_handwriting_ocr(
    file_path: str,
    expected_question_count: Optional[int] = None,
    expected_question_texts: Optional[list[str]] = None,
) -> list[dict]:
    """
    Full OCR_SYSTEM handwriting pipeline:
    1. Render PDF pages at 288 DPI (`convert_pdf_to_images`)
    2. Preprocess pages with dynamic scaling, bilateral filter, CLAHE, unsharp mask (`preprocess_all_images`)
    3. Extract lines with PaddleOCR + low-confidence (< 0.35) TrOCR refinement + header splitting (`extract_text_from_image`)
    4. Segment questions using `segment_page_questions` (or prompt matching when present)
    5. Clean each question's raw OCR lines using `clean_question_answer` (Ollama `qwen2.5:1.5b` with SymSpell fallback)
    """
    from services.handwriting_ocr import extract_text_from_image
    from services.image_processor import preprocess_all_images
    from services.pdf_converter import convert_pdf_to_images
    from services.text_cleaner import (
        clean_question_answer,
        parse_header_line,
        segment_page_questions,
    )

    document_header = re.compile(
        r"^(?:student\s*name|name|reg(?:istration)?\s*(?:no|number|#)|roll\s*no|course|subject|date)\s*[:\-]",
        re.IGNORECASE,
    )
    raw_results = []

    with tempfile.TemporaryDirectory(prefix="autograde-handwriting-") as work_dir:
        conversion_started_at = time.perf_counter()
        image_paths = convert_pdf_to_images(file_path, output_folder=work_dir)
        if not image_paths:
            raise ValueError("The answer-sheet PDF contains no pages.")
        print(
            f"[pdf_parser] Rendered {len(image_paths)} page(s) in "
            f"{time.perf_counter() - conversion_started_at:.1f}s."
        )

        preprocessing_started_at = time.perf_counter()
        preprocessed_paths = preprocess_all_images(image_paths)
        print(
            f"[pdf_parser] Preprocessed {len(preprocessed_paths)} page(s) in "
            f"{time.perf_counter() - preprocessing_started_at:.1f}s."
        )
        for page_number, image_path in enumerate(preprocessed_paths, start=1):
            page_started_at = time.perf_counter()
            page_lines = extract_text_from_image(image_path)
            filtered_page_lines = [
                item
                for item in page_lines
                if item.get("text")
                and not document_header.match(item["text"].strip())
            ]
            raw_results.extend(filtered_page_lines)
            print(
                f"[pdf_parser] OCR page {page_number}/{len(preprocessed_paths)} "
                f"returned {len(filtered_page_lines)} line(s) in "
                f"{time.perf_counter() - page_started_at:.1f}s."
            )

    # Check if any line matches an unnumbered question prompt from the exam;
    # otherwise use OCR_SYSTEM's `segment_page_questions` + `infer_sequential_number`.
    has_prompt_headings = any(
        _match_question_prompt(item["text"].strip(), expected_question_texts)
        is not None
        for item in raw_results
        if not parse_header_line(item["text"].strip())[0]
    )

    if has_prompt_headings:
        answer_groups = _group_ocr_lines_by_question(
            raw_results,
            expected_question_count=expected_question_count,
            expected_question_texts=expected_question_texts,
        )
    else:
        segmented = segment_page_questions(raw_results, page_num=1)
        answer_groups: dict[int, list[dict]] = {}
        for q_item in segmented:
            q_num = q_item["question_number"]
            if (
                expected_question_count is not None
                and q_num > expected_question_count
            ):
                continue
            line_dicts = [
                {"text": line, "confidence": q_item.get("confidence", 0.90)}
                for line in q_item["raw_lines"]
            ]
            if q_num in answer_groups:
                answer_groups[q_num].extend(line_dicts)
            else:
                answer_groups[q_num] = line_dicts

    structured_answers = []
    for question_number in sorted(answer_groups.keys()):
        answer_lines = answer_groups[question_number]
        raw_line_strings = [
            item["text"].strip()
            for item in answer_lines
            if item.get("text")
            and item["text"].strip()
            and not document_header.match(item["text"].strip())
        ]
        if not raw_line_strings:
            continue

        question_header = f"Q#{question_number:02d}:"
        answer_text = clean_question_answer(
            raw_line_strings, question_header=question_header
        ).strip()
        if answer_text:
            structured_answers.append(
                {"questionNumber": question_number, "answerText": answer_text}
            )

    print(
        f"[pdf_parser] Structured {len(structured_answers)} answer(s) from "
        f"{len(raw_results)} OCR line(s)."
    )
    return sorted(
        structured_answers, key=lambda answer: answer["questionNumber"]
    )


_EXPLICIT_OCR_QUESTION_HEADER = re.compile(
    r"^\s*(?:q(?:uestion)?|[yYgGbB4])\s*#?\s*0?(\d{1,2})\b\s*[:.)\-]?\s*(.*)$",
    re.IGNORECASE,
)
_NUMBERED_QUESTION_HEADER = re.compile(r"^\s*0?(\d{1,2})\s*([:.)\-])\s*(.*)$")
_BARE_NUMBERED_QUESTION = re.compile(r"^\s*0?(\d{1,2})\s+(.+?)\s*$")


def _group_ocr_lines_by_question(
    ocr_lines: list[dict],
    expected_question_count: Optional[int] = None,
    expected_question_texts: Optional[list[str]] = None,
) -> dict[int, list[dict]]:
    """Split page-ordered OCR lines before language-model correction can rewrite labels."""
    from services.text_cleaner import infer_sequential_number, parse_header_line

    groups: dict[int, list[dict]] = {}
    current_question: Optional[int] = None

    for item in ocr_lines:
        text = item["text"].strip()
        prompt_number = _match_question_prompt(
            text,
            expected_question_texts,
        )
        if prompt_number is not None:
            if prompt_number == current_question:
                continue
            current_question = prompt_number
            groups.setdefault(current_question, [])
            continue
        if _is_short_question_heading(text):
            next_question = (current_question or 0) + 1
            if (
                expected_question_count is None
                or next_question <= expected_question_count
            ):
                current_question = next_question
                groups.setdefault(current_question, [])
                continue

        is_ocr_header, detected_num, rest = parse_header_line(text)
        explicit_header = _EXPLICIT_OCR_QUESTION_HEADER.match(text)
        numbered_header = _NUMBERED_QUESTION_HEADER.match(text)

        if is_ocr_header:
            expected_next = (current_question or 0) + 1
            question_number = infer_sequential_number(detected_num, expected_next)
            remainder = rest
            is_header = True
        elif explicit_header:
            question_number = int(explicit_header.group(1))
            remainder = explicit_header.group(2).strip()
            is_header = True
        elif numbered_header:
            question_number = int(numbered_header.group(1))
            remainder = numbered_header.group(3).strip()
            is_header = True
        else:
            bare_number = _BARE_NUMBERED_QUESTION.match(text)
            question_number = int(bare_number.group(1)) if bare_number else 0
            is_header = bool(
                bare_number
                and len(text) <= 24
                and question_number == (current_question or 0) + 1
            )
            remainder = ""

        upper_bound = expected_question_count or 99
        if is_header and 1 <= question_number <= upper_bound:
            if current_question is None or question_number > current_question:
                current_question = question_number
                groups.setdefault(current_question, [])
            if remainder:
                groups[current_question].append({**item, "text": remainder})
            continue

        if current_question is None:
            current_question = 1
        groups.setdefault(current_question, []).append(item)

    return groups


_QUESTION_LEAD_IN = re.compile(
    r"^(?:what|who|where|when|why|how|define|explain|describe|discuss|"
    r"compare|differentiate|distinguish|list|state|name|identify|write|"
    r"give|mention|outline|elaborate|question|q)\b",
    re.IGNORECASE,
)
_PROMPT_STOP_WORDS = {
    "a", "an", "and", "are", "between", "can", "define", "describe",
    "discuss", "do", "does", "explain", "for", "from", "give", "how",
    "in", "is", "it", "list", "me", "of", "on", "or", "the", "this",
    "to", "under", "what", "when", "where", "which", "who", "why",
    "with", "write",
}


def _is_short_question_heading(line: str) -> bool:
    return line.endswith("?") and len(line) < 120


def _prompt_tokens(text: str) -> set[str]:
    normalized = text.lower()
    normalized = re.sub(r"\bartificial\s+intelligence\b", " ai ", normalized)
    normalized = re.sub(r"\bmachine\s+learning\b", " ml ", normalized)
    return {
        token
        for token in re.findall(r"[a-z0-9]+", normalized)
        if token not in _PROMPT_STOP_WORDS
    }


def _match_question_prompt(
    line: str,
    expected_question_texts: Optional[list[str]],
) -> Optional[int]:
    """Match an unnumbered heading to its exam question, even when answered out of order."""
    if not expected_question_texts:
        return None

    candidate = line.strip()
    if len(candidate) > 120:
        return None
    if "?" not in candidate and not _QUESTION_LEAD_IN.match(candidate):
        return None

    candidate_tokens = _prompt_tokens(candidate)
    if not candidate_tokens:
        return None

    normalized_candidate = " ".join(sorted(candidate_tokens))
    matches = []
    for question_number, question_text in enumerate(
        expected_question_texts, start=1
    ):
        expected_tokens = _prompt_tokens(question_text)
        if not expected_tokens:
            continue

        overlap = len(expected_tokens & candidate_tokens) / len(expected_tokens)
        normalized_expected = " ".join(sorted(expected_tokens))
        similarity = difflib.SequenceMatcher(
            None,
            normalized_expected,
            normalized_candidate,
        ).ratio()
        if overlap >= 0.6 or similarity >= 0.72:
            matches.append((max(overlap, similarity), question_number))

    if not matches:
        return None
    matches.sort(reverse=True)
    if len(matches) > 1 and matches[0][0] - matches[1][0] < 0.1:
        return None

    return matches[0][1]


def extract_answers_from_sheet(
    file_path: str,
    expected_question_count: Optional[int] = None,
    expected_question_texts: Optional[list[str]] = None,
) -> list[dict]:
    try:
        with pdfplumber.open(file_path) as pdf:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

        text_answers = _parse_answers_from_lines(
            full_text.splitlines(),
            expected_question_count=expected_question_count,
            expected_question_texts=expected_question_texts,
        )
    except Exception as error:
        print(
            f"[pdf_parser] Text-layer extraction failed for {file_path}: {error}"
        )
        text_answers = []

    if expected_question_count is None:
        use_handwriting_ocr = not text_answers
    else:
        use_handwriting_ocr = len(text_answers) < expected_question_count

    if not use_handwriting_ocr:
        return text_answers

    try:
        ocr_answers = _extract_answers_with_handwriting_ocr(
            file_path,
            expected_question_count=expected_question_count,
            expected_question_texts=expected_question_texts,
        )
    except Exception as error:
        raise RuntimeError(
            f"Handwriting OCR failed for {file_path}: {error}"
        ) from error

    if not text_answers:
        return ocr_answers

    merged_answers = {
        answer["questionNumber"]: answer for answer in text_answers
    }
    for answer in ocr_answers:
        existing = merged_answers.get(answer["questionNumber"])
        if existing is None or len(answer["answerText"]) > len(
            existing["answerText"]
        ):
            merged_answers[answer["questionNumber"]] = answer
    return [merged_answers[number] for number in sorted(merged_answers)]


def parse_exam_pdf(file_path: str) -> list[dict]:
    """
    Parse exam PDF into question dicts.
    """
    questions = []

    header_pattern = re.compile(
        r"Q\d+\.\s+\[(\w+)\]\s+\((\d+)\s+marks?\)\s+\[([^\]]+)\]",
        re.IGNORECASE,
    )
    option_pattern = re.compile(r"^([A-D])[)\.]\s*(.+)", re.IGNORECASE)
    correct_ans_pat = re.compile(
        r"^correct\s+answer\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    ref_ans_pat = re.compile(r"^reference\s+answer\s*[:\-]", re.IGNORECASE)
    keyword_pat = re.compile(r"^keywords?\s*[:\-]\s*(.+)", re.IGNORECASE)
    subject_pat = re.compile(r"^subject\s*[:\-]\s*", re.IGNORECASE)
    skip_pat = re.compile(
        r"^(autograde|official answer key|do not distribute)", re.IGNORECASE
    )

    try:
        with pdfplumber.open(file_path) as pdf:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

        lines = full_text.splitlines()
        current: Optional[dict] = None
        question_text_lines: list[str] = []
        ref_answer_lines: list[str] = []

        collecting_ref = False
        collecting_question = False

        def flush_question():
            nonlocal collecting_ref, collecting_question
            if current is None:
                return
            if question_text_lines:
                current["questionText"] = " ".join(question_text_lines).strip()
            if ref_answer_lines:
                current["referenceAnswer"] = " ".join(ref_answer_lines).strip()
            if current.get("questionText"):
                questions.append(current)
            collecting_ref = False
            collecting_question = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            if skip_pat.match(stripped):
                continue

            if re.match(
                r"^(course|term|total marks)\s*[:\|]", stripped, re.IGNORECASE
            ):
                continue

            hm = header_pattern.search(stripped)
            if hm:
                flush_question()
                q_type = hm.group(1).lower()
                current = {
                    "type": "mcq" if "mcq" in q_type else "descriptive",
                    "questionText": "",
                    "maxMarks": int(hm.group(2)),
                    "clo": hm.group(3).strip(),
                    "options": [] if "mcq" in q_type else None,
                    "referenceAnswer": None,
                    "keywords": [],
                    "correctAnswer": None,
                }
                question_text_lines = []
                ref_answer_lines = []
                collecting_ref = False
                collecting_question = True
                continue

            if current is None:
                continue

            if subject_pat.match(stripped):
                continue

            om = option_pattern.match(stripped)
            if om and current.get("options") is not None:
                current["options"].append(
                    {
                        "label": om.group(1).upper(),
                        "text": om.group(2).strip(),
                    }
                )
                collecting_ref = False
                collecting_question = False
                continue

            cam = correct_ans_pat.match(stripped)
            if cam:
                current["correctAnswer"] = cam.group(1).strip()
                collecting_ref = False
                collecting_question = False
                continue

            if ref_ans_pat.match(stripped):
                collecting_ref = True
                collecting_question = False
                inline = ref_ans_pat.sub("", stripped).strip()
                ref_answer_lines = [inline] if inline else []
                continue

            km = keyword_pat.match(stripped)
            if km:
                current["keywords"] = [
                    k.strip()
                    for k in re.split(r"[,;]", km.group(1))
                    if k.strip()
                ]
                collecting_ref = False
                collecting_question = False
                continue

            if collecting_ref:
                ref_answer_lines.append(stripped)
                continue

            if collecting_question:
                question_text_lines.append(stripped)

        flush_question()

    except Exception as e:
        print(f"[pdf_parser] parse_exam_pdf error: {e}")

    return questions
