"""
pdf_parser.py
-------------
All pdfplumber-based extraction.

Two responsibilities:
  1. extract_student_info(file_path)
       → reads top portion of an answer sheet PDF
       → returns { studentName, registrationNo }

  2. parse_exam_pdf(file_path)
       → reads a structured exam / answer-key PDF
       → returns list of question dicts matching CreateQuestionDto shape

Assumptions about PDF layout (adjust regexes to match your actual PDFs):
  - Answer sheets have lines like:
        "Name: Muhammad Ali"
        "Reg No: 2021-CS-001"
    in the first page, top half.
  - Exam PDFs have questions formatted like:
        "Q1. [MCQ] (2 marks) [CLO1]"
        "What is the time complexity of binary search?"
        "Correct Answer: B"
        -- or --
        "Q2. [Descriptive] (5 marks) [CLO2]"
        "Explain the concept of recursion."
        "Reference Answer: A function that calls itself..."
        "Keywords: base case, call stack, recursive case"
"""

import re
import pdfplumber
from typing import Optional


# ---------------------------------------------------------------------------
# Answer-sheet: extract student metadata
# ---------------------------------------------------------------------------

def extract_student_info(file_path: str) -> dict:
    """
    Scan the first page of an answer-sheet PDF for student name and reg no.
    Returns dict with keys: studentName, registrationNo (both str).
    Falls back to 'Unknown' if patterns not found.
    """
    student_name = "Unknown"
    reg_no = "Unknown"

    # Patterns are flexible — handles extra spaces, colons, dashes
    name_pattern = re.compile(
        r"(?:student\s*name|name)\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    reg_pattern = re.compile(
        r"(?:reg(?:istration)?\s*(?:no|number|#)|roll\s*no)\s*[:\-]\s*([A-Za-z0-9\-]+)",
        re.IGNORECASE,
    )

    try:
        with pdfplumber.open(file_path) as pdf:
            # Only scan first page — student info is always in the header
            first_page = pdf.pages[0]
            text = first_page.extract_text() or ""

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


# ---------------------------------------------------------------------------
# Answer-sheet: extract per-question answers
# ---------------------------------------------------------------------------

def extract_answers_from_sheet(file_path: str) -> list[dict]:
    """
    Parse the body of a student answer sheet into a list of answer blocks.

    Expected format per question block:
        Q1. <question text possibly multi-line>
        Answer: <student's answer text>

    Returns list of dicts:
        { questionNumber: int, answerText: str }

    These are matched against exam questions by index order.
    """
    answers = []

    # Matches "Q1.", "Q1)", "Question 1:", "1." at start of line
    question_marker = re.compile(
        r"^(?:Q(?:uestion)?\s*(\d+)[.\):]|(\d+)\.\s)", re.IGNORECASE
    )
    answer_marker = re.compile(r"^(?:answer|ans)\s*[:\-]", re.IGNORECASE)

    try:
        with pdfplumber.open(file_path) as pdf:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

        lines = full_text.splitlines()
        current_q_num: Optional[int] = None
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

            # Check if this line starts a new question
            qm = question_marker.match(line)
            if qm:
                flush_answer()
                current_q_num = int(qm.group(1) or qm.group(2))
                collecting_answer = False
                answer_lines = []
                continue

            # Check if this line starts the answer block
            if answer_marker.match(line):
                collecting_answer = True
                # Grab inline text after "Answer:"
                inline = answer_marker.sub("", line).strip()
                answer_lines = [inline] if inline else []
                continue

            # Accumulate answer lines
            if collecting_answer:
                answer_lines.append(line)

        flush_answer()

    except Exception as e:
        print(f"[pdf_parser] extract_answers_from_sheet error: {e}")

    return answers


# ---------------------------------------------------------------------------
# Exam PDF: parse questions + answer key into CreateQuestionDto shape
# ---------------------------------------------------------------------------

def parse_exam_pdf(file_path: str) -> list[dict]:
    """
    Parse an exam/answer-key PDF into a list of question dicts.

    Expected PDF block format (one block per question):
        Q1. [MCQ] (2 marks) [CLO1]
        What is the output of print(2**3)?
        Options:
          A) 6
          B) 8
          C) 9
          D) 16
        Correct Answer: B

        Q2. [Descriptive] (5 marks) [CLO2]
        Explain the difference between stack and queue.
        Reference Answer: A stack is LIFO while a queue is FIFO...
        Keywords: LIFO, FIFO, push, pop, enqueue, dequeue

    Returns list of dicts matching CreateQuestionDto:
        {
          type: 'mcq' | 'descriptive',
          questionText: str,
          maxMarks: int,
          clo: str,
          correctAnswer?: str,       # MCQ only
          referenceAnswer?: str,     # Descriptive only
          keywords?: list[str],      # Descriptive only
          options?: list[{label, text}]  # MCQ only
        }
    """
    questions = []

    # Header line pattern: "Q1. [MCQ] (2 marks) [CLO1]"
    header_pattern = re.compile(
        r"Q\d+\.\s+\[(\w+)\]\s+\((\d+)\s+marks?\)\s+\[([^\]]+)\]",
        re.IGNORECASE,
    )
    option_pattern = re.compile(r"^([A-D])[)\.]\s*(.+)", re.IGNORECASE)
    correct_ans_pattern = re.compile(
        r"^correct\s+answer\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    ref_ans_pattern = re.compile(
        r"^reference\s+answer\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    keyword_pattern = re.compile(
        r"^keywords?\s*[:\-]\s*(.+)", re.IGNORECASE
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

        def flush_question():
            nonlocal collecting_ref
            if current is None:
                return
            if question_text_lines:
                current["questionText"] = " ".join(question_text_lines).strip()
            if ref_answer_lines:
                current["referenceAnswer"] = " ".join(ref_answer_lines).strip()
            questions.append(current)
            collecting_ref = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # New question header
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
                }
                question_text_lines = []
                ref_answer_lines = []
                collecting_ref = False
                continue

            if current is None:
                continue

            # MCQ option lines: "A) ..." or "A. ..."
            om = option_pattern.match(stripped)
            if om and current.get("options") is not None:
                current["options"].append({
                    "label": om.group(1).upper(),
                    "text": om.group(2).strip(),
                })
                collecting_ref = False
                continue

            # Correct answer (MCQ)
            cam = correct_ans_pattern.match(stripped)
            if cam:
                current["correctAnswer"] = cam.group(1).strip()
                collecting_ref = False
                continue

            # Reference answer start (Descriptive)
            ram = ref_ans_pattern.match(stripped)
            if ram:
                collecting_ref = True
                inline = ram.group(1).strip()
                ref_answer_lines = [inline] if inline else []
                continue

            # Keywords (Descriptive)
            km = keyword_pattern.match(stripped)
            if km:
                raw_kw = km.group(1)
                current["keywords"] = [
                    k.strip() for k in re.split(r"[,;]", raw_kw) if k.strip()
                ]
                collecting_ref = False
                continue

            # Accumulate reference answer (multi-line)
            if collecting_ref:
                ref_answer_lines.append(stripped)
                continue

            # Otherwise it's part of the question text
            if not question_text_lines and not any([
                option_pattern.match(stripped),
                correct_ans_pattern.match(stripped),
                ref_ans_pattern.match(stripped),
                keyword_pattern.match(stripped),
            ]):
                question_text_lines.append(stripped)

        flush_question()

    except Exception as e:
        print(f"[pdf_parser] parse_exam_pdf error: {e}")

    return questions