import { useState } from 'react';
import { CalendarDays, Plus, Trash2, ArrowRight, Check, Sparkles, GraduationCap, Import } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { DAYS } from '../lib/constants.js';
import { Field } from './ui.jsx';
import { validateSubject, validateProfile } from '../lib/validate.js';
import { BST_SUBJECTS, BST_SCHEDULE, buildCalendarRows } from '../website/seedData.js';

export default function Onboarding() {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center mb-8">
          <p className="or-kicker text-orbit-text-mute">GET SET UP</p>
          <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-tight text-orbit-text mt-1.5">
            {['Tell us about you', 'Add your subjects', 'Add your weekly classes'][step]}
          </h1>
          <div className="flex justify-center gap-2 mt-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-10 rounded-full transition-all duration-200"
                style={{ background: i <= step ? 'var(--or-purple)' : 'var(--or-border)' }}
              />
            ))}
          </div>
        </div>

        {step === 0 && <StepProfile onDone={() => setStep(1)} />}
        {step === 1 && <StepSubjects onBack={() => setStep(0)} onDone={() => setStep(2)} />}
        {step === 2 && <StepSchedule onBack={() => setStep(1)} />}
      </div>
    </div>
  );
}

function StepProfile({ onDone }) {
  const { profile, saveProfile, seedDemo, loading } = useApp();
  const [f, setF] = useState({
    full_name: profile?.full_name || '', college: profile?.college || '', program: profile?.program || '',
    branch: profile?.branch || '', academic_year: profile?.academic_year || '', batch_year: profile?.batch_year || '',
    semester: profile?.semester || '', roll_number: profile?.roll_number || '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (skipped) => {
    if (!skipped) {
      const { ok, errors: e } = validateProfile(f);
      setErrors(e);
      if (!ok) return;
    }
    setBusy(true);
    try {
      await saveProfile(skipped ? { ...f, onboarded: true } : { ...f, onboarded: true });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="or-card p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <Field label="Full name *" error={errors.full_name}>
          <input className="or-input w-full px-3 py-2 text-sm" value={f.full_name} onChange={set('full_name')} placeholder="Ada Lovelace" />
        </Field>
        <Field label="College / University">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.college} onChange={set('college')} placeholder="Gateways Institute of Technology" />
        </Field>
        <Field label="Course / Program">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.program} onChange={set('program')} placeholder="B.Tech" />
        </Field>
        <Field label="Branch / Specialization">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.branch} onChange={set('branch')} placeholder="Computer Science" />
        </Field>
        <Field label="Academic year">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.academic_year} onChange={set('academic_year')} placeholder="2026-27" />
        </Field>
        <Field label="Batch / Year">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.batch_year} onChange={set('batch_year')} placeholder="2026" />
        </Field>
        <Field label="Current semester">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.semester} onChange={set('semester')} placeholder="Semester 3" />
        </Field>
        <Field label="Student ID / Roll number">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.roll_number} onChange={set('roll_number')} placeholder="22CS042" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button disabled={busy || loading} onClick={() => submit(false)} className="or-btn or-btn-primary px-5 py-3 text-sm">
          Save & continue <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
        </button>
        <button disabled={busy || loading} onClick={() => submit(true)} className="or-btn px-4 py-3 text-sm">Skip for now</button>
        <button
          disabled={busy || loading}
          onClick={async () => { await saveProfile({ onboarded: true }); await seedDemo(); }}
          className="or-btn or-btn-soft px-4 py-3 text-sm ml-auto"
          title="Loads a full sample semester so you can explore"
        >
          <Sparkles className="w-4 h-4" strokeWidth={2.5} /> Explore with demo data
        </button>
      </div>
    </div>
  );
}

