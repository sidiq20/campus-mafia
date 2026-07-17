"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { apiFetch, clearToken } from '@/lib/api';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Lock,
  Palette,
  ShieldAlert,
  Save,

  X,
  Eye,
  EyeOff,
  Trash2,
  LogOut,
  Key,
  Mail,
  BookOpen,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function SettingsPage() {
  const { user, isLoading, refetch } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Profile tab
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  // Security tab
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // UI state
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [activeSection, setActiveSection] = useState('profile');

  // Initialise form fields when user loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setBio(user.bio || '');
    }
  }, [user]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center bg-[#050505] text-green-500 animate-pulse">
          Loading settings...
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleSaveProfile = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      toast.error('Display name cannot be empty');
      return;
    }
    setSavingProfile(true);
    try {
      const body: Record<string, string> = {};
      if (trimmedName !== user.display_name) body.display_name = trimmedName;
      if (bio !== (user.bio || '')) body.bio = bio;

      if (Object.keys(body).length === 0) {
        toast.info('No changes to save');
        setSavingProfile(false);
        return;
      }

      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update profile');

      toast.success('Profile updated successfully');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => 'Failed to change password');
        throw new Error(err);
      }

      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm deletion');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: deletePassword }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Incorrect password');
        setDeleteError(errText);
        setDeleting(false);
        return;
      }
      clearToken();
      queryClient.clear();
      window.location.href = '/';
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    queryClient.clear();
    window.location.href = '/login';
  };

  const sections = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: Palette },
    { id: 'account', label: 'Account', icon: ShieldAlert },
  ];

  return (
    <DashboardLayout>
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 flex items-center gap-3 px-4 sm:px-6 bg-black/80 backdrop-blur-md sticky top-0 z-10">
        <Link href="/profile" className="text-zinc-500 hover:text-white transition-colors p-1 -ml-1">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-sm font-bold text-zinc-200">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto bg-[#050505]">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-0 md:gap-6 p-4 sm:p-6 pb-24">
          {/* Sidebar Navigation */}
          <nav className="md:w-48 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                    activeSection === s.id
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 border border-transparent'
                  }`}
                >
                  <Icon size={14} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 mt-4 md:mt-0">
            {/* ─── Profile Section ─── */}
            {activeSection === 'profile' && (
              <div className="space-y-6 animate-fade-in">
                <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <User size={14} className="text-green-500" />
                    Profile Information
                  </h2>
                  <p className="text-[10px] text-zinc-600 mb-6">Update your display name and bio</p>

                  <div className="space-y-5">
                    {/* Display Name */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600 transition-colors"
                        placeholder="Your display name"
                        maxLength={50}
                      />
                    </div>

                    {/* Username (read-only) */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        Username
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={`@${user.username}`}
                          disabled
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-500 outline-none cursor-not-allowed"
                        />
                        <Link
                          href="/profile"
                          className="text-[10px] font-bold text-green-600 hover:text-green-400 uppercase tracking-widest transition-colors shrink-0"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>

                    {/* Bio */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        <BookOpen size={10} className="inline mr-1" />
                        Bio
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600 transition-colors resize-none"
                        rows={3}
                        placeholder="Tell other operatives about yourself..."
                        maxLength={500}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="text-[8px] text-zinc-600">{bio.length}/500</span>
                      </div>
                    </div>

                    {/* Email (read-only) */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        <Mail size={10} className="inline mr-1" />
                        Email
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={user.email}
                          disabled
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-500 outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-2 border-t border-zinc-800/50">
                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {savingProfile ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                          </span>
                        ) : (
                          <>
                            <Save size={14} />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Security Section ─── */}
            {activeSection === 'security' && (
              <div className="space-y-6 animate-fade-in">
                <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Key size={14} className="text-green-500" />
                    Change Password
                  </h2>
                  <p className="text-[10px] text-zinc-600 mb-6">Update your account password</p>

                  <div className="space-y-5">
                    {/* Current Password */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 pr-10 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600 transition-colors"
                          placeholder="Enter current password"
                        />
                        <button
                          onClick={() => setShowPasswords(!showPasswords)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                        >
                          {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* New Password */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        New Password
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-500/50 text-zinc-200 placeholder-zinc-600 transition-colors"
                        placeholder="At least 6 characters"
                      />
                    </div>

                    {/* Confirm New Password */}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5 block">
                        Confirm New Password
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full bg-black border rounded-lg px-4 py-2.5 text-sm outline-none transition-colors placeholder-zinc-600 ${
                          confirmPassword && newPassword !== confirmPassword
                            ? 'border-red-500/50 text-red-400 focus:border-red-500'
                            : 'border-zinc-800 text-zinc-200 focus:border-green-500/50'
                        }`}
                        placeholder="Re-enter new password"
                      />
                      {confirmPassword && newPassword !== confirmPassword && (
                        <p className="text-[9px] text-red-400 mt-1">Passwords do not match</p>
                      )}
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-2 border-t border-zinc-800/50">
                      <button
                        onClick={handleChangePassword}
                        disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
                        className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {savingPassword ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Changing...
                          </span>
                        ) : (
                          <>
                            <Lock size={14} />
                            Change Password
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Preferences Section ─── */}
            {activeSection === 'preferences' && (
              <div className="space-y-6 animate-fade-in">
                <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Palette size={14} className="text-green-500" />
                    Accent Theme
                  </h2>
                  <p className="text-[10px] text-zinc-600 mb-6">Choose your interface accent color</p>

                  <InlineThemePicker />

                  <p className="text-[9px] text-zinc-600 mt-4 text-center">
                    The theme is saved to your browser and persists across sessions
                  </p>
                </div>

                <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Bell size={14} className="text-green-500" />
                    Notifications
                  </h2>
                  <p className="text-[10px] text-zinc-600 mb-6">Push notification preferences</p>

                  <div className="bg-black/40 border border-zinc-800 rounded-lg p-5">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Push notifications are enabled when you install the app to your home screen.
                      After installing, your browser will ask for notification permission —
                      tap <span className="text-green-500 font-bold">Allow</span> to receive
                      real-time alerts for DMs and mentions.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-green-500/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Notifications status: <span className="font-bold">Active</span> (managed by browser)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Account Section ─── */}
            {activeSection === 'account' && (
              <div className="space-y-6 animate-fade-in">
                <div className="border border-zinc-800 bg-zinc-900/30 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <LogOut size={14} className="text-green-500" />
                    Session
                  </h2>
                  <p className="text-[10px] text-zinc-600 mb-6">Log out of your account</p>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    <LogOut size={14} />
                    Disconnect & Log Out
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="border border-red-500/20 bg-red-950/5 p-6 rounded-xl">
                  <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <ShieldAlert size={14} />
                    Danger Zone
                  </h2>
                  <p className="text-[10px] text-red-400/60 mb-6">
                    Irreversible actions — proceed with caution
                  </p>

                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-500/40 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                    >
                      <Trash2 size={14} />
                      Delete Account
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-red-950/20 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-red-300 font-bold">
                        Are you absolutely sure? This will permanently delete your account and all associated data.
                      </p>
                      <p className="text-[9px] text-red-400/60">
                        All posts, comments, messages, faction memberships, and reputation will be lost.
                      </p>
                      {/* Password confirmation */}
                      <div>
                        <label className="text-[9px] text-red-400 uppercase tracking-widest font-bold mb-1.5 block">
                          Enter your password to confirm
                        </label>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => {
                            setDeletePassword(e.target.value);
                            setDeleteError('');
                          }}
                          className={`w-full bg-black border rounded-lg px-4 py-2.5 text-sm outline-none transition-colors ${
                            deleteError
                              ? 'border-red-500/50 text-red-400 focus:border-red-500'
                              : 'border-zinc-800 text-zinc-200 focus:border-red-500/50'
                          }`}
                          placeholder="Enter your current password"
                        />
                        {deleteError && (
                          <p className="text-[9px] text-red-400 mt-1">{deleteError}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setConfirmDelete(false);
                            setDeletePassword('');
                            setDeleteError('');
                          }}
                          className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all"
                        >
                          <X size={14} className="inline mr-1" />
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting || !deletePassword}
                          className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed"
                        >
                          {deleting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Deleting...
                            </span>
                          ) : (
                            <>
                              <Trash2 size={14} className="inline mr-1" />
                              Permanently Delete
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Inline Theme Picker ───

const THEMES = [
  { name: 'Hacker Green', color: '#22c55e', key: 'green' },
  { name: 'Cyber Red', color: '#ef4444', key: 'red' },
  { name: 'Neon Purple', color: '#a855f7', key: 'purple' },
  { name: 'Electric Blue', color: '#3b82f6', key: 'blue' },
  { name: 'Toxic Cyan', color: '#06b6d4', key: 'cyan' },
  { name: 'Amber', color: '#f59e0b', key: 'amber' },
];

const THEME_VARS: Record<string, Record<string, string>> = {
  green: {
    '--color-green-50': '#f0fdf4', '--color-green-100': '#dcfce7', '--color-green-200': '#bbf7d0',
    '--color-green-300': '#86efac', '--color-green-400': '#4ade80', '--color-green-500': '#22c55e',
    '--color-green-600': '#16a34a', '--color-green-700': '#15803d', '--color-green-800': '#166534',
    '--color-green-900': '#14532d', '--color-green-950': '#052e16',
  },
  red: {
    '--color-green-50': '#fef2f2', '--color-green-100': '#fee2e2', '--color-green-200': '#fecaca',
    '--color-green-300': '#fca5a5', '--color-green-400': '#f87171', '--color-green-500': '#ef4444',
    '--color-green-600': '#dc2626', '--color-green-700': '#b91c1c', '--color-green-800': '#991b1b',
    '--color-green-900': '#7f1d1d', '--color-green-950': '#450a0a',
  },
  purple: {
    '--color-green-50': '#faf5ff', '--color-green-100': '#f3e8ff', '--color-green-200': '#e9d5ff',
    '--color-green-300': '#d8b4fe', '--color-green-400': '#c084fc', '--color-green-500': '#a855f7',
    '--color-green-600': '#9333ea', '--color-green-700': '#7e22ce', '--color-green-800': '#6b21a8',
    '--color-green-900': '#581c87', '--color-green-950': '#3b0764',
  },
  blue: {
    '--color-green-50': '#eff6ff', '--color-green-100': '#dbeafe', '--color-green-200': '#bfdbfe',
    '--color-green-300': '#93c5fd', '--color-green-400': '#60a5fa', '--color-green-500': '#3b82f6',
    '--color-green-600': '#2563eb', '--color-green-700': '#1d4ed8', '--color-green-800': '#1e40af',
    '--color-green-900': '#1e3a8a', '--color-green-950': '#172554',
  },
  cyan: {
    '--color-green-50': '#ecfeff', '--color-green-100': '#cffafe', '--color-green-200': '#a5f3fc',
    '--color-green-300': '#67e8f9', '--color-green-400': '#22d3ee', '--color-green-500': '#06b6d4',
    '--color-green-600': '#0891b2', '--color-green-700': '#0e7490', '--color-green-800': '#155e75',
    '--color-green-900': '#164e63', '--color-green-950': '#083344',
  },
  amber: {
    '--color-green-50': '#fffbeb', '--color-green-100': '#fef3c7', '--color-green-200': '#fde68a',
    '--color-green-300': '#fcd34d', '--color-green-400': '#fbbf24', '--color-green-500': '#f59e0b',
    '--color-green-600': '#d97706', '--color-green-700': '#b45309', '--color-green-800': '#92400e',
    '--color-green-900': '#78350f', '--color-green-950': '#451a03',
  },
};

function InlineThemePicker() {
  const [accent, setAccent] = useState('green');

  useEffect(() => {
    const saved = localStorage.getItem('accent-theme');
    const initial = saved && THEMES.some((t) => t.key === saved) ? saved : 'green';
    setAccent(initial);
    applyThemeVars(initial);
  }, []);

  const handleSelect = (key: string) => {
    setAccent(key);
    applyThemeVars(key);
    localStorage.setItem('accent-theme', key);
  };

  return (
    <div className="bg-black/40 border border-zinc-800 rounded-lg p-6">
      <div className="flex flex-wrap justify-center gap-4">
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => handleSelect(t.key)}
            className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl border-2 transition-all duration-200 ${
              accent === t.key
                ? 'border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                : 'border-transparent hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]'
            }`}
            style={{ backgroundColor: t.color }}
            title={t.name}
          >
            {accent === t.key && (
              <CheckCircle2
                size={18}
                className="absolute -top-2 -right-2 text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.5)]"
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mt-4">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: THEMES.find((t) => t.key === accent)?.color }}
        />
        <span className="text-xs font-bold text-zinc-400">
          {THEMES.find((t) => t.key === accent)?.name}
        </span>
      </div>
    </div>
  );
}

function applyThemeVars(key: string) {
  const vars = THEME_VARS[key];
  if (!vars) return;
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
}
