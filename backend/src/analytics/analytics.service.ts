import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentResult } from '../evaluation/entities/student-result.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(StudentResult)
    private resultRepo: Repository<StudentResult>,
    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,
    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
  ) {}

  async getReport(examId: string) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    const sheets = await this.sheetRepo.find({ where: { exam: { id: examId } } });

    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['entries', 'answerSheet'],
    });

    if (!results.length) {
      return {
        examId,
        examTitle: exam?.title || '',
        totalStudents: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        cloAttainment: [],
        questionDifficulty: [],
        scoreDistribution: [],
      };
    }

    const scores = results.map((r) => r.totalApprovedMark ?? r.totalAiMark);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    // CLO Attainment
    const cloMap: Record<string, { total: number; met: number }> = {};
    results.forEach((r) => {
      r.entries.forEach((e) => {
        const question = exam.questions?.find((q) => q.id === e.questionId);
        if (!question) return;
        const clo = question.clo;
        if (!cloMap[clo]) cloMap[clo] = { total: 0, met: 0 };
        cloMap[clo].total++;
        if (e.aiMark / e.maxMarks >= 0.5) cloMap[clo].met++;
      });
    });

    const cloAttainment = Object.entries(cloMap).map(([clo, data]) => ({
      clo,
      attainmentPercent: Math.round((data.met / data.total) * 100),
      studentsMet: data.met,
      totalStudents: data.total,
    }));

    const questionMap: Record<string, {
      questionId: string;
      questionText: string;
      totalAverage: number;
      maxMarks: number;
      count: number;
    }> = {};
    results.forEach((result) => {
      result.entries.forEach((entry) => {
        if (!questionMap[entry.questionId]) {
          questionMap[entry.questionId] = {
            questionId: entry.questionId,
            questionText: entry.questionText,
            totalAverage: 0,
            maxMarks: entry.maxMarks,
            count: 0,
          };
        }
        const marks = entry.approvedMark ?? entry.aiMark;
        questionMap[entry.questionId].totalAverage += marks;
        questionMap[entry.questionId].maxMarks = entry.maxMarks;
        questionMap[entry.questionId].count++;
      });
    });
    const questionDifficulty = Object.values(questionMap).map((question) => {
      const averageMark = question.totalAverage / question.count;
      return {
        questionId: question.questionId,
        questionText: question.questionText,
        averageMark: Math.round(averageMark * 10) / 10,
        maxMarks: question.maxMarks,
        difficultyIndex: question.maxMarks > 0
          ? Math.round((averageMark / question.maxMarks) * 100) / 100
          : 0,
      };
    });

    // Score distribution
    const ranges = ['0-20', '21-40', '41-60', '61-80', '81-100'];
    const scoreDistribution = ranges.map((range) => {
      const [min, max] = range.split('-').map(Number);
      return {
        range,
        count: scores.filter((s) => {
          const pct = (s / results[0].totalMaxMarks) * 100;
          return pct >= min && pct <= max;
        }).length,
      };
    });

    return {
      examId,
      examTitle: exam?.title || '',
      totalStudents: results.length,
      averageScore: Math.round(averageScore * 10) / 10,
      highestScore,
      lowestScore,
      cloAttainment,
      questionDifficulty,
      scoreDistribution,
    };
  }

  async exportCSV(examId: string) {
    const report = await this.getReport(examId);
    const sheets = await this.sheetRepo.find({
      where: { exam: { id: examId } },
    });
    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['answerSheet'],
    });

    let csv = 'Student Name,Registration No,Total Marks,Max Marks,Percentage\n';
    results.forEach((r) => {
      const pct = Math.round((r.totalAiMark / r.totalMaxMarks) * 100);
      csv += `${r.answerSheet.studentName},${r.answerSheet.registrationNo},${r.totalAiMark},${r.totalMaxMarks},${pct}%\n`;
    });

    return csv;
  }
}