import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import axios, { AxiosError } from 'axios';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { User } from './users/entities/user.entity';
import { StudentEnrollment } from './users/entities/student-enrollment.entity';

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runTest(
  id: string,
  name: string,
  fn: () => Promise<string>,
) {
  try {
    const details = await fn();
    results.push({ id, name, passed: true, details });
    console.log(`✅ [${id}] PASS: ${name} -> ${details}`);
  } catch (err: unknown) {
    let message = 'Unknown error';
    if (err instanceof AxiosError) {
      message = `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`;
    } else if (err instanceof Error) {
      message = err.message;
    }
    results.push({ id, name, passed: false, details: message });
    console.error(`❌ [${id}] FAIL: ${name} -> ${message}`);
  }
}

async function main() {
  console.log('==========================================================');
  console.log(' Starting Module 1: User & Role Management Test Suite');
  console.log('==========================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.use(express.json({ limit: '5mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(PORT);

  const dataSource = app.get(DataSource);
  const userRepo = dataSource.getRepository(User);

  const suffix = Date.now().toString().slice(-6);
  const teacherEmail = `test.teacher.${suffix}@cuiwah.edu.pk`;
  const studentEmail = `test.student.${suffix}@cuiwah.edu.pk`;
  const studentEmail2 = `test.student2.${suffix}@cuiwah.edu.pk`;
  const studentRollNo = `FA22-BCS-${suffix}`;

  let admin1Token = '';
  let admin2Token = '';
  let teacherId = '';
  let studentId = '';
  let teacherToken = '';
  let studentToken = '';
  let resetToken = '';

  try {
    // ---------------------------------------------------------
    // SECTION 1: Admin Management
    // ---------------------------------------------------------
    await runTest(
      'TC-1.1',
      'Fixed Admin Accounts (admin1, admin2, admin3) login with predefined credentials',
      async () => {
        const res1 = await axios.post(`${BASE_URL}/auth/login`, {
          email: 'admin1@cuiwah.edu.pk',
          password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
          role: 'admin',
        });
        const res2 = await axios.post(`${BASE_URL}/auth/login`, {
          email: 'admin2@cuiwah.edu.pk',
          password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
          role: 'admin',
        });
        const res3 = await axios.post(`${BASE_URL}/auth/login`, {
          email: 'admin3@cuiwah.edu.pk',
          password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
          role: 'admin',
        });
        admin1Token = res1.data.token;
        admin2Token = res2.data.token;
        if (!admin1Token || !admin2Token || !res3.data.token) {
          throw new Error('Admin tokens missing');
        }
        return 'All 3 predefined admin accounts authenticated successfully';
      },
    );

    await runTest(
      'TC-1.2',
      'Block ordinary users from registering with a predefined admin email',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/register/teacher`, {
            fullName: 'Fake Admin',
            email: 'admin1@cuiwah.edu.pk',
            password: 'StrongPassword@1',
          });
          throw new Error('Should have rejected admin email registration');
        } catch (err: any) {
          if (err.response?.status === 400) {
            return `Blocked with 400: ${err.response.data.message}`;
          }
          throw err;
        }
      },
    );

    await runTest(
      'TC-1.3',
      'Block non-predefined email from logging in as Admin',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/login`, {
            email: 'random.hacker@cuiwah.edu.pk',
            password: 'Admin@123',
            role: 'admin',
          });
          throw new Error('Should have blocked unauthorized admin login');
        } catch (err: any) {
          if (err.response?.status === 401) {
            return `Blocked with 401: ${err.response.data.message}`;
          }
          throw err;
        }
      },
    );

    // ---------------------------------------------------------
    // SECTION 2 & 5: Teacher Registration, Email Validation & Password Policy
    // ---------------------------------------------------------
    await runTest(
      'TC-5.1',
      'Reject weak password missing uppercase or special character on Teacher Registration',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/register/teacher`, {
            fullName: 'Weak Password Teacher',
            email: teacherEmail,
            password: 'weakpassword123', // No uppercase, no special char
          });
          throw new Error('Weak password should have been rejected by server validation');
        } catch (err: any) {
          if (err.response?.status === 400) {
            return `Server rejected weak password: ${JSON.stringify(err.response.data.message)}`;
          }
          throw err;
        }
      },
    );

    await runTest(
      'TC-2.1',
      'Register Teacher with name, unique email, and strong password',
      async () => {
        const res = await axios.post(`${BASE_URL}/auth/register/teacher`, {
          fullName: 'Dr. Usman Ali',
          email: teacherEmail,
          password: 'Teacher@123',
        });
        teacherId = res.data.user.id;
        const dbUser = await userRepo.findOneBy({ id: teacherId });
        if (!dbUser || dbUser.password === 'Teacher@123' || !dbUser.password.startsWith('$2')) {
          throw new Error('Password was not hashed with bcrypt');
        }
        return `Teacher created (status=${res.data.user.status}, bcrypt hash verified)`;
      },
    );

    await runTest(
      'TC-2.2',
      'Prevent duplicate Teacher email registration',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/register/teacher`, {
            fullName: 'Duplicate Teacher',
            email: teacherEmail,
            password: 'Teacher@123',
          });
          throw new Error('Duplicate email should have been rejected');
        } catch (err: any) {
          if (err.response?.status === 409 || err.response?.status === 400) {
            return `Rejected duplicate email: ${err.response.data.message}`;
          }
          throw err;
        }
      },
    );

    // ---------------------------------------------------------
    // SECTION 3: Student Registration, Unique Email & Unique Reg No
    // ---------------------------------------------------------
    await runTest(
      'TC-3.1',
      'Register Student with university name, full name, email, registration number, and strong password',
      async () => {
        const res = await axios.post(`${BASE_URL}/auth/register/student`, {
          university: 'COMSATS University Islamabad, Wah Campus',
          fullName: 'Aryan Student',
          email: studentEmail,
          registrationNumber: studentRollNo,
          password: 'Student@123',
        });
        studentId = res.data.user.id;
        if (res.data.user.rollNumber !== studentRollNo) {
          throw new Error(`Expected rollNumber ${studentRollNo}, got ${res.data.user.rollNumber}`);
        }
        return `Student registered with university="${res.data.user.university}" and rollNumber="${res.data.user.rollNumber}"`;
      },
    );

    await runTest(
      'TC-3.2',
      'Prevent duplicate Student email registration',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/register/student`, {
            university: 'COMSATS University Islamabad, Wah Campus',
            fullName: 'Another Student',
            email: studentEmail,
            registrationNumber: `OTHER-${suffix}`,
            password: 'Student@123',
          });
          throw new Error('Duplicate student email should have been rejected');
        } catch (err: any) {
          if (err.response?.status === 409 || err.response?.status === 400) {
            return `Rejected duplicate student email: ${err.response.data.message}`;
          }
          throw err;
        }
      },
    );

    await runTest(
      'TC-3.3',
      'Prevent duplicate Student registration number (rollNumber)',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/register/student`, {
            university: 'COMSATS University Islamabad, Wah Campus',
            fullName: 'Duplicate Roll Student',
            email: studentEmail2,
            registrationNumber: studentRollNo, // Same registration number!
            password: 'Student@123',
          });
          throw new Error('Duplicate student registration number should have been rejected');
        } catch (err: any) {
          if (err.response?.status === 409 || err.response?.status === 400) {
            return `Rejected duplicate registration number: ${err.response.data.message}`;
          }
          throw err;
        }
      },
    );

    // ---------------------------------------------------------
    // SECTION 1.2: Concurrent Data Synchronization & Atomic Multi-Admin Approval
    // ---------------------------------------------------------
    await runTest(
      'TC-1.4',
      'Concurrent Multi-Admin Approval: Admin 1 and Admin 2 attempt to approve the same Teacher simultaneously',
      async () => {
        const [attempt1, attempt2] = await Promise.allSettled([
          axios.patch(
            `${BASE_URL}/auth/teacher-applications/${teacherId}`,
            { status: 'APPROVED' },
            { headers: { Authorization: `Bearer ${admin1Token}` } },
          ),
          axios.patch(
            `${BASE_URL}/auth/teacher-applications/${teacherId}`,
            { status: 'APPROVED' },
            { headers: { Authorization: `Bearer ${admin2Token}` } },
          ),
        ]);

        const fulfilled = [attempt1, attempt2].filter((r) => r.status === 'fulfilled');
        const rejected = [attempt1, attempt2].filter((r) => r.status === 'rejected');

        if (fulfilled.length !== 1 || rejected.length !== 1) {
          throw new Error(
            `Expected exactly 1 success and 1 conflict, got ${fulfilled.length} fulfilled and ${rejected.length} rejected`,
          );
        }

        // Verify Admin 2 immediately sees the teacher as APPROVED (not PENDING)
        const admin2View = await axios.get(`${BASE_URL}/auth/teacher-applications`, {
          headers: { Authorization: `Bearer ${admin2Token}` },
        });
        const teacherInAdmin2 = admin2View.data.find((t: any) => t.id === teacherId);
        if (!teacherInAdmin2 || teacherInAdmin2.status !== 'APPROVED') {
          throw new Error('Admin 2 did not see updated APPROVED status');
        }

        return 'Atomic lock verified: 1st admin succeeded, 2nd admin got 409 Conflict, and Admin 2 sees updated APPROVED state';
      },
    );

    await runTest(
      'TC-1.5',
      'Admin approves Student registration and synchronizes across admins',
      async () => {
        const res = await axios.patch(
          `${BASE_URL}/auth/student-applications/${studentId}`,
          { status: 'APPROVED', rollNumber: studentRollNo },
          { headers: { Authorization: `Bearer ${admin1Token}` } },
        );
        if (res.data.student.status !== 'APPROVED') {
          throw new Error('Student was not approved');
        }
        return `Student approved with rollNumber=${res.data.student.rollNumber}`;
      },
    );

    // ---------------------------------------------------------
    // SECTION 4: Login, Remember Me, Clear Error Messages, Forgot & Reset Password
    // ---------------------------------------------------------
    await runTest(
      'TC-4.1',
      'Clear error message on wrong password login',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/login`, {
            email: teacherEmail,
            password: 'WrongPassword@999',
            role: 'teacher',
          });
          throw new Error('Should have failed with wrong password');
        } catch (err: any) {
          if (err.response?.status === 401) {
            return `Returned clear 401 message: "${err.response.data.message}"`;
          }
          throw err;
        }
      },
    );

    await runTest(
      'TC-4.2',
      'Login with Remember Me returns extended 30d session token',
      async () => {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
          email: teacherEmail,
          password: 'Teacher@123',
          role: 'teacher',
          rememberMe: true,
        });
        teacherToken = res.data.token;
        if (res.data.expiresIn !== '30d') {
          throw new Error(`Expected expiresIn=30d, got ${res.data.expiresIn}`);
        }
        const stuRes = await axios.post(`${BASE_URL}/auth/login`, {
          email: studentEmail,
          password: 'Student@123',
          role: 'student',
          rememberMe: false,
        });
        studentToken = stuRes.data.token;
        if (stuRes.data.expiresIn !== '1d') {
          throw new Error(`Expected expiresIn=1d for rememberMe=false, got ${stuRes.data.expiresIn}`);
        }
        return 'Remember Me (30d) and standard session (1d) tokens issued accurately';
      },
    );

    await runTest(
      'TC-4.3',
      'Forgot Password generates time-limited single-use reset token',
      async () => {
        const res = await axios.post(`${BASE_URL}/auth/forgot-password`, {
          email: studentEmail,
        });
        resetToken = res.data.resetToken;
        if (!resetToken || res.data.expiresInMinutes !== 15) {
          throw new Error('Reset token not generated properly');
        }
        return `Generated 15-min reset token (${resetToken.slice(0, 12)}...)`;
      },
    );

    await runTest(
      'TC-4.4',
      'Reset Password Confirmation & Single-Use Token enforcement',
      async () => {
        // 1. Reset password using valid token
        const res = await axios.post(`${BASE_URL}/auth/reset-password`, {
          token: resetToken,
          newPassword: 'NewStudent@456',
          confirmPassword: 'NewStudent@456',
        });

        // 2. Verify token cannot be used a second time (single-use)
        let secondUseBlocked = false;
        try {
          await axios.post(`${BASE_URL}/auth/reset-password`, {
            token: resetToken,
            newPassword: 'AnotherPassword@789',
            confirmPassword: 'AnotherPassword@789',
          });
        } catch (err: any) {
          if (err.response?.status === 400) {
            secondUseBlocked = true;
          }
        }
        if (!secondUseBlocked) {
          throw new Error('Reset token was allowed to be used twice!');
        }

        // 3. Verify login with the new password succeeds
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
          email: studentEmail,
          password: 'NewStudent@456',
          role: 'student',
        });
        studentToken = loginRes.data.token;
        return `${res.data.message} (Single-use token replay blocked & new password login verified)`;
      },
    );

    await runTest(
      'TC-4.5',
      'Teacher approves Student Subject Enrollment Request without 500 error',
      async () => {
        await axios.patch(
          `${BASE_URL}/auth/teachers/${teacherId}/subjects`,
          { subjects: ['Intro to AI'] },
          { headers: { Authorization: `Bearer ${admin1Token}` } },
        );
        await axios.post(
          `${BASE_URL}/auth/enrollments`,
          { teacherId, subject: 'Intro to AI' },
          { headers: { Authorization: `Bearer ${studentToken}` } },
        );
        const requestsRes = await axios.get(`${BASE_URL}/auth/teacher-requests`, {
          headers: { Authorization: `Bearer ${teacherToken}` },
        });
        const reqItem = requestsRes.data[0];
        if (!reqItem) {
          throw new Error('Teacher request not found');
        }
        const approveRes = await axios.patch(
          `${BASE_URL}/auth/teacher-requests/${reqItem.id}`,
          { status: 'APPROVED' },
          { headers: { Authorization: `Bearer ${teacherToken}` } },
        );
        if (approveRes.data.user.status !== 'APPROVED') {
          throw new Error('Enrollment request was not approved');
        }
        return `${approveRes.data.message} (subject=${approveRes.data.user.subject})`;
      },
    );

    // ---------------------------------------------------------
    // SECTION 6: Profile Setup, Profile Picture, and Change Password
    // ---------------------------------------------------------
    await runTest(
      'TC-6.1',
      'Profile Setup & Update (name, university, department, qualification, profile picture)',
      async () => {
        const sampleAvatar =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const res = await axios.patch(
          `${BASE_URL}/auth/profile`,
          {
            fullName: 'Dr. Usman Ali Updated',
            university: 'COMSATS University Islamabad, Wah Campus',
            department: 'Computer Science',
            qualification: 'PhD Artificial Intelligence',
            phone: '+923001234567',
            profilePicture: sampleAvatar,
          },
          { headers: { Authorization: `Bearer ${teacherToken}` } },
        );
        if (
          res.data.user.fullName !== 'Dr. Usman Ali Updated' ||
          res.data.user.profilePicture !== sampleAvatar ||
          !res.data.user.isProfileComplete
        ) {
          throw new Error('Profile fields were not updated properly');
        }
        return 'Teacher profile & profile picture updated and marked complete';
      },
    );

    await runTest(
      'TC-6.2',
      'Account Settings: Change Password securely',
      async () => {
        const res = await axios.patch(
          `${BASE_URL}/auth/change-password`,
          {
            currentPassword: 'Teacher@123',
            newPassword: 'UpdatedTeacher@789',
            confirmPassword: 'UpdatedTeacher@789',
          },
          { headers: { Authorization: `Bearer ${teacherToken}` } },
        );
        const relogin = await axios.post(`${BASE_URL}/auth/login`, {
          email: teacherEmail,
          password: 'UpdatedTeacher@789',
          role: 'teacher',
        });
        if (!relogin.data.token) {
          throw new Error('Re-login with changed password failed');
        }
        return `${res.data.message} (Verified login with updated password)`;
      },
    );

    // ---------------------------------------------------------
    // SECTION 7: Application & Database Security (RBAC & SQL Injection protection)
    // ---------------------------------------------------------
    await runTest(
      'TC-7.1',
      'Role-Based Access Control (RBAC): Block Student and Teacher from Admin endpoints',
      async () => {
        let studentBlocked = false;
        let teacherBlocked = false;
        try {
          await axios.get(`${BASE_URL}/auth/teacher-applications`, {
            headers: { Authorization: `Bearer ${studentToken}` },
          });
        } catch (err: any) {
          if (err.response?.status === 403) studentBlocked = true;
        }
        try {
          await axios.get(`${BASE_URL}/auth/student-applications`, {
            headers: { Authorization: `Bearer ${teacherToken}` },
          });
        } catch (err: any) {
          if (err.response?.status === 403) teacherBlocked = true;
        }
        if (!studentBlocked || !teacherBlocked) {
          throw new Error('RBAC failed to block non-admin roles from admin endpoints');
        }
        return 'Both Student (403 Forbidden) and Teacher (403 Forbidden) blocked from Admin APIs';
      },
    );

    await runTest(
      'TC-7.2',
      'Role-Based Access Control (RBAC): Block Student and Admin from Teacher Exam Creation API',
      async () => {
        let studentBlocked = false;
        let adminBlocked = false;
        try {
          await axios.get(`${BASE_URL}/exams`, {
            headers: { Authorization: `Bearer ${studentToken}` },
          });
        } catch (err: any) {
          if (err.response?.status === 403) studentBlocked = true;
        }
        try {
          await axios.get(`${BASE_URL}/exams`, {
            headers: { Authorization: `Bearer ${admin1Token}` },
          });
        } catch (err: any) {
          if (err.response?.status === 403) adminBlocked = true;
        }
        if (!studentBlocked || !adminBlocked) {
          throw new Error('RBAC failed to block non-teacher roles from /exams');
        }
        return 'Both Student (403 Forbidden) and Admin (403 Forbidden) blocked from Teacher-only /exams API';
      },
    );

    await runTest(
      'TC-7.3',
      'SQL Injection Protection: Parameterized query safely rejects SQLi payload in login',
      async () => {
        try {
          await axios.post(`${BASE_URL}/auth/login`, {
            email: "' OR 1=1 --@cuiwah.edu.pk",
            password: "' OR '1'='1",
            role: 'admin',
          });
          throw new Error('SQLi payload should not succeed');
        } catch (err: any) {
          if (err.response?.status === 400 || err.response?.status === 401) {
            return `SQLi payload safely neutralized (HTTP ${err.response.status})`;
          }
          throw err;
        }
      },
    );
  } finally {
    const enrollmentRepo = dataSource.getRepository(StudentEnrollment);
    if (studentId) {
      await enrollmentRepo.delete({ student: { id: studentId } });
    }
    // Clean up temporary test users created during the test run
    for (const email of [
      teacherEmail,
      studentEmail,
      studentEmail2,
    ]) {
      await userRepo.delete({ email });
    }
    await app.close();
  }

  console.log('\n==========================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(` Test Summary: ${passedCount}/${results.length} Passed`);
  console.log('==========================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main();
