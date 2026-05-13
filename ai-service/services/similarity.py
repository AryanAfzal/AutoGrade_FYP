"""
similarity.py
-------------
Cross-student answer similarity detection using SBERT.

How it works:
  For each question in an exam:
    1. Collect all students' answers for that question.
    2. Encode them ALL in one batch (efficient — one SBERT call per question).
    3. Compute full N×N cosine similarity matrix via matrix multiply.
    4. Flag any pair (i, j) where similarity >= threshold.

Why per-question and not per-sheet:
  A student who copied only Q3 won't show up in a full-sheet comparison.
  Per-question gives precise flagging.

Threshold guide:
  >= 0.97  → almost certainly copy-paste
  >= 0.92  → very high similarity, likely copying
  >= 0.85  → suspicious, may be paraphrasing with same ideas
  Default: 0.92 (strict enough to avoid false positives on short answers)
"""

import numpy as np
from models.sbert_loader import encode, pairwise_similarity_matrix

SIMILARITY_THRESHOLD = 0.92


def detect_similarity(
    exam_questions: list[dict],
    all_student_answers: list[dict],
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict]:
    """
    Detect suspiciously similar answers across all students for an exam.

    Args:
        exam_questions:
            List of question dicts (id, questionText, type, maxMarks).
            Only descriptive questions are checked — MCQ similarity is meaningless.

        all_student_answers:
            List of per-student answer sets. Each entry:
            {
              studentName:    str,
              registrationNo: str,
              answersheetId:  str,
              answers:        [ {questionNumber: int, answerText: str} ]
            }

        threshold:
            Cosine similarity above which a pair is flagged.

    Returns:
        List of flagged pairs:
        [
          {
            questionId:      str,
            questionText:    str,
            questionNumber:  int,
            studentA: { name, regNo, answersheetId, answerText },
            studentB: { name, regNo, answersheetId, answerText },
            similarityScore: float   (0..1)
          },
          ...
        ]
    """
    if len(all_student_answers) < 2:
        return []   # can't compare with only 1 student

    flagged = []

    for q_idx, question in enumerate(exam_questions, start=1):
        # Skip MCQ — identical correct answers are expected
        if question.get("type") == "mcq":
            continue

        q_id   = question.get("id", str(q_idx))
        q_text = question.get("questionText", "")

        # Collect this question's answers from each student
        # Preserves student metadata alongside the answer text
        student_records = []
        for student in all_student_answers:
            answer_map = {
                a["questionNumber"]: a["answerText"]
                for a in student.get("answers", [])
            }
            answer_text = answer_map.get(q_idx, "").strip()
            student_records.append({
                "name":          student["studentName"],
                "regNo":         student["registrationNo"],
                "answersheetId": student["answersheetId"],
                "answerText":    answer_text,
            })

        # Filter out students who left this question blank
        # (blank vs blank would give similarity=1.0, which is meaningless)
        valid_records = [r for r in student_records if r["answerText"]]
        if len(valid_records) < 2:
            continue

        # Encode ALL answers for this question in one batch call
        texts = [r["answerText"] for r in valid_records]
        embeddings = encode(texts)   # shape: (N, 384), already normalised

        # N×N similarity matrix — cheap because embeddings are pre-computed
        sim_matrix = pairwise_similarity_matrix(embeddings)  # shape: (N, N)

        N = len(valid_records)
        for i in range(N):
            for j in range(i + 1, N):   # upper triangle only — avoid duplicates
                score = float(sim_matrix[i][j])
                if score >= threshold:
                    flagged.append({
                        "questionId":      q_id,
                        "questionText":    q_text,
                        "questionNumber":  q_idx,
                        "studentA": {
                            "name":          valid_records[i]["name"],
                            "regNo":         valid_records[i]["regNo"],
                            "answersheetId": valid_records[i]["answersheetId"],
                            "answerText":    valid_records[i]["answerText"],
                        },
                        "studentB": {
                            "name":          valid_records[j]["name"],
                            "regNo":         valid_records[j]["regNo"],
                            "answersheetId": valid_records[j]["answersheetId"],
                            "answerText":    valid_records[j]["answerText"],
                        },
                        "similarityScore": round(score, 4),
                    })

    # Sort by similarity descending so the worst offenders appear first
    flagged.sort(key=lambda x: x["similarityScore"], reverse=True)
    return flagged


def summarise_flags(flagged_pairs: list[dict]) -> dict:
    """
    Aggregate similarity flags into a summary for the analytics view.

    Returns:
        {
          totalFlaggedPairs: int,
          studentsInvolved:  list[str]  (unique reg nos),
          byQuestion:        [ {questionId, questionText, flagCount} ]
        }
    """
    students_involved = set()
    by_question: dict[str, dict] = {}

    for pair in flagged_pairs:
        students_involved.add(pair["studentA"]["regNo"])
        students_involved.add(pair["studentB"]["regNo"])

        qid = pair["questionId"]
        if qid not in by_question:
            by_question[qid] = {
                "questionId":   qid,
                "questionText": pair["questionText"],
                "flagCount":    0,
            }
        by_question[qid]["flagCount"] += 1

    return {
        "totalFlaggedPairs": len(flagged_pairs),
        "studentsInvolved":  list(students_involved),
        "byQuestion":        list(by_question.values()),
    }