function StepSubjects({ onBack, onDone }) {
  const { insertRow } = useApp();
  const [subjects, setSubjects] = useState([
    { name: '', code: '', faculty: '', credits: 4, target_percentage: 85, attendance_required_pct: 75 },
  ]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // One click: create every BST Section A subject from the real timetable.
  const seedBSTSubjects = async () => {
    setBusy(true);
    try {
      for (const s of BST_SUBJECTS) {
        await insertRow('subjects', {
          name: s.name, code: s.code, faculty: '', credits: Number(s.credits),
          target_percentage: Number(s.target_percentage),
          attendance_required_pct: Number(s.attendance_required_pct),
          semester: s.semester || '', color: s.color,
        });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const setRow = (i, k) => (e) => setSubjects((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)));

  const addRow = () => setSubjects((p) => [...p, { name: '', code: '', faculty: '', credits: 4, target_percentage: 85, attendance_required_pct: 75 }]);

  const removeRow = (i) => setSubjects((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const submit = async (skipped) => {
    if (skipped) { onDone(); return; }
    const e = {};
    subjects.forEach((s, i) => {
      const { ok, errors: rowErrors } = validateSubject(s);
      if (!ok) e[i] = rowErrors;
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      for (const s of subjects) {
        await insertRow('subjects', { ...s, credits: Number(s.credits), target_percentage: Number(s.target_percentage), attendance_required_pct: Number(s.attendance_required_pct), semester: '' });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="or-card p-6">
      <p className="text-sm text-orbit-text-soft mb-4">Every module (tests, attendance, assignments…) picks subjects from this list. Add the ones you are enrolled in this semester.</p>
      {subjects.map((s, i) => (
        <div key={i} className="or-inset p-3 mb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Field label={`Subject ${i + 1} name *`} error={errors[i]?.name}>
                <input className="or-input w-full px-3 py-2 text-sm" value={s.name} onChange={setRow(i, 'name')} placeholder="Java Programming" />
              </Field>
            </div>
            <Field label="Code" error={errors[i]?.code}>
              <input className="or-input w-full px-3 py-2 text-sm" value={s.code} onChange={setRow(i, 'code')} placeholder="CS201" />
            </Field>
            <Field label="Faculty" error={errors[i]?.faculty}>
              <input className="or-input w-full px-3 py-2 text-sm" value={s.faculty} onChange={setRow(i, 'faculty')} placeholder="Dr. Rao" />
            </Field>
            <Field label="Credits" error={errors[i]?.credits}>
              <input type="number" min="0" className="or-input w-full px-3 py-2 text-sm" value={s.credits} onChange={setRow(i, 'credits')} />
            </Field>
            <Field label="Target %" error={errors[i]?.target_percentage}>
              <input type="number" min="0" max="100" className="or-input w-full px-3 py-2 text-sm" value={s.target_percentage} onChange={setRow(i, 'target_percentage')} />
            </Field>
            <Field label="Attendance req. %" error={errors[i]?.attendance_required_pct}>
              <input type="number" min="0" max="100" className="or-input w-full px-3 py-2 text-sm" value={s.attendance_required_pct} onChange={setRow(i, 'attendance_required_pct')} />
            </Field>
            <div className="flex items-end">
              <button onClick={() => removeRow(i)} className="or-btn or-btn-ghost p-2 mb-0.5" title="Remove row" disabled={subjects.length === 1}>
                <Trash2 className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addRow} className="or-btn px-3 py-2 text-xs"><Plus className="w-3.5 h-3.5" /> Add another</button>
        <button
          disabled={busy}
          onClick={seedBSTSubjects}
          className="or-btn or-btn-soft px-4 py-2 text-xs"
          title="Creates all 10 BST Section A subjects from the real timetable"
        >
          <Sparkles className="w-3.5 h-3.5" /> Load BST Section A subjects
        </button>
        <div className="flex-1" />
        <button onClick={onBack} className="or-btn px-4 py-2.5 text-sm">Back</button>
        <button disabled={busy} onClick={() => submit(true)} className="or-btn px-4 py-2.5 text-sm">Skip for now</button>
        <button disabled={busy} onClick={() => submit(false)} className="or-btn or-btn-primary px-5 py-2.5 text-sm">
          Save subjects <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StepSchedule({ onBack }) {
  const { data, insertRow, insertMany, seedAllReal } = useApp();
  const subjects = data?.subjects ?? [];
  const [slots, setSlots] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const addRow = () => setSlots((p) => [...p, { subject_id: '', day_of_week: 1, start_time: '09:00', end_time: '10:00', room: '', notes: '' }]);
  const setRow = (i, k) => (e) => setSlots((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)));
  const removeRow = (i) => setSlots((p) => p.filter((_, idx) => idx !== i));

  // One click: insert the real BST Section A weekly timetable. Subjects
  // already in the list are matched by name (with the same alias rules as
  // the seed); missing ones are created first so the button works
  // standalone.
  const seedBSTTimetable = async () => {
    if ((data?.schedule ?? []).length > 0 &&
      !window.confirm(`Your schedule already has ${data.schedule.length} classes. Add the BST Section A timetable anyway?`)) return;
    setSeeding(true);
    setBusy(true);
    try {
      const ALIAS = { 'Club Activities / Doubt Session': 'Club Activities', Mentorship: 'Mentorship / Doubt Session' };
      const byName = new Map(subjects.map((s) => [s.name, s.id]));
      const created = new Map(); // name → id, for subjects made in this run
      const idFor = async (name, meta) => {
        if (byName.has(name)) return byName.get(name);
        if (ALIAS[name] && byName.has(ALIAS[name])) return byName.get(ALIAS[name]);
        if (created.has(name)) return created.get(name);
        const row = await insertRow('subjects', {
          name, code: meta?.code || '', faculty: '', credits: Number(meta?.credits || 2),
          target_percentage: 85, attendance_required_pct: 75,
          semester: meta?.semester || '', color: meta?.color || '#a78bfa',
        });
        created.set(name, row.id);
        return row.id;
      };
      const metaByName = new Map(BST_SUBJECTS.map((s) => [s.name, s]));
      for (const c of BST_SCHEDULE) {
        const subject_id = await idFor(c.subject, metaByName.get(c.subject));
        await insertRow('class_schedule', {
          subject_id, room: c.room, day_of_week: c.day,
          start_time: c.start_time, end_time: c.end_time,
          semester: 'Semester 1', academic_year: '2026-27', notes: c.kind,
        });
      }
    } finally {
      setSeeding(false);
      setBusy(false);
    }
  };

  // One click: import the S-VYASA 2026–27 academic calendar.
  const seedCalendar = async () => {
    if ((data?.events ?? []).length > 0 &&
      !window.confirm(`You already have ${data.events.length} calendar events. Import the 2026–27 academic calendar anyway?`)) return;
    setSeeding(true);
    try {
      await insertMany('academic_events', buildCalendarRows());
    } finally {
      setSeeding(false);
    }
  };

  const finish = async () => {
    const e = {};
    slots.forEach((s, i) => {
      if (!s.subject_id) e[i] = { ...e[i], subject_id: 'Pick a subject.' };
      if (s.end_time <= s.start_time) e[i] = { ...e[i], end_time: 'Must end after start.' };
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      // Always ensure the REAL BST Section A data exists before finishing:
      // server-side, user-scoped and idempotent (subjects + timetable +
      // official 2026–27 calendar). Manual slots below are added on top.
      await seedAllReal();
      for (const s of slots) {
        await insertRow('class_schedule', { ...s, subject_id: Number(s.subject_id), day_of_week: Number(s.day_of_week) });
      }
      window.location.reload(); // lands on dashboard
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="or-card p-6">
      <p className="text-sm text-orbit-text-soft mb-4">Add recurring weekly classes. You can edit everything later in the Schedule module.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          disabled={busy || seeding}
          onClick={seedBSTTimetable}
          className="or-btn or-btn-soft px-4 py-2 text-xs"
          title="Inserts all 22 BST Section A slots (Mon–Fri) with exact subjects, codes and timings"
        >
          <GraduationCap className="w-3.5 h-3.5" /> {seeding ? 'Loading timetable…' : 'Load BST Section A timetable'}
        </button>
        <button
          disabled={busy || seeding}
          onClick={seedCalendar}
          className="or-btn px-4 py-2 text-xs"
          title="Imports the full S-VYASA 2026–27 academic calendar (holidays, IAs, exams)"
        >
          <Import className="w-3.5 h-3.5" /> Import 2026–27 academic calendar
        </button>
      </div>
      {!subjects.length && (
        <p className="or-inset p-3 text-sm text-orbit-text-soft mb-3">No subjects yet — the BST timetable button will create them, or go back to add your own.</p>
      )}
      {slots.map((s, i) => (
        <div key={i} className="or-inset p-3 mb-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="col-span-2">
            <Field label="Subject" error={errors[i]?.subject_id}>
              <select className="or-select w-full px-3 py-2 text-sm" value={s.subject_id} onChange={setRow(i, 'subject_id')}>
                <option value="">Select…</option>
                {subjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Day" error={errors[i]?.day_of_week}>
            <select className="or-select w-full px-3 py-2 text-sm" value={s.day_of_week} onChange={setRow(i, 'day_of_week')}>
              {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
            </select>
          </Field>
          <Field label="Start" error={errors[i]?.start_time}>
            <input type="time" className="or-input w-full px-2 py-2 text-sm" value={s.start_time} onChange={setRow(i, 'start_time')} />
          </Field>
          <Field label="End" error={errors[i]?.end_time}>
            <input type="time" className="or-input w-full px-2 py-2 text-sm" value={s.end_time} onChange={setRow(i, 'end_time')} />
          </Field>
          <div className="flex gap-2 items-end">
            <Field label="Room">
              <input className="or-input w-full px-2 py-2 text-sm" value={s.room} onChange={setRow(i, 'room')} placeholder="LH-3" />
            </Field>
            <button onClick={() => removeRow(i)} className="or-btn or-btn-ghost p-2 mb-0.5"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addRow} className="or-btn px-3 py-2 text-xs" disabled={!subjects.length}>
          <Plus className="w-3.5 h-3.5" /> Add class slot
        </button>
        <div className="flex-1" />
        <button onClick={onBack} className="or-btn px-4 py-2.5 text-sm">Back</button>
        <button disabled={busy} onClick={finish} className="or-btn or-btn-primary px-5 py-2.5 text-sm">
          <CalendarDays className="w-4 h-4" /> {busy ? 'Loading your real academic data…' : 'Finish & load my real BST data'}
        </button>
      </div>
    </div>
  );
}
