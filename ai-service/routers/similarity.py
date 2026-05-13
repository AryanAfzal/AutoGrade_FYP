"""
routers/similarity.py
---------------------
GET /similarity/{examId}

Called by NestJS evaluation.service.ts when the teacher opens the AI Review page.
Fetches all evaluated answer sheets for the exam, runs pairwise SBERT similarity
per question, and returns flagged student pairs.

Because this needs the evaluated answers (which live in the NestJS DB), the
caller must POST them in the request body rather than us querying the DB.
We expose it as a POST with examId in the path to match NestJS's call pattern.
NestJS evaluation.service calls: GET /similarity/{examId}
— so the NestJS side must enrich that call with a body, OR
  we use a query param fallback. Both patterns shown below.

Design decision: keep this service stateless — no DB.
NestJS passes all data needed in the request body.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.similarity import detect_similarity, summarise_flags

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class QuestionInfo(BaseModel):
    id:           str
    type:         str   # 'mcq' | 'descriptive'
    questionText: str
    maxMarks:     int


class StudentAnswerEntry(BaseModel):
    questionNumber: int
    answerText:     str


class StudentAnswerSet(BaseModel):
    studentName:    str
    registrationNo: str
    answersheetId:  str
    answers:        list[StudentAnswerEntry]


class SimilarityRequest(BaseModel):
    questions:      list[QuestionInfo]
    studentAnswers: list[StudentAnswerSet]
    threshold:      Optional[float] = 0.92


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/similarity/{exam_id}")
async def get_similarity(exam_id: str, body: SimilarityRequest):
    """
    Detect suspiciously similar answers across all students for an exam.

    NestJS should:
      1. Fetch all AnswerSheets for the exam (from its own DB).
      2. Fetch all StudentResults + AnswerEntries (the studentAnswer field).
      3. POST to this endpoint with that data.

    Returns:
    {
      examId: str,
      summary: {
        totalFlaggedPairs: int,
        studentsInvolved:  list[str],
        byQuestion:        [{questionId, questionText, flagCount}]
      },
      flaggedPairs: [
        {
          questionId:      str,
          questionText:    str,
          questionNumber:  int,
          studentA: { name, regNo, answersheetId, answerText },
          studentB: { name, regNo, answersheetId, answerText },
          similarityScore: float
        }
      ]
    }
    """
    if len(body.studentAnswers) < 2:
        return {
            "examId":       exam_id,
            "summary":      {"totalFlaggedPairs": 0, "studentsInvolved": [], "byQuestion": []},
            "flaggedPairs": [],
        }

    questions_list = [q.model_dump() for q in body.questions]
    students_list  = [
        {
            "studentName":    s.studentName,
            "registrationNo": s.registrationNo,
            "answersheetId":  s.answersheetId,
            "answers":        [a.model_dump() for a in s.answers],
        }
        for s in body.studentAnswers
    ]

    flagged = detect_similarity(
        exam_questions=questions_list,
        all_student_answers=students_list,
        threshold=body.threshold,
    )
    summary = summarise_flags(flagged)

    return {
        "examId":       exam_id,
        "summary":      summary,
        "flaggedPairs": flagged,
    }