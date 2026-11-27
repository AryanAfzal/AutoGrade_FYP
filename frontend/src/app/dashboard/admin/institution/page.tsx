'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  BookOpen,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { institutionApi } from '@/lib/api';
import type { AcademicTerm, AdminStudentSubjectAssignment, Course, Department, User } from '@/types';

type Tab = 'overview' | 'departments' | 'users' | 'courses' | 'terms';

export default function InstitutionManagementPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState({ departmentCount: 0, courseCount: 0, termCount: 0, userCount: 0, assignedUserCount: 0 });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<AdminStudentSubjectAssignment[]>([]);
  const [studentSubjectDrafts, setStudentSubjectDrafts] = useState<Record<string, string>>({});
  const [assignmentRole, setAssignmentRole] = useState<'teacher' | 'student'>('teacher');
  const [userSearch, setUserSearch] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [departmentHead, setDepartmentHead] = useState('');
  const [departmentDescription, setDepartmentDescription] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseDepartment, setCourseDepartment] = useState('');
  const [courseCredits, setCourseCredits] = useState(3);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [termName, setTermName] = useState('');
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [termCurrent, setTermCurrent] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewData, departmentData, courseData, termData, userData, assignmentData] = await Promise.all([
        institutionApi.getOverview(),
        institutionApi.getDepartments(),
        institutionApi.getCourses(),
        institutionApi.getTerms(),
        institutionApi.getUsers(),
        institutionApi.getStudentAssignments(),
      ]);
      setOverview(overviewData);
      setDepartments(departmentData);
      setCourses(courseData);
      setTerms(termData);
      setUsers(userData);
      setStudentAssignments(assignmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load institution data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetDepartment = () => {
    setEditingDepartment(null);
    setDepartmentName('');
    setDepartmentCode('');
    setDepartmentHead('');
    setDepartmentDescription('');
  };
  const saveDepartment = async () => {
    if (!departmentName.trim() || !departmentCode.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { name: departmentName.trim(), code: departmentCode.trim(), head: departmentHead.trim(), description: departmentDescription.trim(), active: true };
      const result = editingDepartment
        ? await institutionApi.updateDepartment(editingDepartment.id, payload)
        : await institutionApi.createDepartment(payload);
      setNotice(editingDepartment ? `${result.name} updated.` : `${result.name} created.`);
      resetDepartment();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  };
  const editDepartment = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentName(department.name);
    setDepartmentCode(department.code);
    setDepartmentHead(department.head || '');
    setDepartmentDescription(department.description || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deleteDepartment = async (department: Department) => {
    if (!window.confirm(`Delete ${department.name}? Existing user assignments will be retained as text.`)) return;
    try {
      await institutionApi.deleteDepartment(department.id);
      await load();
      setNotice(`${department.name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete department.');
    }
  };

  const resetCourse = () => {
    setEditingCourse(null);
    setCourseTitle('');
    setCourseCode('');
    setCourseDepartment('');
    setCourseCredits(3);
  };
  const saveCourse = async () => {
    if (!courseTitle.trim() || !courseCode.trim() || !courseDepartment) return;
    setSaving(true);
    try {
      const department = departments.find((item) => item.id === courseDepartment);
      const payload = { title: courseTitle.trim(), code: courseCode.trim(), departmentId: courseDepartment || null, departmentName: department?.name || null, creditHours: courseCredits, active: true };
      const result = editingCourse ? await institutionApi.updateCourse(editingCourse.id, payload) : await institutionApi.createCourse(payload);
      setNotice(`${result.code} saved.`);
      resetCourse();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save course.');
    } finally {
      setSaving(false);
    }
  };
  const deleteCourse = async (course: Course) => {
    if (!window.confirm(`Delete ${course.code} - ${course.title}?`)) return;
    try {
      await institutionApi.deleteCourse(course.id);
      setNotice(`${course.code} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete course.');
    }
  };

  const resetTerm = () => {
    setEditingTerm(null);
    setTermName('');
    setTermStart('');
    setTermEnd('');
    setTermCurrent(false);
  };
  const saveTerm = async () => {
    if (!termName.trim() || !termStart || !termEnd) return;
    setSaving(true);
    try {
      const payload = { name: termName.trim(), startDate: termStart, endDate: termEnd, current: termCurrent, status: termCurrent ? 'ACTIVE' as const : 'UPCOMING' as const };
      const result = editingTerm ? await institutionApi.updateTerm(editingTerm.id, payload) : await institutionApi.createTerm(payload);
      setNotice(`${result.name} saved.`);
      resetTerm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save academic term.');
    } finally {
      setSaving(false);
    }
  };
  const deleteTerm = async (term: AcademicTerm) => {
    if (!window.confirm(`Delete ${term.name}?`)) return;
    try {
      await institutionApi.deleteTerm(term.id);
      setNotice(`${term.name} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete academic term.');
    }
  };

  const assignDepartment = async (userId: string, departmentName: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await institutionApi.assignUserDepartment(userId, departmentName || null);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign department.');
    } finally {
      setSaving(false);
    }
  };

  const getDepartmentId = (user: User) =>
    departments.find((department) =>
      department.id === user.departmentId
      || (!user.departmentId && department.name.toLowerCase() === user.department?.toLowerCase()),
    )?.id || '';

  const getTeacherSubjectOptions = (student: User) => {
    const departmentId = getDepartmentId(student);
    if (!departmentId) return [];
    return users
      .filter((teacher) =>
        teacher.role === 'teacher'
        && teacher.status === 'APPROVED'
        && getDepartmentId(teacher) === departmentId,
      )
      .flatMap((teacher) => courses
        .filter((course) =>
          course.active
          && course.departmentId === departmentId
          && (teacher.assignedCourseIds?.length
            ? teacher.assignedCourseIds.includes(course.id)
            : (teacher.assignedSubjects || []).some((subject) =>
                subject.trim().toLowerCase() === course.title.trim().toLowerCase()
                || subject.trim().toLowerCase() === course.code.trim().toLowerCase(),
              )),
        )
        .map((course) => ({
          value: `${teacher.id}|${course.id}`,
          teacherId: teacher.id,
          teacherName: teacher.fullName,
          course,
        })),
      );
  };

  const assignStudentSubject = async (student: User) => {
    const [teacherId, courseId] = (studentSubjectDrafts[student.id] || '').split('|');
    if (!teacherId || !courseId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await institutionApi.assignStudentSubject(student.id, teacherId, courseId);
      setNotice(result.message);
      setStudentSubjectDrafts((drafts) => ({ ...drafts, [student.id]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign subject to student.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'users', label: 'Assign Teachers & Students', icon: Users },
    { id: 'courses', label: 'Department Subjects', icon: BookOpen },
    { id: 'terms', label: 'Academic Terms', icon: CalendarDays },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#005461]">Administration</p>
        <h1 className="mt-1 text-2xl font-bold text-[#1A1A1A]">Institution Management</h1>
        <p className="mt-1 text-sm text-[#777777]">Departments, courses, academic calendar, and user access.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E8E1D6] bg-white p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-[#005461] text-white shadow-sm' : 'text-[#666666] hover:bg-[#FFF8EB]'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={16} />{notice}</div>}

      {loading ? <Card><p className="py-16 text-center text-sm text-[#888888]">Loading institution data...</p></Card> : (
        <>
          {tab === 'overview' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Departments', value: overview.departmentCount, icon: Building2 },
                { label: 'Courses', value: overview.courseCount, icon: BookOpen },
                { label: 'Academic Terms', value: overview.termCount, icon: CalendarDays },
                { label: 'Assigned Users', value: `${overview.assignedUserCount}/${overview.userCount}`, icon: Users },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label}><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#888888]">{label}</p><p className="mt-2 text-3xl font-bold text-[#005461]">{value}</p></div><div className="rounded-xl bg-[#FFF1D7] p-3"><Icon size={20} className="text-[#005461]" /></div></div></Card>
              ))}
            </div>
          )}

          {tab === 'departments' && (
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <Card className="h-fit">
                <h2 className="mb-4 text-lg font-bold">{editingDepartment ? 'Edit Department' : 'Create Department'}</h2>
                <div className="space-y-3">
                  <Input label="Department name" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="Computer Science" />
                  <Input label="Department code" value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value.toUpperCase())} placeholder="CS" />
                  <Input label="Head of department" value={departmentHead} onChange={(e) => setDepartmentHead(e.target.value)} placeholder="Dr. Name" />
                  <div><label className="mb-1.5 block text-sm font-medium">Description</label><textarea value={departmentDescription} onChange={(e) => setDepartmentDescription(e.target.value)} className="min-h-24 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#005461]" placeholder="Department overview" /></div>
                  <div className="flex gap-2"><Button loading={saving} onClick={saveDepartment}><Plus size={16} className="mr-2" />{editingDepartment ? 'Save Changes' : 'Add Department'}</Button>{editingDepartment && <Button variant="secondary" onClick={resetDepartment}>Cancel</Button>}</div>
                </div>
              </Card>
              <div className="space-y-3">
                {departments.map((department) => (
                  <Card key={department.id} padding="sm" className="flex flex-wrap items-center justify-between gap-4">
                    <div><div className="flex items-center gap-2"><h3 className="font-bold">{department.name}</h3>                    <Badge variant="default">{department.code}</Badge></div><p className="mt-1 text-sm text-[#777777]">{department.head || 'No department head'} · {department.description || 'No description'}</p></div>
                    <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => editDepartment(department)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => deleteDepartment(department)}><Trash2 size={15} /></Button></div>
                  </Card>
                ))}
                {departments.length === 0 && <Card><p className="py-10 text-center text-sm text-[#888888]">No departments created yet.</p></Card>}
              </div>
            </div>
          )}

          {tab === 'users' && (
            <Card>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Department assignments</h2>
                  <p className="text-sm text-[#777777]">Choose a department beside a teacher or student. Choose “No department” to remove an assignment.</p>
                </div>
                <Badge variant="default">
                  {users.filter((user) => user.role === assignmentRole).length} {assignmentRole === 'teacher' ? 'teachers' : 'students'}
                </Badge>
              </div>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg bg-[#F4F1EA] p-1">
                  {(['teacher', 'student'] as const).map((role) => (
                    <button key={role} type="button" onClick={() => setAssignmentRole(role)} className={`rounded-md px-4 py-2 text-sm font-semibold capitalize ${assignmentRole === role ? 'bg-white text-[#005461] shadow-sm' : 'text-[#777777]'}`}>
                      {role}s
                    </button>
                  ))}
                </div>
                <Input aria-label="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={`Search ${assignmentRole}s by name or email`} className="max-w-sm" />
              </div>
              <div className="space-y-2">
                {users
                  .filter((user) => user.role === assignmentRole)
                  .filter((user) => `${user.fullName} ${user.email}`.toLowerCase().includes(userSearch.trim().toLowerCase()))
                  .map((user) => {
                    const departmentId = getDepartmentId(user);
                    const subjectOptions = user.role === 'student' ? getTeacherSubjectOptions(user) : [];
                    const existingSubjects = user.role === 'student'
                      ? studentAssignments.filter((assignment) => assignment.studentId === user.id)
                      : [];
                    return (
                      <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#EEE8DC] px-4 py-3">
                        <div className="w-full sm:min-w-48">
                          <p className="font-semibold">{user.fullName}</p>
                          <p className="text-xs text-[#777777]">{user.email}</p>
                          <p className="mt-1 text-xs text-[#777777]">Account: {user.status || 'APPROVED'}</p>
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap w-full sm:w-auto items-center justify-start sm:justify-end gap-3">
                          <span className="text-sm text-[#777777]">{departmentId ? 'Assigned to' : 'Not assigned'}</span>
                          <select
                            aria-label={`Department for ${user.fullName}`}
                            value={departmentId}
                            disabled={saving}
                            onChange={(event) => assignDepartment(user.id, event.target.value)}
                            className="w-full sm:w-auto sm:min-w-52 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#005461] disabled:opacity-60"
                          >
                            <option value="">No department</option>
                            {departments.filter((department) => department.active).map((department) => (
                              <option key={department.id} value={department.id}>{department.name}</option>
                            ))}
                          </select>
                        </div>
                        {user.role === 'student' && (
                          <div className="w-full border-t border-[#EEE8DC] pt-3">
                            <p className="text-sm font-semibold">Assign a subject</p>
                            <p className="mb-2 text-xs text-[#777777]">Only subjects assigned to approved teachers in this student&apos;s department are available.</p>
                            {existingSubjects.length > 0 && (
                              <div className="mb-3 flex flex-wrap gap-2">
                                {existingSubjects.map((assignment) => (
                                  <Badge key={assignment.id} variant={assignment.status === 'APPROVED' ? 'success' : assignment.status === 'PENDING' ? 'warning' : 'danger'}>
                                    {assignment.subject} · {assignment.teacherName} · {assignment.status}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <select
                                aria-label={`Subject and teacher for ${user.fullName}`}
                                value={studentSubjectDrafts[user.id] || ''}
                                disabled={saving || !subjectOptions.length || user.status !== 'APPROVED'}
                                onChange={(event) => setStudentSubjectDrafts((drafts) => ({ ...drafts, [user.id]: event.target.value }))}
                                className="w-full sm:w-auto sm:min-w-64 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm disabled:opacity-60"
                              >
                                <option value="">Select a teacher and subject</option>
                                {subjectOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.course.code} · {option.course.title} — {option.teacherName}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                loading={saving}
                                disabled={saving || !studentSubjectDrafts[user.id] || user.status !== 'APPROVED'}
                                onClick={() => assignStudentSubject(user)}
                              >
                                Enroll student
                              </Button>
                              {!departmentId && <span className="self-center text-xs text-amber-700">Assign a department first.</span>}
                              {departmentId && !subjectOptions.length && <span className="self-center text-xs text-[#777777]">No assigned teacher subjects available in this department yet.</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                {!users.some((user) => user.role === assignmentRole) && (
                  <p className="py-10 text-center text-sm text-[#888888]">No {assignmentRole} accounts found.</p>
                )}
              </div>
            </Card>
          )}

          {tab === 'courses' && (
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <Card className="h-fit"><h2 className="mb-4 text-lg font-bold">{editingCourse ? 'Edit Department Subject' : 'Add Department Subject'}</h2><div className="space-y-3"><Input label="Subject name" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Data Structures" /><Input label="Subject code" value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} placeholder="CS201" /><div><label className="mb-1.5 block text-sm font-medium">Department</label><select value={courseDepartment} onChange={(e) => setCourseDepartment(e.target.value)} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm"><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div><Input type="number" min={1} max={12} label="Credit hours" value={courseCredits} onChange={(e) => setCourseCredits(Number(e.target.value))} /><Button loading={saving} disabled={!courseDepartment} onClick={saveCourse}>{editingCourse ? 'Save Subject' : 'Add Subject'}</Button></div></Card>
              <div className="space-y-3">{courses.map((course) => <Card key={course.id} padding="sm" className="flex items-center justify-between"><div><div className="flex items-center gap-2"><h3 className="font-bold">{course.title}</h3><Badge variant="default">{course.code}</Badge></div><p className="mt-1 text-sm text-[#777777]">{course.departmentName || 'No department'} · {course.creditHours} credit hours</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setEditingCourse(course); setCourseTitle(course.title); setCourseCode(course.code); setCourseDepartment(course.departmentId || ''); setCourseCredits(course.creditHours); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => deleteCourse(course)}><Trash2 size={15} /></Button></div></Card>)}</div>
            </div>
          )}

          {tab === 'terms' && (
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <Card className="h-fit"><h2 className="mb-4 text-lg font-bold">{editingTerm ? 'Edit Term' : 'Add Academic Term'}</h2><div className="space-y-3"><Input label="Term name" value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="Fall 2026" /><Input type="date" label="Start date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /><Input type="date" label="End date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={termCurrent} onChange={(e) => setTermCurrent(e.target.checked)} />Set as current academic term</label><Button loading={saving} onClick={saveTerm}>{editingTerm ? 'Save Term' : 'Add Term'}</Button></div></Card>
              <div className="space-y-3">{terms.map((term) => <Card key={term.id} padding="sm" className="flex items-center justify-between"><div><div className="flex items-center gap-2"><h3 className="font-bold">{term.name}</h3>{term.current && <Badge variant="success">CURRENT</Badge>}</div><p className="mt-1 text-sm text-[#777777]">{term.startDate} to {term.endDate}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setEditingTerm(term); setTermName(term.name); setTermStart(term.startDate); setTermEnd(term.endDate); setTermCurrent(term.current); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => deleteTerm(term)}><Trash2 size={15} /></Button></div></Card>)}</div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
