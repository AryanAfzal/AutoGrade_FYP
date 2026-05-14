from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.similarity import detect_similarity, summarise_flags

router = APIRouter()


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


@router.post("/similarity/{exam_id}")
async def get_similarity(exam_id: str, body: SimilarityRequest):
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