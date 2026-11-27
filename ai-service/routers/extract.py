import base64
import os
import tempfile
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.pdf_parser import extract_student_info

router = APIRouter()


class ExtractRequest(BaseModel):
    filePath: Optional[str] = None
    fileBase64: Optional[str] = None


class ExtractResponse(BaseModel):
    studentName: str
    registrationNo: str


@router.post("/extract-student-info", response_model=ExtractResponse)
async def extract_student_info_endpoint(body: ExtractRequest):
    temp_path = None
    target_path = body.filePath

    if body.fileBase64:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(base64.b64decode(body.fileBase64))
            temp_path = tmp.name
            target_path = temp_path

    if not target_path or not os.path.exists(target_path):
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {target_path or body.filePath}"
        )

    try:
        result = extract_student_info(target_path)
        return result
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
