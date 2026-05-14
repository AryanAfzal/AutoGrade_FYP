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
    if not os.path.exists(body.filePath):
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {body.filePath}"
        )

    result = extract_student_info(body.filePath)
    return result