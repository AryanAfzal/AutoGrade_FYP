import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { StudentResult } from '../evaluation/entities/student-result.entity';
import { Exam } from '../exams/entities/exam.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(StudentResult)
    private resultRepo: Repository<StudentResult>,
    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
  ) {}

  async getReport(examId: string, user: User) {
    const exam = await this.examRepo.findOne({
      where: { id: examId, createdBy: { id: user.id } },
      relations: ['questions'],
    });
    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }

    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['entries', 'answerSheet'],
      order: { answerSheet: { registrationNo: 'ASC' } },
    });
    const questionOrder = new Map(
      exam.questions.map((question, index) => [question.id, index + 1]),
    );
    const cloTotals = new Map<string, {
      earnedMarks: number;
      possibleMarks: number;
      studentsMet: number;
      totalStudents: number;
    }>();

    const students = results
      .filter((result) => result.entries.length > 0)
      .map((result) => {
        const cloTotalsForStudent = new Map<string, { earnedMarks: number; possibleMarks: number }>();
        const questions = result.entries
          .map((entry) => {
            const question = exam.questions.find((item) => item.id === entry.questionId);
            if (!question) return null;
            const mark = entry.approvedMark ?? entry.aiMark;
            const clo = question.clo || 'Unassigned CLO';
            const studentClo = cloTotalsForStudent.get(clo) || {
              earnedMarks: 0,
              possibleMarks: 0,
            };
            studentClo.earnedMarks += mark;
            studentClo.possibleMarks += entry.maxMarks;
            cloTotalsForStudent.set(clo, studentClo);

            const classClo = cloTotals.get(clo) || {
              earnedMarks: 0,
              possibleMarks: 0,
              studentsMet: 0,
              totalStudents: 0,
            };
            classClo.earnedMarks += mark;
            classClo.possibleMarks += entry.maxMarks;
            cloTotals.set(clo, classClo);

            return {
              questionId: entry.questionId,
              questionNumber: questionOrder.get(entry.questionId) || 0,
              questionText: entry.questionText,
              clo,
              mark,
              maxMarks: entry.maxMarks,
            };
          })
          .filter((question): question is NonNullable<typeof question> => question !== null)
          .sort((first, second) => first.questionNumber - second.questionNumber);

        for (const [clo, data] of cloTotalsForStudent) {
          const classClo = cloTotals.get(clo)!;
          classClo.totalStudents += 1;
          if (data.earnedMarks / data.possibleMarks >= 0.5) {
            classClo.studentsMet += 1;
          }
        }

        const maxMarks = questions.reduce((sum, question) => sum + question.maxMarks, 0);
        const totalMarks = questions.reduce((sum, question) => sum + question.mark, 0);
        return {
          resultId: result.id,
          studentName: result.answerSheet.studentName,
          rollNumber: result.answerSheet.registrationNo,
          totalMarks: Math.round(totalMarks * 100) / 100,
          maxMarks,
          questions,
          cloScores: Array.from(cloTotalsForStudent.entries())
            .map(([clo, data]) => ({
              clo,
              earnedMarks: Math.round(data.earnedMarks * 100) / 100,
              possibleMarks: data.possibleMarks,
              attainmentPercent: data.possibleMarks
                ? Math.round((data.earnedMarks / data.possibleMarks) * 1000) / 10
                : 0,
            }))
            .sort((first, second) => first.clo.localeCompare(second.clo)),
        };
      });

    const scores = students.map((student) => student.totalMarks);
    const totalStudents = students.length;
    const averageScore = totalStudents
      ? scores.reduce((sum, score) => sum + score, 0) / totalStudents
      : 0;
    const highestScore = totalStudents ? Math.max(...scores) : 0;
    const lowestScore = totalStudents ? Math.min(...scores) : 0;
    const cloAttainment = Array.from(cloTotals.entries())
      .map(([clo, data]) => ({
        clo,
        attainmentPercent: data.possibleMarks
          ? Math.round((data.earnedMarks / data.possibleMarks) * 100)
          : 0,
        earnedMarks: Math.round(data.earnedMarks * 100) / 100,
        possibleMarks: data.possibleMarks,
        studentsMet: data.studentsMet,
        totalStudents: data.totalStudents,
      }))
      .sort((first, second) => first.clo.localeCompare(second.clo));

    const scoreDistribution = [
      { range: '0-20', min: 0, max: 20 },
      { range: '21-40', min: 20, max: 40 },
      { range: '41-60', min: 40, max: 60 },
      { range: '61-80', min: 60, max: 80 },
      { range: '81-100', min: 80, max: 100 },
    ].map(({ range, min, max }, index) => ({
      range,
      count: students.filter((student) => {
        if (!student.maxMarks) return false;
        const percentage = (student.totalMarks / student.maxMarks) * 100;
        return (index === 0 ? percentage >= min : percentage > min) && percentage <= max;
      }).length,
    }));

    return {
      examId,
      examTitle: exam.title,
      examTotalMarks: exam.totalMarks,
      totalStudents,
      averageScore: Math.round(averageScore * 10) / 10,
      highestScore: Math.round(highestScore * 100) / 100,
      lowestScore: Math.round(lowestScore * 100) / 100,
      passRate: totalStudents
        ? Math.round((students.filter((student) => student.totalMarks / student.maxMarks >= 0.5).length / totalStudents) * 100)
        : 0,
      cloAttainment,
      scoreDistribution,
      students: students.sort((first, second) =>
        first.rollNumber.localeCompare(second.rollNumber, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    };
  }

  async exportCSV(examId: string, user: User) {
    const report = await this.getReport(examId, user);
    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const rows = [
      ['Student Name', 'Roll Number', 'Total Marks', 'Max Marks', 'Percentage'],
      ...report.students.map((student) => [
        student.studentName,
        student.rollNumber,
        student.totalMarks,
        student.maxMarks,
        student.maxMarks
          ? `${Math.round((student.totalMarks / student.maxMarks) * 100)}%`
          : '0%',
      ]),
    ];
    return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  }
}
