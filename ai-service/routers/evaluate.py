import os
import logging
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional
from services.pdf_parser import extract_answers_from_sheet
from services.evaluator import evaluate_answer_sheet

router = APIRouter()
logger = logging.getLogger(__name__)

class RubricConceptPayload(BaseModel):
    name: str
    description: str
    keywords: list[str] = Field(default_factory=list)
    maxMarks: float
    strictness: Literal["lenient", "balanced", "strict"] = "balanced"


class RubricScoringWeightsPayload(BaseModel):
    semantic: float
    keywords: float
    concepts: float


class QuestionRubricPayload(BaseModel):
    concepts: list[RubricConceptPayload]
    scoringWeights: RubricScoringWeightsPayload


class QuestionPayload(BaseModel):
    id: str
    type: str
    questionText: str
    maxMarks: float
    clo: str
    correctAnswer: Optional[str] = None
    referenceAnswer: Optional[str] = None
    keywords: Optional[list[str]] = None
    rubric: Optional[QuestionRubricPayload] = None


class EvaluateRequest(BaseModel):
    answersheetId: str
    filePath:      str
    examId:        str
    questions:     list[QuestionPayload]
    ocrEngine:     Literal["trocr", "pen_to_print"] = "trocr"



@router.post("/evaluate")
def evaluate_endpoint(body: EvaluateRequest):
    started_at = time.perf_counter()
    logger.info(
        "Evaluation started: sheet=%s questions=%s ocrEngine=%s",
        body.answersheetId,
        len(body.questions),
        body.ocrEngine,
    )
    if not os.path.exists(body.filePath):
        logger.error(
            "Evaluation source PDF is missing: sheet=%s path=%s",
            body.answersheetId,
            body.filePath,
        )
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
    parsing_started_at = time.perf_counter()
    student_answers = extract_answers_from_sheet(
        body.filePath,
        expected_question_count=len(body.questions),
        expected_question_texts=[question.questionText for question in body.questions],
        ocr_engine=body.ocrEngine,
    )
    logger.info(
        "Answer extraction finished: sheet=%s answers=%s elapsed=%.1fs",
        body.answersheetId,
        len(student_answers),
        time.perf_counter() - parsing_started_at,
    )

    if not student_answers:
        raise HTTPException(
            status_code=422,
            detail=(
                "No answers could be extracted from this PDF. "
                "Check scan quality and question numbering before retrying."
            ),
        )

    # Step 2: Score each answer
    scoring_started_at = time.perf_counter()
    questions_list = [q.model_dump() for q in body.questions]
    result = evaluate_answer_sheet(student_answers, questions_list)

    logger.info(
        "Evaluation finished: sheet=%s total=%.1fs scoring=%.1fs",
        body.answersheetId,
        time.perf_counter() - started_at,
        time.perf_counter() - scoring_started_at,
    )
    return {
        "answersheetId": body.answersheetId,
        **result,
    }