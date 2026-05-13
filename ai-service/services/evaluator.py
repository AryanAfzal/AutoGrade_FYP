"""
evaluator.py
------------
Core scoring logic. Called by the /evaluate router.

For each question in an exam:
  - MCQ:         exact match → full marks or 0. No SBERT needed.
  - Descriptive: SBERT semantic score + keyword overlap → weighted final mark.

Scoring formula (weights are configurable per exam in future; defaults here):
    semantic_weight  = 0.70
    keyword_weight   = 0.30

    combined_score   = (semantic × 0.70) + (keyword × 0.30)   ← 0..1
    ai_mark          = combined_score × max_marks
    confidence       = semantic_score   ← direct cosine similarity 0..1

The confidence column in AnswerEntry is the raw cosine similarity.
It tells the teacher "how sure is the AI about this score".
Low confidence (<0.4) answers should be flagged for manual review.
"""

import re
from models.sbert_loader import encode, cosine_similarity

# ── Tunable thresholds ────────────────────────────────────────────────────────
SEMANTIC_WEIGHT    = 0.70
KEYWORD_WEIGHT     = 0.30
LOW_CONFIDENCE_THR = 0.40   # answers below this get isFlagged=True
# ─────────────────────────────────────────────────────────────────────────────


def evaluate_mcq(student_answer: str, correct_answer: str, max_marks: int) -> dict:
    """
    MCQ evaluation: normalised exact match.
    Strips whitespace, lowercases, compares.

    Returns AnswerEntry-shaped dict.
    """
    sa = student_answer.strip().lower()
    ca = correct_answer.strip().lower()

    # Accept either the letter alone ("b") or the full text of the option
    is_correct = sa == ca or sa.startswith(ca) or ca.startswith(sa)
    mark = max_marks if is_correct else 0

    return {
        "aiMark":        float(mark),
        "maxMarks":      max_marks,
        "confidence":    1.0 if is_correct else 0.0,
        "semanticScore": 1.0 if is_correct else 0.0,
        "keywordScore":  1.0 if is_correct else 0.0,
        "isCorrect":     is_correct,
        "isFlagged":     False,
        "type":          "mcq",
    }


def evaluate_descriptive(
    student_answer: str,
    reference_answer: str,
    keywords: list[str],
    max_marks: int,
) -> dict:
    """
    Descriptive evaluation using SBERT + keyword overlap.

    Steps:
      1. Encode student answer and reference answer with SBERT.
      2. Cosine similarity → semantic_score (0..1).
      3. Keyword overlap ratio → keyword_score (0..1).
      4. Weighted combination → combined_score → ai_mark.
      5. Flag if confidence below threshold.

    Returns AnswerEntry-shaped dict.
    """
    # Edge case: blank answer
    if not student_answer or not student_answer.strip():
        return {
            "aiMark":        0.0,
            "maxMarks":      max_marks,
            "confidence":    0.0,
            "semanticScore": 0.0,
            "keywordScore":  0.0,
            "isCorrect":     False,
            "isFlagged":     True,
            "type":          "descriptive",
        }

    # ── Step 1 & 2: SBERT semantic similarity ─────────────────────────────
    embeddings = encode([student_answer, reference_answer])
    semantic_score = cosine_similarity(embeddings[0], embeddings[1])
    # Clamp to [0, 1] — cosine can be very slightly negative for unrelated text
    semantic_score = max(0.0, min(1.0, semantic_score))

    # ── Step 3: Keyword overlap ────────────────────────────────────────────
    keyword_score = _keyword_overlap(student_answer, keywords)

    # ── Step 4: Weighted combination ──────────────────────────────────────
    combined = (semantic_score * SEMANTIC_WEIGHT) + (keyword_score * KEYWORD_WEIGHT)
    ai_mark = round(combined * max_marks, 2)

    # ── Step 5: Confidence & flagging ─────────────────────────────────────
    confidence = semantic_score   # raw cosine is the confidence signal
    is_flagged = confidence < LOW_CONFIDENCE_THR

    return {
        "aiMark":        ai_mark,
        "maxMarks":      max_marks,
        "confidence":    round(confidence, 4),
        "semanticScore": round(semantic_score, 4),
        "keywordScore":  round(keyword_score, 4),
        "isCorrect":     None,      # not applicable for descriptive
        "isFlagged":     is_flagged,
        "type":          "descriptive",
    }


def evaluate_answer_sheet(
    student_answers: list[dict],   # [{questionNumber, answerText}]
    exam_questions: list[dict],    # question entities from NestJS / DB
) -> dict:
    """
    Run evaluation for one student's full answer sheet.

    Matches student answers to exam questions by index order (Q1→Q1, Q2→Q2).
    Returns the full result object that NestJS saves as StudentResult.

    Args:
        student_answers:  output of pdf_parser.extract_answers_from_sheet()
        exam_questions:   list of question dicts with fields:
                            id, type, questionText, maxMarks, clo,
                            correctAnswer, referenceAnswer, keywords

    Returns:
        {
          totalMark: float,
          totalMaxMarks: int,
          entries: [ AnswerEntry-shaped dicts ... ]
        }
    """
    # Build a lookup: questionNumber → answerText
    answer_map: dict[int, str] = {
        a["questionNumber"]: a["answerText"]
        for a in student_answers
    }

    entries = []
    total_mark = 0.0
    total_max = 0

    for idx, question in enumerate(exam_questions, start=1):
        student_ans = answer_map.get(idx, "")   # blank if student skipped
        q_type = question.get("type", "descriptive")
        max_marks = int(question.get("maxMarks", 0))
        total_max += max_marks

        if q_type == "mcq":
            result = evaluate_mcq(
                student_answer=student_ans,
                correct_answer=question.get("correctAnswer", ""),
                max_marks=max_marks,
            )
        else:
            result = evaluate_descriptive(
                student_answer=student_ans,
                reference_answer=question.get("referenceAnswer", ""),
                keywords=question.get("keywords") or [],
                max_marks=max_marks,
            )

        total_mark += result["aiMark"]

        entries.append({
            **result,
            "questionId":      question.get("id", str(idx)),
            "questionText":    question.get("questionText", ""),
            "studentAnswer":   student_ans,
            "referenceAnswer": question.get("referenceAnswer", "")
                               or question.get("correctAnswer", ""),
        })

    return {
        "totalMark":    round(total_mark, 2),
        "totalMaxMarks": total_max,
        "entries":      entries,
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _keyword_overlap(student_answer: str, keywords: list[str]) -> float:
    """
    Fraction of expected keywords found in the student's answer.
    Case-insensitive, whole-word match.

    Returns 0.0 if no keywords defined (avoids penalising when teacher
    didn't enter keywords — falls back to pure semantic scoring).
    """
    if not keywords:
        return 1.0   # no keywords → don't penalise; let semantic carry it

    answer_lower = student_answer.lower()
    found = 0
    for kw in keywords:
        # Whole-word boundary match so "stack" doesn't match "stackoverflow"
        pattern = r"\b" + re.escape(kw.lower()) + r"\b"
        if re.search(pattern, answer_lower):
            found += 1

    return found / len(keywords)