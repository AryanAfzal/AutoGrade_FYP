'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Clock3,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { authApi, getStoredUser } from '@/lib/api';
import { institutionApi } from '@/lib/api';
import type { Course, StudentApplication, TeacherApplication, User } from '@/types';
import { formatDate } from '@/lib/utils';

export default function AdminReviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [studentApplications, setStudentApplications] = useState<StudentApplication[]>([]);
  const [departmentCourses, setDepartmentCourses] = useState<Course[]>([]);
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [studentRollNumbers, setStudentRollNumbers] = useState<Record<string, string>>({});
  const [studentRejectionReasons, setStudentRejectionReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const channelRef = useRef<BroadcastChannel | null>(null);

  const fetchAdminData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setSyncing(true);
    }
    try {
      const [teacherData, studentData, courseData] = await Promise.all([
        authApi.getTeacherApplications(),
        authApi.getStudentApplications(),
        institutionApi.getCourses(),
      ]);
      setApplications(teacherData);
      setDepartmentCourses(courseData.filter((course) => course.active));
      setSubjectDrafts((prev) => {
        const next = { ...prev };
        for (const item of teacherData) {
          if (next[item.id] === undefined) {
            const assignedIds = item.assignedCourseIds?.length
              ? item.assignedCourseIds
              : courseData
                  .filter((course) =>
                    ((item.departmentId && course.departmentId === item.departmentId)
                      || (!item.departmentId && item.department && course.departmentName?.toLowerCase() === item.department.toLowerCase()))
                    && (item.assignedSubjects || []).some((subject) =>
                      subject.trim().toLowerCase() === course.title.trim().toLowerCase()
                      || subject.trim().toLowerCase() === course.code.trim().toLowerCase(),
                    ),
                  )
                  .map((course) => course.id);
            next[item.id] = assignedIds.join(',');
          }
        }
        return next;
      });
      setStudentApplications(studentData);
      setStudentRollNumbers((prev) => {
        const next = { ...prev };
        for (const item of studentData) {
          if (!next[item.id] && item.rollNumber) {
            next[item.id] = item.rollNumber;
          }
        }
        return next;
      });
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      if (!isBackground) {
        setError(err instanceof Error ? err.message : 'Unable to load applications.');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  const broadcastSync = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: 'ADMIN_DATA_UPDATED', timestamp: Date.now() });
    } catch {
      // Ignore if BroadcastChannel is unsupported
    }
  }, []);

  useEffect(() => {
    const parsed = getStoredUser();
    if (!parsed) {
      router.push('/login');
      return;
    }

    if (parsed.role !== 'admin') {
      router.push(
        parsed.role === 'teacher'
          ? '/dashboard/teacher'
          : parsed.role === 'student'
          ? '/dashboard/student'
          : '/login',
      );
      return;
    }

    setUser(parsed);
    fetchAdminData(false);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('autograde_admin_sync');
      channel.onmessage = () => {
        fetchAdminData(true);
      };
      channelRef.current = channel;
    }

    const intervalId = setInterval(() => {
      fetchAdminData(true);
    }, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAdminData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      channelRef.current?.close();
    };
  }, [fetchAdminData, router]);

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
        studentRollNumbers[application.id] || application.rollNumber || undefined,
        studentRejectionReasons[application.id],
      );
      setNotice(result.message);
      await fetchAdminData(true);
      broadcastSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update the student application.');
      await fetchAdminData(true);
    } finally {
      setProcessingId(null);
    }
  };

  const decideApplication = async (
    application: TeacherApplication,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    setProcessingId(application.id);
    setError('');
    setNotice('');
    try {
      const result = await authApi.updateTeacherApplication(
        application.id,
        status,
        rejectionReasons[application.id],
      );
      setNotice(result.message);
      await fetchAdminData(true);
      broadcastSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update the application.');
      await fetchAdminData(true);
    } finally {
      setProcessingId(null);
    }
  };

  const assignSubjects = async (application: TeacherApplication) => {
    const courseIds = (subjectDrafts[application.id] || '').split(',').filter(Boolean);
    const subjects = departmentCourses
      .filter((course) => courseIds.includes(course.id))
      .map((course) => course.id);
    setProcessingId(application.id);
    setError('');
    setNotice('');
    try {
      const updated = await authApi.assignTeacherSubjects(application.id, subjects);
      setSubjectDrafts((current) => ({
        ...current,
        [application.id]: updated.assignedCourseIds.join(','),
      }));
      setNotice(`Subjects saved for ${updated.fullName}.`);
      await fetchAdminData(true);
      broadcastSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to assign subjects.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!user) return null;

  const pendingTeachers = applications.filter((a) => a.status === 'PENDING');
  const reviewedTeachers = applications.filter((a) => a.status !== 'PENDING');
  const pendingStudents = studentApplications.filter((s) => s.status === 'PENDING');
  const reviewedStudents = studentApplications.filter((s) => s.status !== 'PENDING');

  const totalPendingCount = pendingTeachers.length + pendingStudents.length;
  const approvedTeachersCount = applications.filter((a) => a.status === 'APPROVED').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Application Review & Subject Assignment</h2>
          <p className="mt-1 text-sm text-[#888888]">
            Signed in as <span className="font-semibold text-[#005461]">{user.email}</span> · Live multi-admin synchronization active
            {lastSyncedAt ? ` (Last synced: ${lastSyncedAt})` : ''}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          loading={syncing}
          onClick={() => fetchAdminData(false)}
          className="flex items-center gap-2"
        >
          <RefreshCw size={15} />
          <span>Sync Now</span>
        </Button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-[#FAB963] bg-[#FFFDF8]">
        <div>
          <p className="font-semibold text-[#1A1A1A]">Set up department subjects before assigning them to teachers</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#666666]">
            In Institution Management, create a department, assign teachers and students to it, then add subjects under that department. Here, assign those subjects to approved teachers. You can enroll students directly, or students can request enrollment with teachers in their own department.
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.push('/dashboard/admin/institution')}>Open Institution Management</Button>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Users size={20} className="text-[#005461]" />
            <div>
              <p className="text-xs uppercase text-[#888888]">Total Applications</p>
              <p className="text-xl font-bold">{applications.length + studentApplications.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Clock3 size={20} className="text-[#FAB963]" />
            <div>
              <p className="text-xs uppercase text-[#888888]">Pending Requests</p>
              <p className="text-xl font-bold">{totalPendingCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <UserCheck size={20} className="text-[#005461]" />
            <div>
              <p className="text-xs uppercase text-[#888888]">Approved Teachers</p>
              <p className="text-xl font-bold">{approvedTeachersCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      {/* Pending Teacher Requests */}
      <section id="teacher-applications" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} className="text-[#005461]" />
            <h3 className="text-lg font-semibold text-[#1A1A1A]">
              Pending Teacher Requests ({pendingTeachers.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <Card>
            <p className="py-6 text-center text-sm text-[#888888]">Loading applications...</p>
          </Card>
        ) : pendingTeachers.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-[#888888]">
              No pending teacher requests. Any request approved or rejected by an admin immediately disappears from this queue.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingTeachers.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-4 border-l-4 border-l-[#FAB963]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                    <p className="text-xs text-[#888888]">
                      {application.university || 'COMSATS University Islamabad, Wah Campus'}
                    </p>
                  </div>
                  <Badge variant="warning">PENDING</Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase text-[#888888]">Phone</p>
                    <p>{application.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-[#888888]">Department</p>
                    <p>{application.department || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-[#888888]">Qualification</p>
                    <p>{application.qualification || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-[#888888]">Submitted</p>
                    <p>{application.requestedAt ? formatDate(application.requestedAt) : 'Unknown'}</p>
                  </div>
                </div>

                <div className="space-y-3 border-t border-[#E8DCC8] pt-4">
                  <Input
                    label="Rejection reason (required to reject)"
                    value={rejectionReasons[application.id] || ''}
                    onChange={(event) =>
                      setRejectionReasons((current) => ({
                        ...current,
                        [application.id]: event.target.value,
                      }))
                    }
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
              </Card>
            ))}
          </div>
        )}

        {/* Reviewed Teachers & Subject Assignment */}
        {reviewedTeachers.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[#666666]">
              Reviewed Teachers & Subject Assignment ({reviewedTeachers.length})
            </h4>
            {reviewedTeachers.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                  </div>
                  <Badge variant={application.status === 'APPROVED' ? 'success' : 'danger'}>
                    {application.status}
                  </Badge>
                </div>

                {application.status === 'REJECTED' && application.rejectionReason && (
                  <p className="text-sm text-red-700">
                    Rejection reason: {application.rejectionReason}
                  </p>
                )}

                {application.status === 'APPROVED' && (
                  <div className="space-y-3 border-t border-[#E8DCC8] pt-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
                        <BookOpen size={15} className="text-[#005461]" /> Assign subjects from the teacher&apos;s department
                      </p>
                      <p className="mt-1 text-xs text-[#777777]">
                        Students in this department will only see these assigned subjects and their teachers.
                      </p>
                    </div>
                    {!application.department && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Assign this teacher to a department in Institution Management before selecting subjects.
                      </p>
                    )}
                    {departmentCourses.filter((course) => course.departmentId === application.departmentId
                      || (!application.departmentId && course.departmentName?.toLowerCase() === application.department?.toLowerCase())).length === 0 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Add subjects to this teacher&apos;s department in Institution Management first.
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {departmentCourses
                        .filter((course) => course.departmentId === application.departmentId
                          || (!application.departmentId && course.departmentName?.toLowerCase() === application.department?.toLowerCase()))
                        .map((course) => {
                          const selected = (subjectDrafts[application.id] || '').split(',').includes(course.id);
                          return (
                            <label key={course.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E8DCC8] p-3 hover:bg-[#FFF8EB]">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) => {
                                  const current = new Set((subjectDrafts[application.id] || '').split(',').filter(Boolean));
                                  if (event.target.checked) current.add(course.id);
                                  else current.delete(course.id);
                                  setSubjectDrafts((drafts) => ({ ...drafts, [application.id]: [...current].join(',') }));
                                }}
                              />
                              <span><span className="block text-sm font-semibold">{course.title}</span><span className="text-xs text-[#777777]">{course.code} · {course.creditHours} credits</span></span>
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#666666]">
                        Selected: {(subjectDrafts[application.id] || '').split(',').filter(Boolean).length}
                      </p>
                      <Button
                        loading={processingId === application.id}
                        disabled={!application.department}
                        onClick={() => assignSubjects(application)}
                      >
                        Save teacher subjects
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Pending Student Requests */}
      <section id="student-applications" className="space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={19} className="text-[#005461]" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">
            Pending Student Requests ({pendingStudents.length})
          </h3>
        </div>
        <p className="text-sm text-[#666666]">
          Review pending student registrations and confirm their unique registration/roll number.
        </p>

        {loading ? (
          <Card>
            <p className="py-6 text-center text-sm text-[#888888]">Loading student applications...</p>
          </Card>
        ) : pendingStudents.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-[#888888]">
              No pending student requests. Approved or rejected requests immediately disappear from this pending list across all admin sessions.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingStudents.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-3 border-l-4 border-l-[#FAB963]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                    <p className="text-xs text-[#005461] font-medium">
                      {application.university || 'COMSATS University Islamabad, Wah Campus'}
                      {application.rollNumber ? ` · Reg No: ${application.rollNumber}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[#888888]">
                      Applied {application.requestedAt ? formatDate(application.requestedAt) : 'date unavailable'}
                    </p>
                  </div>
                  <Badge variant="warning">PENDING</Badge>
                </div>

                <div className="space-y-3 border-t border-[#E8DCC8] pt-3">
                  <Input
                    label="Verify / Assign student registration number"
                    value={studentRollNumbers[application.id] ?? application.rollNumber ?? ''}
                    onChange={(event) =>
                      setStudentRollNumbers((current) => ({
                        ...current,
                        [application.id]: event.target.value,
                      }))
                    }
                    placeholder="e.g. FA22-BCS-047 or SP23-01"
                  />
                  <Input
                    label="Rejection reason (required to reject)"
                    value={studentRejectionReasons[application.id] || ''}
                    onChange={(event) =>
                      setStudentRejectionReasons((current) => ({
                        ...current,
                        [application.id]: event.target.value,
                      }))
                    }
                    placeholder="Explain why the application is being rejected"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      loading={processingId === application.id}
                      disabled={
                        !((studentRollNumbers[application.id] ?? application.rollNumber ?? '').trim())
                      }
                      onClick={() => decideStudentApplication(application, 'APPROVED')}
                    >
                      Approve student
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
              </Card>
            ))}
          </div>
        )}

        {/* Reviewed Student Accounts */}
        {reviewedStudents.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[#666666]">
              Reviewed Student Accounts ({reviewedStudents.length})
            </h4>
            {reviewedStudents.map((application) => (
              <Card key={application.id} padding="sm" className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[#1A1A1A]">{application.fullName}</h4>
                    <p className="text-sm text-[#666666]">{application.email}</p>
                    <p className="text-xs text-[#888888]">
                      {application.university || 'COMSATS University Islamabad, Wah Campus'}
                    </p>
                  </div>
                  <Badge variant={application.status === 'APPROVED' ? 'success' : 'danger'}>
                    {application.status}
                  </Badge>
                </div>

                {application.status === 'APPROVED' && (
                  <p className="text-sm font-medium text-[#005461]">
                    Registration / Roll Number: {application.rollNumber || 'Not assigned'}
                  </p>
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
    </div>
  );
}
