import base64
import os
import logging
import tempfile
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional
from services.pdf_parser import extract_answers_from_sheet
from services.evaluator import evaluate_answer_sheet
from services.omr_grader import evaluate_omr_sheet

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
    options: Optional[list[dict[str, Any]]] = None
    keywords: Optional[list[str]] = None
    rubric: Optional[QuestionRubricPayload] = None


class EvaluateRequest(BaseModel):
    answersheetId: str
    filePath:      Optional[str] = None
    fileBase64:    Optional[str] = None
    examId:        str
    questions:     list[QuestionPayload]
    ocrEngine:     Literal["trocr", "pen_to_print", "omr"] = "trocr"
    omrOutputPath: Optional[str] = None


@router.post("/evaluate")
def evaluate_endpoint(body: EvaluateRequest):
    started_at = time.perf_counter()
    logger.info(
        "Evaluation started: sheet=%s questions=%s ocrEngine=%s",
        body.answersheetId,
        len(body.questions),
        body.ocrEngine,
    )
    temp_path = None
    target_path = body.filePath

    if body.fileBase64:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(base64.b64decode(body.fileBase64))
            temp_path = tmp.name
            target_path = temp_path

    if not target_path or not os.path.exists(target_path):
        logger.error(
            "Evaluation source PDF is missing: sheet=%s path=%s",
            body.answersheetId,
            target_path or body.filePath,
        )
        raise HTTPException(
            status_code=404,
            detail=f"Answer sheet file not found: {target_path or body.filePath}"
        )

    if not body.questions:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        raise HTTPException(
            status_code=400,
            detail="No questions provided for evaluation."
        )

    try:
        if body.ocrEngine == "omr":
            omr_started_at = time.perf_counter()
            if body.omrOutputPath:
                output_img_path = body.omrOutputPath
                os.makedirs(os.path.dirname(os.path.abspath(output_img_path)), exist_ok=True)
            else:
                uploads_dir = os.path.dirname(os.path.abspath(target_path))
                output_dir = os.path.join(uploads_dir, "omr-annotated")
                os.makedirs(output_dir, exist_ok=True)
                output_img_path = os.path.join(output_dir, f"{body.answersheetId}.png")

            questions_list = [q.model_dump() for q in body.questions]
            result = evaluate_omr_sheet(target_path, questions_list, output_img_path)

            omr_annotated_base64 = None
            if os.path.exists(output_img_path):
                try:
                    with open(output_img_path, "rb") as img_f:
                        omr_annotated_base64 = base64.b64encode(img_f.read()).decode("utf-8")
                except Exception as e:
                    logger.warning("Failed to encode omr annotated image: %s", e)

            logger.info(
                "OMR evaluation finished: sheet=%s total=%.2fs",
                body.answersheetId,
                time.perf_counter() - omr_started_at,
            )
            return {
                "answersheetId": body.answersheetId,
                "omrAnnotatedBase64": omr_annotated_base64,
                **result,
            }

        # Step 1: Parse student answers from the PDF
        parsing_started_at = time.perf_counter()
        student_answers = extract_answers_from_sheet(
            target_path,
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
            logger.warning("No discrete answers isolated. Generating baseline answer entries for evaluation.")
            student_answers = [
                {"questionNumber": getattr(q, "orderIndex", None) or i + 1, "answerText": "Handwritten response recorded."}
                for i, q in enumerate(body.questions)
            ]

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
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
