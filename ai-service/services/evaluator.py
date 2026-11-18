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
    max_marks: float,
    rubric: dict | None = None,
) -> dict:
    # Edge case: blank student answer
    if not student_answer or not student_answer.strip():
        result = {
            "aiMark":        0.0,
            "maxMarks":      max_marks,
            "confidence":    0.0,
            "semanticScore": 0.0,
            "keywordScore":  0.0,
            "isCorrect":     False,
            "isFlagged":     True,
            "type":          "descriptive",
        }
        if rubric:
            rubric_result = _score_rubric(
                student_answer, rubric, max_marks, 0.0, 0.0, has_reference=False
            )
            rubric_result.pop("aiMark")
            result.update(rubric_result)
        return result

    has_reference = bool(reference_answer and reference_answer.strip())
    if not has_reference and not rubric:
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

    # Encode the reference and rubric criteria together to reuse one model call.
    concepts = rubric.get("concepts", []) if rubric else []
    descriptions = [concept.get("description", "").strip() for concept in concepts]
    description_indexes = [i for i, description in enumerate(descriptions) if description]
    texts = [str(student_answer)]
    reference_index = None
    if has_reference:
        reference_index = len(texts)
        texts.append(str(reference_answer))
    concept_indexes = {}
    for index in description_indexes:
        concept_indexes[index] = len(texts)
        texts.append(descriptions[index])

    embeddings = encode(texts) if len(texts) > 1 else None
    semantic_score = (
        cosine_similarity(embeddings[0], embeddings[reference_index])
        if embeddings is not None and reference_index is not None
        else 0.0
    )
    semantic_score = max(0.0, min(1.0, semantic_score))

    keyword_score = _keyword_overlap(student_answer, keywords)

    if rubric:
        rubric_result = _score_rubric(
            student_answer,
            rubric,
            max_marks,
            semantic_score,
            keyword_score,
            has_reference=has_reference,
            embeddings=embeddings,
            concept_indexes=concept_indexes,
        )
        ai_mark = rubric_result.pop("aiMark")
        combined = ai_mark / max_marks if max_marks else 0.0
    elif not has_reference:
        combined = keyword_score
    else:
        combined = (semantic_score * SEMANTIC_WEIGHT) + (keyword_score * KEYWORD_WEIGHT)

    if not rubric:
        base_mark = round(combined * max_marks, 2)
        if student_answer and student_answer.strip() and max_marks > 0:
            ai_mark = min(max_marks, round(base_mark + 0.5, 2))
        else:
            ai_mark = base_mark

    confidence = semantic_score if has_reference else keyword_score
    is_flagged = confidence < LOW_CONFIDENCE_THR

    result = {
        "aiMark":        ai_mark,
        "maxMarks":      max_marks,
        "confidence":    round(confidence, 4),
        "semanticScore": round(semantic_score, 4),
        "keywordScore":  round(keyword_score, 4),
        "isCorrect":     None,      # not applicable for descriptive
        "isFlagged":     is_flagged,
        "type":          "descriptive",
    }
    if rubric:
        result.update(rubric_result)
    return result


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
                rubric=question.get("rubric"),
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


def _score_rubric(
    student_answer: str,
    rubric: dict,
    max_marks: float,
    semantic_score: float,
    keyword_score: float,
    has_reference: bool,
    embeddings=None,
    concept_indexes: dict[int, int] | None = None,
) -> dict:
    concept_indexes = concept_indexes or {}
    breakdown = []
    weighted_marks = 0.0
    total_concept_marks = 0.0

    strictness_threshold = {"lenient": 0.2, "balanced": 0.35, "strict": 0.5}
    for index, concept in enumerate(rubric.get("concepts", [])):
        concept_marks = float(concept.get("maxMarks", 0))
        concept_description = concept.get("description", "").strip()
        concept_keywords = concept.get("keywords") or []
        concept_semantic = 0.0
        if index in concept_indexes and embeddings is not None:
            concept_semantic = max(
                0.0,
                min(1.0, cosine_similarity(embeddings[0], embeddings[concept_indexes[index]])),
            )
        concept_keyword = _keyword_overlap(student_answer, concept_keywords) if concept_keywords else None
        keyword_evidence = (
            concept_keyword
            if concept_keyword is not None
            else keyword_score
        )

        strictness = concept.get("strictness", "balanced")
        threshold = strictness_threshold.get(strictness, strictness_threshold["balanced"])
        weights = rubric.get("scoringWeights") or {}
        signals = [
            (
                float(weights.get("semantic", 0.4)),
                semantic_score if has_reference else None,
            ),
            (float(weights.get("keywords", 0.2)), keyword_evidence),
            (
                float(weights.get("concepts", 0.4)),
                concept_semantic if concept_description else keyword_evidence or semantic_score,
            ),
        ]
        available_weight = sum(weight for weight, score in signals if score is not None and weight > 0)
        if available_weight:
            raw_coverage = sum(
                weight * score
                for weight, score in signals
                if score is not None and weight > 0
            ) / available_weight
        else:
            available_signals = [score for _, score in signals if score is not None]
            raw_coverage = sum(available_signals) / len(available_signals) if available_signals else 0.0
        coverage = max(0.0, min(1.0, (raw_coverage - threshold) / (1.0 - threshold)))
        base_marks = round(concept_marks * coverage, 2)
        # Give 0.5 bonus marks per rubric concept when student provided an answer, capped at concept_marks
        if student_answer and student_answer.strip() and concept_marks > 0:
            awarded_marks = min(concept_marks, round(base_marks + 0.5, 2))
        else:
            awarded_marks = base_marks

        effective_coverage = min(1.0, round(awarded_marks / concept_marks, 4)) if concept_marks > 0 else coverage
        if effective_coverage >= 0.75:
            status = "addressed"
        elif effective_coverage > 0:
            status = "partially addressed"
        else:
            status = "not addressed"

        breakdown.append(
            {
                "conceptName": concept.get("name", ""),
                "maxMarks": concept_marks,
                "coverage": effective_coverage,
                "awardedMarks": awarded_marks,
                "status": status,
                "strictness": strictness,
            }
        )
        weighted_marks += awarded_marks
        total_concept_marks += concept_marks

    maximum_award = min(max_marks, total_concept_marks)
    if weighted_marks > maximum_award and breakdown:
        excess = round(weighted_marks - maximum_award, 2)
        breakdown[-1]["awardedMarks"] = max(
            0.0,
            round(breakdown[-1]["awardedMarks"] - excess, 2),
        )
        weighted_marks = sum(item["awardedMarks"] for item in breakdown)

    concept_score = weighted_marks / total_concept_marks if total_concept_marks else 0.0
    addressed = [item["conceptName"] for item in breakdown if item["status"] == "addressed"]
    partial = [item["conceptName"] for item in breakdown if item["status"] == "partially addressed"]
    missing = [item["conceptName"] for item in breakdown if item["status"] == "not addressed"]
    feedback_parts = []
    if addressed:
        feedback_parts.append("Addressed: " + ", ".join(addressed) + ".")
    if partial:
        feedback_parts.append("Partially addressed: " + ", ".join(partial) + ".")
    if missing:
        feedback_parts.append("Not addressed: " + ", ".join(missing) + ".")
    feedback = " ".join(feedback_parts) or "No rubric concepts were configured for this answer."

    return {
        "rubricBreakdown": breakdown,
        "conceptScore": round(concept_score, 4),
        "feedback": feedback,
        "aiMark": round(weighted_marks, 2),
    }