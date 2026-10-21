'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Sparkles,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import PasswordStrengthMeter, { validatePasswordPolicy } from '@/components/ui/PasswordStrengthMeter';
import { authApi, getStoredUser, updateStoredUser } from '@/lib/api';
import type { User } from '@/types';

export default function ProfileAndSettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [university, setUniversity] = useState('COMSATS University Islamabad, Wah Campus');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [qualification, setQualification] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const populateUser = (u: User) => {
    setUser(u);
    setFullName(u.fullName || '');
    setEmail(u.email || '');
    setUniversity(u.university || 'COMSATS University Islamabad, Wah Campus');
    setPhone(u.phone || '');
    setDepartment(u.department || '');
    setQualification(u.qualification || '');
    setRegistrationNumber(u.rollNumber || '');
    setProfilePicture(u.profilePicture || null);
  };

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      populateUser(cached);
    }
    authApi
      .getCurrentUser()
      .then((fresh) => {
        populateUser(fresh);
        updateStoredUser(fresh);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Profile picture must be smaller than 2 MB.');
      return;
    }

    setUploadingPicture(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const result = await authApi.uploadProfilePicture(file);
      populateUser(result.user);
      updateStoredUser(result.user);
      setProfileMessage('Profile picture updated successfully.');
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error ? err.message : 'Unable to upload profile picture.',
      );
    } finally {
      setUploadingPicture(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePicture = async () => {
    setUploadingPicture(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const result = await authApi.updateProfile({ profilePicture: '' });
      populateUser(result.user);
      updateStoredUser(result.user);
      setProfileMessage('Profile picture removed.');
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error ? err.message : 'Unable to remove profile picture.',
      );
    } finally {
      setUploadingPicture(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setProfileError('Full name must be at least 2 characters long.');
      return;
    }
    if (!university.trim() || university.trim().length < 2) {
      setProfileError('University name is required.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setProfileError('Please enter a valid email address.');
      return;
    }

    setSavingProfile(true);
    try {
      const result = await authApi.updateProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        university: university.trim(),
        phone: phone.trim(),
        department: department.trim(),
        qualification: qualification.trim(),
        registrationNumber:
          user?.role === 'student' ? registrationNumber.trim() : undefined,
      });
      populateUser(result.user);
      updateStoredUser(result.user);
      setProfileMessage(result.message);
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error ? err.message : 'Unable to update profile.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setPasswordError(policyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation password do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const result = await authApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setPasswordMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error ? err.message : 'Unable to change password.',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading && !user) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-[#888888]">Loading profile...</p>
      </Card>
    );
  }

  if (!user) return null;

  const needsInitialSetup =
    !user.isProfileComplete ||
    (user.role === 'teacher' && (!user.department || !user.qualification));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Profile & Account Settings</h2>
        <p className="mt-1 text-sm text-[#888888]">
          Manage your personal information, university details, profile picture, and password security.
        </p>
      </div>

      {needsInitialSetup && (
        <div className="flex items-start gap-3 rounded-xl border border-[#FAB963] bg-[#FFF8EB] p-4">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-[#005461]" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-[#1A1A1A]">Complete Your Initial Profile Setup</p>
            <p className="text-xs text-[#666666]">
              Welcome to AutoGrade! Please verify your university, upload a profile picture, and fill in your academic details below to complete your profile setup.
            </p>
          </div>
        </div>
      )}

      {/* Profile Picture Card */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 rounded-full border-2 border-[#005461] bg-[#005461]/10 overflow-hidden flex items-center justify-center shrink-0">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt={user.fullName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-[#005461]">
                  {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[#1A1A1A]">{user.fullName}</h3>
                <Badge variant="info">{user.role.toUpperCase()}</Badge>
              </div>
              <p className="text-sm text-[#666666]">{user.email}</p>
              <p className="text-xs text-[#888888] mt-0.5">
                {user.university || 'COMSATS University Islamabad, Wah Campus'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePictureUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploadingPicture}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Camera size={16} />
              <span>{profilePicture ? 'Change Picture' : 'Upload Picture'}</span>
            </Button>
            {profilePicture && (
              <Button
                type="button"
                variant="danger"
                loading={uploadingPicture}
                onClick={handleRemovePicture}
                className="flex items-center gap-1.5"
              >
                <Trash2 size={15} />
                <span>Remove</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Profile Information Form */}
      <Card className="space-y-5">
        <div className="flex items-center gap-2 border-b border-[#E8DCC8] pb-3">
          <UserCircle2 size={19} className="text-[#005461]" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">Profile Information</h3>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cuiwah.edu.pk"
              required
            />

            <Input
              label="University Name"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              placeholder="COMSATS University Islamabad, Wah Campus"
              required
            />

            {user.role === 'student' && (
              <Input
                label="Registration / Roll Number"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="e.g. FA22-BCS-047"
              />
            )}

            {user.role === 'teacher' && (
              <>
                <Input
                  label="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92..."
                />
                <Input
                  label="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                />
                <Input
                  label="Highest Qualification"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. MS / PhD Computer Science"
                />
              </>
            )}
          </div>

          {user.role === 'teacher' && (
            <div className="rounded-lg bg-[#FAF7F2] border border-[#E8DCC8] p-3 text-xs text-[#666666]">
              <span className="font-semibold text-[#1A1A1A]">Assigned Subjects: </span>
              {(user.assignedSubjects || []).length > 0
                ? user.assignedSubjects?.join(', ')
                : 'No subjects assigned yet by Administrator'}
            </div>
          )}

          {profileError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {profileError}
            </p>
          )}

          {profileMessage && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <CheckCircle2 size={17} />
              <span>{profileMessage}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={savingProfile}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* Change Password Card */}
      <Card className="space-y-5">
        <div className="flex items-center gap-2 border-b border-[#E8DCC8] pb-3">
          <KeyRound size={19} className="text-[#005461]" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">Change Password</h3>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
            required
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase & 1 special char"
              required
            />

            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
            />
          </div>

          <PasswordStrengthMeter password={newPassword} />

          {passwordError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {passwordError}
            </p>
          )}

          {passwordMessage && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <CheckCircle2 size={17} />
              <span>{passwordMessage}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={savingPassword}>
              Update Password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
