"""
routers/evaluate.py
-------------------
POST /evaluate

The core endpoint. Called by NestJS evaluation.service.ts for each student's
answer sheet that hasn't been scored yet.

Flow:
  1. Receive answersheetId, filePath, examId, and the exam's questions.
  2. Parse the student's answer sheet PDF → list of {questionNumber, answerText}.
  3. Run scoring (MCQ exact match / Descriptive SBERT+keywords) per question.
  4. Return the full result object for NestJS to save as StudentResult + AnswerEntry rows.

NestJS passes the exam questions in the request body to avoid this service
needing DB access. The backend already has them loaded.
"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.pdf_parser import extract_answers_from_sheet
from services.evaluator import evaluate_answer_sheet

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class QuestionPayload(BaseModel):
    id:              str
    type:            str          # 'mcq' | 'descriptive'
    questionText:    str
    maxMarks:        int
    clo:             str
    correctAnswer:   Optional[str] = None
    referenceAnswer: Optional[str] = None
    keywords:        Optional[list[str]] = None


class EvaluateRequest(BaseModel):
    answersheetId: str
    filePath:      str
    examId:        str
    questions:     list[QuestionPayload]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/evaluate")
async def evaluate_endpoint(body: EvaluateRequest):
    """
    Score one student's answer sheet against the exam's answer key.

    Returns:
    {
      answersheetId: str,
      totalMark:     float,
      totalMaxMarks: int,
      entries: [
        {
          questionId:      str,
          questionText:    str,
          studentAnswer:   str,
          referenceAnswer: str,
          type:            'mcq' | 'descriptive',
          aiMark:          float,
          maxMarks:        int,
          semanticScore:   float,   # 0..1 (0 for MCQ)
          keywordScore:    float,   # 0..1 (0 for MCQ)
          confidence:      float,   # 0..1
          isCorrect:       bool | None,
          isFlagged:       bool,
        },
        ...
      ]
    }
    """
    if not os.path.exists(body.filePath):
        raise HTTPException(
            status_code=404,
            detail=f"Answer sheet file not found: {body.filePath}"
        )

    if not body.questions:
        raise HTTPException(
            status_code=400,
            detail="No questions provided for evaluation."
        )

    # Step 1: Parse student answers from the PDF
    student_answers = extract_answers_from_sheet(body.filePath)

    if not student_answers:
        # Return zeroed result rather than crashing — teacher can review manually
        questions_list = [q.model_dump() for q in body.questions]
        total_max = sum(q.maxMarks for q in body.questions)
        entries = [
            {
                "questionId":      q.id,
                "questionText":    q.questionText,
                "studentAnswer":   "",
                "referenceAnswer": q.referenceAnswer or q.correctAnswer or "",
                "type":            q.type,
                "aiMark":          0.0,
                "maxMarks":        q.maxMarks,
                "semanticScore":   0.0,
                "keywordScore":    0.0,
                "confidence":      0.0,
                "isCorrect":       False if q.type == "mcq" else None,
                "isFlagged":       True,
            }
            for q in body.questions
        ]
        return {
            "answersheetId": body.answersheetId,
            "totalMark":     0.0,
            "totalMaxMarks": total_max,
            "entries":       entries,
        }

    # Step 2: Score each answer
    questions_list = [q.model_dump() for q in body.questions]
    result = evaluate_answer_sheet(student_answers, questions_list)

    return {
        "answersheetId": body.answersheetId,
        **result,
    }