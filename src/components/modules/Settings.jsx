import { useState } from 'react';
import { Save, Sparkles, Trash2, Bell, UserCog, ShieldAlert, KeyRound, GraduationCap, Palette, Bot, Database, LogOut, RefreshCw, CloudUpload, Lock } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitBadge } from '../orbit/Orbit.jsx';
import { validateProfile } from '../../lib/validate.js';
import { NOTIFICATION_TYPES } from '../../lib/constants.js';
import { deleteAllAcademicData } from '../../lib/db.js';
import { fmtDate, fmtTime12 } from '../../lib/datetime.js';

export default function Settings() {
  const { data, profile, settings, saveProfile, saveSettings, seedDemo, clearDemo, supabaseEnabled, session, signOut, syncAttendanceNow, flash } = useApp();
  const [f, setF] = useState({
    full_name: profile?.full_name || '', college: profile?.college || '', program: profile?.program || '',
    branch: profile?.branch || '', academic_year: profile?.academic_year || '', batch_year: profile?.batch_year || '',
    semester: profile?.semester || '', roll_number: profile?.roll_number || '',
  });
  const [errors, setErrors] = useState({});
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const saveP = async () => {
    const { ok, errors: e } = validateProfile(f);
    setErrors(e);
    if (!ok) return;
    await saveProfile(f);
  };

  const toggleType = (t) => {
    const cur = settings?.enabled_types ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    saveSettings({ enabled_types: next });
  };

  // Count demo rows directly from loaded data (the previous version
  // referenced an out-of-scope `data` variable here).
  const demoCount = [
    ['subjects', data?.subjects], ['classes', data?.schedule], ['events', data?.events],
    ['tests', data?.tests], ['assignments', data?.assignments], ['attendance', data?.attendance],
    ['sessions', data?.sessions], ['goals', data?.goals], ['resources', data?.resources],
  ].map(([k, v]) => [k, (v ?? []).filter((r) => r.is_demo).length]).filter(([, n]) => n > 0);

  const hasDemo = demoCount.length > 0;

  const syncLogs = data?.syncLogs ?? [];
  const lastLog = syncLogs[0] ?? null;
  const lastGood = syncLogs.find((l) => l.status !== 'FAILED');
  const attendanceRecords = data?.attendance ?? [];
  const excelCount = attendanceRecords.filter((r) => r.source === 'excel_sync').length;

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await syncAttendanceNow();
      const s = res?.summary ?? {};
      flash(`Attendance synced. New: ${s.inserted ?? 0} · Updated: ${s.updated ?? 0} · Unchanged: ${s.skipped ?? 0}`);
    } catch (e) {
      flash(e?.message || 'Sync failed. Existing attendance data has been preserved.');
    } finally {
      setSyncing(false);
    }
  };

  const enabledTypes = settings?.enabled_types ?? [];

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader kicker="SETTINGS" title="Settings" sub="Profile, reminders and your data." />

      {/* ---- Profile ---- */}
      <OrbitCard>
        <SectionHead icon={UserCog} tone="blue" title="Profile" sub="How Orbit addresses you." />
        <div className="p-4 md:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Field label="Full name *" error={errors.full_name}>
              <input className="or-input w-full px-3 py-2 text-sm" value={f.full_name} onChange={set('full_name')} />
            </Field>
            <Field label="College / University">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.college} onChange={set('college')} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <OrbitButton onClick={saveP}><Save className="w-4 h-4" strokeWidth={2.3} /> Save profile</OrbitButton>
            <p className="text-[11.5px] font-semibold text-orbit-text-mute flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" strokeWidth={2.4} /> {supabaseEnabled ? 'Signed in via Supabase Auth' : 'Not connected'}
              {session?.user?.email ? ` · ${session.user.email}` : ''}
            </p>
          </div>
        </div>
      </OrbitCard>

      {/* ---- Academic information ---- */}
      <OrbitCard>
        <SectionHead icon={GraduationCap} tone="purple" title="Academic information" sub="Shown on your dashboard and used by Orbit AI." />
        <div className="p-4 md:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Field label="Course / Program">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.program} onChange={set('program')} />
            </Field>
            <Field label="Branch / Specialization">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.branch} onChange={set('branch')} />
            </Field>
            <Field label="Academic year">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.academic_year} onChange={set('academic_year')} />
            </Field>
            <Field label="Batch / Year">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.batch_year} onChange={set('batch_year')} />
            </Field>
            <Field label="Current semester">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.semester} onChange={set('semester')} />
            </Field>
            <Field label="Student ID / Roll number">
              <input className="or-input w-full px-3 py-2 text-sm" value={f.roll_number} onChange={set('roll_number')} />
            </Field>
          </div>
        </div>
      </OrbitCard>

      {/* ---- Notifications ---- */}
      <OrbitCard>
        <SectionHead icon={Bell} tone="orange" title="Notifications" sub="Which reminders Orbit raises, and how early." />
        <div className="p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Remind me this many days ahead">
              <input type="number" min="1" max="60" className="or-input w-full px-3 py-2 text-sm"
                defaultValue={settings?.days_ahead ?? 7}
                onBlur={(e) => saveSettings({ days_ahead: Math.max(1, Math.min(60, Number(e.target.value) || 7)) })} />
            </Field>
            <Field label="Low attendance warning threshold %">
              <input type="number" min="0" max="100" className="or-input w-full px-3 py-2 text-sm"
                defaultValue={settings?.attendance_threshold ?? 75}
                onBlur={(e) => saveSettings({ attendance_threshold: Math.max(0, Math.min(100, Number(e.target.value) || 75)) })} />
            </Field>
          </div>
          <div>
            <p className="or-label">Enabled reminder types</p>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TYPES.map((t) => {
                const on = enabledTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-200 ${on ? 'bg-orbit-purple text-white' : 'bg-orbit-bg text-orbit-text-mute hover:bg-orbit-border'}`}
                  >
                    {on ? '✓ ' : ''}{t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </OrbitCard>

      {/* ---- Appearance ---- */}
      <OrbitCard>
        <SectionHead icon={Palette} tone="lavender" title="Appearance" sub="How Orbit looks on this device." />
        <div className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <OrbitBadge tone="purple">Orbit Dark</OrbitBadge>
            <span className="text-[12.5px] text-orbit-text-soft">
              Orbit uses a single refined dark academic theme with the sidebar in Orbit dark. Soft rounded surfaces, subtle purple borders and luminous accents are applied across every module.
            </span>
          </div>
        </div>
      </OrbitCard>

      {/* ---- AI ---- */}
      <OrbitCard>
        <SectionHead icon={Bot} tone="purple" title="AI settings" sub="Orbit AI runs on your own connected backend." />
        <div className="p-4 md:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <OrbitBadge tone={supabaseEnabled ? 'green' : 'orange'}>{supabaseEnabled ? 'Backend connected' : 'Backend not configured'}</OrbitBadge>
            <span className="text-[12.5px] text-orbit-text-soft">
              Orbit AI answers using your subjects, timetable, tests, assignments and attendance. Nothing leaves your account, and the model is chosen server-side.
            </span>
          </div>
          <p className="text-[12px] text-orbit-text-mute leading-relaxed">
            Ask Orbit AI from the sidebar at any time. Event import from a URL also uses this backend — both are read-only until you confirm a change.
          </p>
        </div>
      </OrbitCard>

      {/* ---- Data & sync ---- */}
      <OrbitCard>
        <SectionHead icon={Database} tone="green" title="Data & sync" sub="Where your academic records live." />
        <div className="p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Records', value: attendanceRecords.length },
              { label: 'From Excel', value: excelCount },
              { label: 'Subjects', value: (data?.subjects ?? []).length },
              { label: 'Tests', value: (data?.tests ?? []).length },
            ].map((s) => (
              <div key={s.label} className="or-inset px-3 py-2.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-orbit-text-mute">{s.label}</p>
                <p className="text-[19px] font-extrabold text-orbit-text leading-none mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="or-inset p-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-orbit-text-soft">
              <CloudUpload className="w-3.5 h-3.5" strokeWidth={2.3} style={{ color: '#34d399' }} />
              Attendance source: Excel (BST Section A sheet)
            </span>
            <OrbitBadge tone="neutral">
              Last successful sync: {lastGood ? `${fmtDate(lastGood.completed_at ?? lastGood.started_at)} · ${fmtTime12(String(lastGood.completed_at ?? lastGood.started_at).slice(11, 19))}` : 'never'}
            </OrbitBadge>
            {lastLog?.status === 'FAILED' && <OrbitBadge tone="coral">Last sync failed — data preserved</OrbitBadge>}
            <OrbitButton size="sm" variant="outline" className="ml-auto" onClick={runSync} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5${syncing ? ' animate-spin' : ''}`} strokeWidth={2.4} /> {syncing ? 'Syncing…' : 'Sync Now'}
            </OrbitButton>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[12px] font-semibold text-orbit-text-mute leading-relaxed">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2.4} />
            Attendance is read-only. You can view, sync and export it, but it is never created, edited or deleted in Orbit — the connected Excel sheet is the only source, and the database itself rejects any other write.
          </p>
        </div>
      </OrbitCard>

      {/* ---- Demo data ---- */}
      <OrbitCard>
        <SectionHead icon={Sparkles} tone="yellow" title="Demo data" sub="Sample rows, clearly separated from your real records." />
        <div className="p-4 md:p-5">
          {hasDemo ? (
            <div>
              <p className="text-[13px] text-orbit-text-soft mb-3 leading-relaxed">
                Demo rows currently present: {demoCount.map(([k, n]) => `${n} ${k}`).join(', ')}. Demo data is tagged and never mixes with real records.
              </p>
              <OrbitButton variant="danger-solid" onClick={clearDemo} disabled={busy}>
                <Trash2 className="w-4 h-4" strokeWidth={2.2} /> Clear all demo data
              </OrbitButton>
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-orbit-text-soft mb-3 leading-relaxed">
                Load a full sample semester (4 subjects, a weekly timetable, 8 tests, assignments, sessions, goals). Dates are generated relative to today so the dashboard is alive. Clear it anytime. Attendance is never part of the sample — that comes only from your Excel sheet.
              </p>
              <OrbitButton variant="outline" onClick={seedDemo} disabled={busy}>
                <Sparkles className="w-4 h-4" strokeWidth={2.2} /> Load demo semester
              </OrbitButton>
            </div>
          )}
        </div>
      </OrbitCard>

      {/* ---- Account ---- */}
      <OrbitCard>
        <SectionHead icon={LogOut} tone="neutral" title="Account" sub="Your session and your data ownership." />
        <div className="p-4 md:p-5 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-orbit-text-soft flex-1 min-w-[200px]">
            Signed in as <b className="text-orbit-text">{profile?.full_name || session?.user?.email || 'student'}</b>. Your academic data stays linked to this account.
          </p>
          <OrbitButton variant="outline" onClick={signOut}><LogOut className="w-4 h-4" strokeWidth={2.2} /> Sign out</OrbitButton>
        </div>
      </OrbitCard>

      {/* ---- Danger zone ---- */}
      <OrbitCard style={{ borderColor: '#4338ca' }}>
        <SectionHead icon={ShieldAlert} tone="coral" title="Danger zone" sub="These actions cannot be undone." />
        <div className="p-4 md:p-5">
          <p className="text-[13px] text-orbit-text-soft mb-3 leading-relaxed">Permanently delete <b>all</b> academic data in this account (subjects, tests, attendance, everything). Your login and profile stay.</p>
          <OrbitButton variant="danger-solid" onClick={() => setConfirmWipe(true)}>
            <Trash2 className="w-4 h-4" strokeWidth={2.2} /> Delete all academic data
          </OrbitButton>
        </div>
      </OrbitCard>

      {confirmWipe && (
        <ConfirmDialog
          title="Delete everything?"
          message="All academic data in this account will be permanently deleted. Your login and profile stay. This cannot be undone."
          confirmLabel="Delete everything"
          onConfirm={async () => { await deleteAllAcademicData(); window.location.reload(); }}
          onClose={() => setConfirmWipe(false)}
        />
      )}
    </div>
  );
}

function SectionHead({ icon: Icon, tone, title, sub }) {
  return (
    <div className="or-card-head">
      <span className={`or-icon-chip or-icon-chip-sm or-tone-${tone}`}>
        <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <h2 className="font-bold text-[15px] text-orbit-text leading-tight">{title}</h2>
        {sub && <p className="text-[12px] text-orbit-text-mute mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
