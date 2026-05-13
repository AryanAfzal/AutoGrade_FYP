"""
routers/parse_pdf.py
--------------------
POST /parse-pdf

Called by NestJS exams.controller.ts when a teacher uploads an exam PDF
instead of manually entering questions. Returns structured question data
that the frontend uses to pre-fill the Create Exam form.

Accepts a multipart file upload (not a file path) because this is a
synchronous teacher action — they upload and immediately see the parsed questions.
"""

import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pdf_parser import parse_exam_pdf

router = APIRouter()


@router.post("/parse-pdf")
async def parse_pdf_endpoint(file: UploadFile = File(...)):
    """
    Parse an exam/answer-key PDF into structured question data.

    The PDF is received as a multipart upload, written to a temp file,
    parsed, then cleaned up. The caller (NestJS exams controller) forwards
    the teacher's upload to this endpoint using form-data.

    Returns list of question objects matching CreateQuestionDto shape:
    [
      {
        type: 'mcq' | 'descriptive',
        questionText: str,
        maxMarks: int,
        clo: str,
        correctAnswer?: str,
        referenceAnswer?: str,
        keywords?: list[str],
        options?: [{label, text}]
      }
    ]
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted."
        )

    # Write upload to a temp file so pdfplumber can open it by path
    suffix = f"_{file.filename}"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        questions = parse_exam_pdf(tmp_path)
    finally:
        os.unlink(tmp_path)   # always clean up

    if not questions:
        raise HTTPException(
            status_code=422,
            detail=(
                "No questions could be parsed from this PDF. "
                "Ensure the file follows the expected format: "
                "'Q1. [MCQ] (2 marks) [CLO1]' header lines."
            )
        )

    return {"questions": questions, "count": len(questions)}