'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Clock3, GraduationCap, ShieldCheck, UserCheck, Users } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { authApi } from '@/lib/api';
import type { StudentApplication, TeacherApplication, User } from '@/types';
import { formatDate } from '@/lib/utils';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [studentApplications, setStudentApplications] = useState<StudentApplication[]>([]);
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [studentRollNumbers, setStudentRollNumbers] = useState<Record<string, string>>({});
  const [studentRejectionReasons, setStudentRejectionReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(raw) as User;
    if (parsed.role !== 'admin') {
      router.push(parsed.role === 'teacher' ? '/dashboard/teacher' : parsed.role === 'student' ? '/dashboard/student' : '/login');
      return;
    }

    setUser(parsed);
    Promise.all([authApi.getTeacherApplications(), authApi.getStudentApplications()])
      .then(([teacherData, studentData]) => {
        setApplications(teacherData);
        setSubjectDrafts(Object.fromEntries(teacherData.map((item) => [item.id, (item.assignedSubjects || []).join(', ')])));
        setStudentApplications(studentData);
        setStudentRollNumbers(Object.fromEntries(studentData.map((item) => [item.id, item.rollNumber || ''])));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load applications.'))
      .finally(() => setLoading(false));
  }, [router]);

  const decideStudentApplication = async (
    application: StudentApplication,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    setProcessingId(application.id);
    setError('');
    setNotice('');
    try {
      const result = await authApi.updateStudentApplication(
        application.id,
        status,
        studentRollNumbers[application.id],
        studentRejectionReasons[application.id],
      );
      setStudentApplications((current) =>
        current.map((item) => item.id === application.id
          ? {
              ...item,
              status,
              rollNumber: result.student.rollNumber,
              rejectionReason: result.student.rejectionReason,
              approvedAt: status === 'APPROVED' ? new Date().toISOString() : null,
            }
          : item),
      );
      setNotice(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update the student application.');
    } finally {
      setProcessingId(null);
    }
  };

  const decideApplication = async (application: TeacherApplication, status: 'APPROVED' | 'REJECTED') => {
    setProcessingId(application.id);
    setError('');
    setNotice('');
    try {
      const result = await authApi.updateTeacherApplication(
        application.id,
        status,
        rejectionReasons[application.id],
      );
      setApplications((current) => current.map((item) => item.id === application.id
        ? { ...item, status, rejectionReason: result.teacher.rejectionReason, approvedAt: status === 'APPROVED' ? new Date().toISOString() : null }
        : item));
      setNotice(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update the application.');
    } finally {
      setProcessingId(null);
    }
  };

  const assignSubjects = async (application: TeacherApplication) => {
    const subjects = (subjectDrafts[application.id] || '').split(',').map((subject) => subject.trim()).filter(Boolean);
    setProcessingId(application.id);
    setError('');
    setNotice('');
    try {
      const updated = await authApi.assignTeacherSubjects(application.id, subjects);
      setApplications((current) => current.map((item) => item.id === application.id
        ? { ...item, assignedSubjects: updated.assignedSubjects }
        : item));
      setSubjectDrafts((current) => ({ ...current, [application.id]: updated.assignedSubjects.join(', ') }));
      setNotice(`Subjects saved for ${updated.fullName}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to assign subjects.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!user) return null;

  const pendingCount = applications.filter((application) => application.status === 'PENDING').length;
  const approvedCount = applications.filter((application) => application.status === 'APPROVED').length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Admin control center</h2>
        <p className="mt-1 text-sm text-[#888888]">
          Review teacher applications and assign subjects. Teachers cannot manage subjects or approve their own applications.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Users size={20} className="text-[#005461]" />
            <div><p className="text-xs uppercase text-[#888888]">Applications</p><p className="text-xl font-bold">{applications.length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Clock3 size={20} className="text-[#FAB963]" />
            <div><p className="text-xs uppercase text-[#888888]">Awaiting review</p><p className="text-xl font-bold">{pendingCount}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <UserCheck size={20} className="text-[#005461]" />
            <div><p className="text-xs uppercase text-[#888888]">Approved teachers</p><p className="text-xl font-bold">{approvedCount}</p></div>
          </div>
        </Card>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <section id="teacher-applications" className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={19} className="text-[#005461]" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">Teacher applications</h3>
        </div>

        {loading ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">Loading applications...</p></Card>
        ) : applications.length === 0 ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">No teacher applications yet.</p></Card>
        ) : (
          <div className="space-y-4">
            {applications.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                  </div>
                  <Badge variant={application.status === 'APPROVED' ? 'success' : application.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {application.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs uppercase text-[#888888]">Phone</p><p>{application.phone || 'Not provided'}</p></div>
                  <div><p className="text-xs uppercase text-[#888888]">Department</p><p>{application.department || 'Not provided'}</p></div>
                  <div><p className="text-xs uppercase text-[#888888]">Qualification</p><p>{application.qualification || 'Not provided'}</p></div>
                  <div><p className="text-xs uppercase text-[#888888]">Submitted</p><p>{application.requestedAt ? formatDate(application.requestedAt) : 'Unknown'}</p></div>
                </div>

                {application.status === 'PENDING' && (
                  <div className="space-y-3 border-t border-[#E8DCC8] pt-4">
                    <Input
                      label="Rejection reason (required to reject)"
                      value={rejectionReasons[application.id] || ''}
                      onChange={(event) => setRejectionReasons((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="Explain why the application is being rejected"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        loading={processingId === application.id}
                        onClick={() => decideApplication(application, 'APPROVED')}
                      >
                        Approve teacher
                      </Button>
                      <Button
                        variant="danger"
                        loading={processingId === application.id}
                        disabled={!(rejectionReasons[application.id] || '').trim()}
                        onClick={() => decideApplication(application, 'REJECTED')}
                      >
                        Reject application
                      </Button>
                    </div>
                  </div>
                )}

                {application.status === 'REJECTED' && application.rejectionReason && (
                  <p className="text-sm text-red-700">Rejection reason: {application.rejectionReason}</p>
                )}

                {application.status === 'APPROVED' && (
                  <div className="space-y-3 border-t border-[#E8DCC8] pt-4">
                    <Input
                      label="Add subjects (comma-separated)"
                      value={subjectDrafts[application.id] || ''}
                      onChange={(event) => setSubjectDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="Enter new subjects; existing assignments will be kept"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-xs text-[#666666]">
                        <BookOpen size={14} className="text-[#005461]" />
                        Current: {(application.assignedSubjects || []).join(', ') || 'No subjects assigned'}
                      </p>
                      <Button
                        loading={processingId === application.id}
                        disabled={!(subjectDrafts[application.id] || '').split(',').some((subject) => subject.trim())}
                        onClick={() => assignSubjects(application)}
                      >
                        Add subjects
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="student-applications" className="space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={19} className="text-[#005461]" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">Student account applications</h3>
        </div>
        <p className="text-sm text-[#666666]">
          Approve new student accounts and assign each student a unique roll number. Subject enrollment is requested separately after approval.
        </p>
        {loading ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">Loading student applications...</p></Card>
        ) : studentApplications.length === 0 ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">No student applications yet.</p></Card>
        ) : (
          <div className="space-y-3">
            {studentApplications.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                    <p className="mt-1 text-xs text-[#888888]">
                      Applied {application.requestedAt ? formatDate(application.requestedAt) : 'date unavailable'}
                    </p>
                  </div>
                  <Badge variant={application.status === 'APPROVED' ? 'success' : application.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {application.status}
                  </Badge>
                </div>
                {application.status === 'PENDING' && (
                  <div className="space-y-3 border-t border-[#E8DCC8] pt-3">
                    <Input
                      label="Assign student roll number"
                      value={studentRollNumbers[application.id] || ''}
                      onChange={(event) => setStudentRollNumbers((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="e.g. SP23-01 or FA23-01"
                    />
                    <Input
                      label="Rejection reason (required to reject)"
                      value={studentRejectionReasons[application.id] || ''}
                      onChange={(event) => setStudentRejectionReasons((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="Explain why the application is being rejected"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        loading={processingId === application.id}
                        disabled={!(studentRollNumbers[application.id] || '').trim()}
                        onClick={() => decideStudentApplication(application, 'APPROVED')}
                      >
                        Approve and assign roll number
                      </Button>
                      <Button
                        variant="danger"
                        loading={processingId === application.id}
                        disabled={!(studentRejectionReasons[application.id] || '').trim()}
                        onClick={() => decideStudentApplication(application, 'REJECTED')}
                      >
                        Reject application
                      </Button>
                    </div>
                  </div>
                )}
                {application.status === 'APPROVED' && (
                  application.rollNumber ? (
                    <p className="text-sm font-medium text-[#005461]">
                      Assigned roll number: {application.rollNumber}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3 border-t border-[#E8DCC8] pt-3">
                      <div className="w-full max-w-sm">
                        <Input
                          label="Assign missing roll number"
                          value={studentRollNumbers[application.id] || ''}
                          onChange={(event) => setStudentRollNumbers((current) => ({ ...current, [application.id]: event.target.value }))}
                          placeholder="e.g. SP23-01 or FA23-01"
                        />
                      </div>
                      <Button
                        loading={processingId === application.id}
                        disabled={!(studentRollNumbers[application.id] || '').trim()}
                        onClick={() => decideStudentApplication(application, 'APPROVED')}
                      >
                        Assign roll number
                      </Button>
                    </div>
                  )
                )}
                {application.status === 'REJECTED' && (
                  <p className="text-sm text-red-700">
                    Rejection reason: {application.rejectionReason || 'Not provided'}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card>
        <div className="flex items-center gap-3">
          <BookOpen size={18} className="text-[#005461]" />
          <div>
            <h3 className="font-semibold text-[#1A1A1A]">Subject assignment rule</h3>
            <p className="mt-1 text-sm text-[#666666]">
              Students register with their name, email, and password. Admin approval assigns a roll number. Approved students then request available subjects, and the selected teacher approves each enrollment request.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
