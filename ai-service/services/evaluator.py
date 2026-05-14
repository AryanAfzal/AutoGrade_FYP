import re
from models.sbert_loader import encode, cosine_similarity

# ── Tunable thresholds ────────────────────────────────────────────────────────
SEMANTIC_WEIGHT    = 0.70
KEYWORD_WEIGHT     = 0.30
LOW_CONFIDENCE_THR = 0.40
# ─────────────────────────────────────────────────────────────────────────────


def evaluate_mcq(student_answer: str, correct_answer: str, max_marks: int) -> dict:
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
    # Edge case: blank student answer
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

    # Edge case: no reference answer — score by keywords only
    if not reference_answer or not reference_answer.strip():
        keyword_score = _keyword_overlap(student_answer, keywords)
        ai_mark = round(keyword_score * max_marks, 2)
        return {
            "aiMark":        ai_mark,
            "maxMarks":      max_marks,
            "confidence":    keyword_score,
            "semanticScore": 0.0,
            "keywordScore":  round(keyword_score, 4),
            "isCorrect":     None,
            "isFlagged":     keyword_score < LOW_CONFIDENCE_THR,
            "type":          "descriptive",
        }

    # ── Step 1 & 2: SBERT semantic similarity ─────────────────────────────
    embeddings = encode([str(student_answer), str(reference_answer)])
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