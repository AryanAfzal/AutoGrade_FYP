from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.similarity import detect_similarity, summarise_flags, group_flagged_into_pairs

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
    threshold:      Optional[float] = 0.72


@router.post("/similarity/{exam_id}")
async def get_similarity(exam_id: str, body: SimilarityRequest):
    if len(body.studentAnswers) < 2:
        return {
            "examId":       exam_id,
            "summary":      {"totalFlaggedPairs": 0, "studentsInvolved": [], "byQuestion": []},
            "flaggedPairs": [],
            "groupedPairs": [],
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
        threshold=body.threshold if body.threshold is not None else 0.72,
    )
    summary = summarise_flags(flagged)
    grouped = group_flagged_into_pairs(flagged)

    return {
        "examId":       exam_id,
        "summary":      summary,
        "flaggedPairs": flagged,
        "groupedPairs": grouped,
    }
