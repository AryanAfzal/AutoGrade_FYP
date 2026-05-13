"""
routers/extract.py
------------------
POST /extract-student-info

Called by NestJS uploads.service.ts immediately after a PDF is saved to disk.
Reads the file path, extracts student metadata, returns it so the AnswerSheet
entity can be populated with a real name + reg no instead of "Unknown".
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.pdf_parser import extract_student_info
import os

router = APIRouter()


class ExtractRequest(BaseModel):
    filePath: str   # absolute or relative path on shared filesystem


class ExtractResponse(BaseModel):
    studentName:    str
    registrationNo: str


@router.post("/extract-student-info", response_model=ExtractResponse)
async def extract_student_info_endpoint(body: ExtractRequest):
    """
    Extract student name and registration number from the header of an
    uploaded answer-sheet PDF.

    The file must already exist on disk at the given path.
    NestJS uploads it via multer first, then calls this endpoint.
    """
    if not os.path.exists(body.filePath):
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {body.filePath}"
        )

    result = extract_student_info(body.filePath)
    return result