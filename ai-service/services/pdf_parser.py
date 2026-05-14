import re
import pdfplumber
from typing import Optional


def extract_student_info(file_path: str) -> dict:
    student_name = "Unknown"
    reg_no = "Unknown"
    name_pattern = re.compile(r"(?:student\s*name|name)\s*[:\-]\s*(.+)", re.IGNORECASE)
    reg_pattern = re.compile(r"(?:reg(?:istration)?\s*(?:no|number|#)|roll\s*no)\s*[:\-]\s*([A-Za-z0-9\-]+)", re.IGNORECASE)
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
    return {"studentName": student_name, "registrationNo": reg_no}


def extract_answers_from_sheet(file_path: str) -> list[dict]:
    answers = []
    numbered_q = re.compile(r"^(?:Q(?:uestion)?\s*(\d+)[.\):]|(\d+)\.\s)", re.IGNORECASE)
    bare_q = re.compile(r"^Question\s*[:\-]\s*", re.IGNORECASE)
    answer_marker = re.compile(r"^(?:answer|ans)\s*[:\-]", re.IGNORECASE)
    header_fields = re.compile(r"^(?:name|reg(?:istration)?\s*(?:no|number)?|subject|course|date|roll\s*no)\s*[:\-]", re.IGNORECASE)

    try:
        with pdfplumber.open(file_path) as pdf:
            full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

        lines = full_text.splitlines()
        current_q_num: Optional[int] = None
        q_counter = 0
        collecting_answer = False
        answer_lines: list[str] = []

        def flush_answer():
            if current_q_num is not None and answer_lines:
                answers.append({
                    "questionNumber": current_q_num,
                    "answerText": " ".join(answer_lines).strip(),
                })

        for line in lines:
            line = line.strip()
            if not line:
                continue
            if header_fields.match(line):
                continue
            qm = numbered_q.match(line)
            if qm:
                flush_answer()
                current_q_num = int(qm.group(1) or qm.group(2))
                collecting_answer = False
                answer_lines = []
                continue
            if bare_q.match(line):
                flush_answer()
                q_counter += 1
                current_q_num = q_counter
                collecting_answer = False
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

    except Exception as e:
        print(f"[pdf_parser] extract_answers_from_sheet error: {e}")

    return answers


def parse_exam_pdf(file_path: str) -> list[dict]:
    """
    Parse exam PDF into question dicts.

    Expected format per question:
        Q1. [Descriptive] (10 marks) [CLO-1]
        Subject: Operating System
        What is an Operating System? Explain its functions.
        Reference Answer:
        An Operating System is...
        Keywords: process management, memory management
    """
    questions = []

    header_pattern = re.compile(
        r"Q\d+\.\s+\[(\w+)\]\s+\((\d+)\s+marks?\)\s+\[([^\]]+)\]",
        re.IGNORECASE,
    )
    option_pattern    = re.compile(r"^([A-D])[)\.]\s*(.+)", re.IGNORECASE)
    correct_ans_pat   = re.compile(r"^correct\s+answer\s*[:\-]\s*(.+)", re.IGNORECASE)
    ref_ans_pat       = re.compile(r"^reference\s+answer\s*[:\-]", re.IGNORECASE)
    keyword_pat       = re.compile(r"^keywords?\s*[:\-]\s*(.+)", re.IGNORECASE)
    subject_pat       = re.compile(r"^subject\s*[:\-]\s*", re.IGNORECASE)
    skip_pat          = re.compile(r"^(autograde|official answer key|do not distribute)", re.IGNORECASE)

    try:
        with pdfplumber.open(file_path) as pdf:
            full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

        lines = full_text.splitlines()
        current: Optional[dict] = None
        question_text_lines: list[str] = []
        ref_answer_lines: list[str] = []

        # State flags
        collecting_ref      = False
        collecting_question = False

        def flush_question():
            nonlocal collecting_ref, collecting_question
            if current is None:
                return
            if question_text_lines:
                current["questionText"] = " ".join(question_text_lines).strip()
            if ref_answer_lines:
                current["referenceAnswer"] = " ".join(ref_answer_lines).strip()
            # Only append if we have actual question text
            if current.get("questionText"):
                questions.append(current)
            collecting_ref = False
            collecting_question = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Skip document header lines
            if skip_pat.match(stripped):
                continue

            # Skip lines that look like page headers (Course: | Term: | Total Marks:)
            if re.match(r"^(course|term|total marks)\s*[:\|]", stripped, re.IGNORECASE):
                continue

            # ── New question header ────────────────────────────────────────
            hm = header_pattern.search(stripped)
            if hm:
                flush_question()
                q_type = hm.group(1).lower()
                current = {
                    "type":            "mcq" if "mcq" in q_type else "descriptive",
                    "questionText":    "",
                    "maxMarks":        int(hm.group(2)),
                    "clo":             hm.group(3).strip(),
                    "options":         [] if "mcq" in q_type else None,
                    "referenceAnswer": None,
                    "keywords":        [],
                    "correctAnswer":   None,
                }
                question_text_lines = []
                ref_answer_lines    = []
                collecting_ref      = False
                collecting_question = True   # next non-special lines are question text
                continue

            if current is None:
                continue

            # ── Skip Subject: line — it's metadata not question text ───────
            if subject_pat.match(stripped):
                continue

            # ── MCQ options ───────────────────────────────────────────────
            om = option_pattern.match(stripped)
            if om and current.get("options") is not None:
                current["options"].append({
                    "label": om.group(1).upper(),
                    "text":  om.group(2).strip(),
                })
                collecting_ref      = False
                collecting_question = False
                continue

            # ── Correct answer (MCQ) ──────────────────────────────────────
            cam = correct_ans_pat.match(stripped)
            if cam:
                current["correctAnswer"] = cam.group(1).strip()
                collecting_ref      = False
                collecting_question = False
                continue

            # ── Reference Answer marker ───────────────────────────────────
            if ref_ans_pat.match(stripped):
                collecting_ref      = True
                collecting_question = False
                # Grab inline text after "Reference Answer:" if any
                inline = ref_ans_pat.sub("", stripped).strip()
                ref_answer_lines = [inline] if inline else []
                continue

            # ── Keywords ──────────────────────────────────────────────────
            km = keyword_pat.match(stripped)
            if km:
                current["keywords"] = [
                    k.strip() for k in re.split(r"[,;]", km.group(1)) if k.strip()
                ]
                collecting_ref      = False
                collecting_question = False
                continue

            # ── Accumulate reference answer lines ─────────────────────────
            if collecting_ref:
                ref_answer_lines.append(stripped)
                continue

            # ── Accumulate question text lines ────────────────────────────
            if collecting_question:
                question_text_lines.append(stripped)

        flush_question()

    except Exception as e:
        print(f"[pdf_parser] parse_exam_pdf error: {e}")

    return questions