import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Clock, MapPin, FileText, ClipboardList, CalendarClock,
  ChevronRight, BookOpen, CheckCircle2, ListChecks,
  BarChart3, Plus, Utensils, Target, Trophy, Percent,
  Lightbulb, Sun, Flame, Sparkles, Zap, RefreshCw,
} from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { isRealDate, academicRadar, dashboardRecommendation } from '../../lib/calc.js';
import { Pct } from '../ui.jsx';
import {
  OrbitCard, OrbitSection, OrbitStat, OrbitBadge, OrbitButton, OrbitEmptyState,
  OrbitTimeline, OrbitCalendar, OrbitProgress, Donut, TONE_HEX,
} from '../orbit/Orbit.jsx';
import { fmtTime12, fmtDate, countdownLabel, daysBetween } from '../../lib/datetime.js';
import { deadlineLabel } from '../../lib/events.js';
import { EVENT_TYPES, labelOf } from '../../lib/constants.js';
import { LUNCH } from '../../website/seedData.js';

// Module id → /app path segment (dashboard only navigates to direct segments).
const PATHS = {
  schedule: 'schedule', tests: 'tests', assignments: 'assignments', attendance: 'attendance',
  calendar: 'calendar', events: 'events', analytics: 'analytics', planner: 'study',
};

// Dashboard mini-calendar categories. Mirrors the Academic Calendar page's
// event_type semantics, collapsed into the three legend buckets. Government
// holidays get their own colour; nothing is inferred from weekday/weekend.
const ACADEMIC_CATEGORY = {
  holiday: { label: 'Holiday', color: TONE_HEX.green },
  break: { label: 'Holiday', color: TONE_HEX.green },
  exam: { label: 'Assessment / Exam', color: TONE_HEX.purple },
  midsem: { label: 'Assessment / Exam', color: TONE_HEX.purple },
  endsem: { label: 'Assessment / Exam', color: TONE_HEX.purple },
  internal: { label: 'Assessment / Exam', color: TONE_HEX.purple },
  practical: { label: 'Assessment / Exam', color: TONE_HEX.purple },
  other: { label: 'Academic Event', color: TONE_HEX.blue },
};
// Everything not listed above (semester_start/end, assignment, project,
// college_event, ...) is an official academic-calendar entry.
const academicCategory = (type) => ACADEMIC_CATEGORY[type] || ACADEMIC_CATEGORY.other;

const QUOTES = [
  ['Consistency today', 'builds the future you want.'],
  ['Small daily wins', 'compound into mastery.'],
  ['One focused hour', 'beats a distracted evening.'],
  ['Review a little today', 'recall a lot tomorrow.'],
  ['Show up for the plan', 'the results follow.'],
  ['Understanding beats memorizing', '— teach it to yourself.'],
  ['Rest is part of the schedule', 'recover, then return.'],
];

const RADAR_META = {
  TEST: { label: 'TEST', tone: 'coral', icon: FileText },
  ASSIGNMENT: { label: 'ASSIGNMENT', tone: 'orange', icon: ClipboardList },
  EVENT: { label: 'EVENT', tone: 'blue', icon: CalendarClock },
  HOLIDAY: { label: 'HOLIDAY', tone: 'green', icon: Sun },
};

// Days-left chip tone — urgency → color (mirrors the reference design).
function daysLeftTone(daysLeft, overdue) {
  if (overdue || (daysLeft != null && daysLeft < 0)) return 'coral';
  if (daysLeft == null) return 'neutral';
  if (daysLeft <= 3) return 'coral';
  if (daysLeft <= 7) return 'orange';
  if (daysLeft <= 14) return 'blue';
  return 'green';
}
function daysLeftLabel(item) {
  if (item.overdue) return 'Overdue';
  if (item.daysLeft == null) return 'TBA';
  if (item.daysLeft === 0) return 'Today';
  if (item.daysLeft === 1) return 'Tomorrow';
  if (item.daysLeft < 0) return `${Math.abs(item.daysLeft)}d overdue`;
  return `${item.daysLeft} days left`;
}

export default function Dashboard() {
  const { analytics: a, profile, data, settings, today, updateRow, saveSettings, syncAttendanceNow, flash } = useApp();
  const navigate = useNavigate();
  const [nowMins, setNowMins] = useState(new Date().getHours() * 60 + new Date().getMinutes());
  const [radarExpanded, setRadarExpanded] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNowMins(new Date().getHours() * 60 + new Date().getMinutes()), 30000);
    return () => clearInterval(id);
  }, []);

  const navTo = (id) => { navigate(`/app/${PATHS[id] ?? ''}`); window.scrollTo({ top: 0 }); };
  const openAdd = (module) => { sessionStorage.setItem('orbit-quick-add', module); navTo(module); };

  // Attendance is Excel-only and read-only: there is nothing to add
  // or mark here, so the dashboard's attendance actions sync the sheet
  // instead. Same numbers the Attendance page shows — both read the
  // one shared set of synced rows.
  const [syncingAttendance, setSyncingAttendance] = useState(false);
  const syncAttendance = async () => {
    setSyncingAttendance(true);
    try {
      const res = await syncAttendanceNow();
      const s = res?.summary ?? {};
      flash(`Attendance synced. New: ${s.inserted ?? 0} · Updated: ${s.updated ?? 0} · Unchanged: ${s.skipped ?? 0}`);
    } catch (e) {
      flash(e?.message || 'Sync failed. Existing attendance data has been preserved.');
    } finally {
      setSyncingAttendance(false);
    }
  };

  // ---------------- hooks (must run before any early return) ----------------
  const name = profile?.full_name?.split(' ')[0] || 'Student';
  const subjectOf = (id) => data?.subjects?.find((s) => s.id === id)?.name || 'General';
  const codeOf = (id) => data?.subjects?.find((s) => s.id === id)?.code || '';
  const venue = data?.schedule?.[0]?.room || '';

  const now = new Date();
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const quote = QUOTES[dayOfYear % QUOTES.length];

  // ---------------- shared lists (SAME queries the module pages use) ----------------
  // Every list below comes straight from analytics, which is built by the
  // shared selectors in lib/queries.js. The card count IS the list length —
  // neither side recomputes anything, so they cannot drift apart.
  //
  // Upcoming Tests = Tests & Marks rows only (real future date, not graded).
  const testItems = useMemo(() => (a?.upcomingTests ?? [])
    .map((t) => ({ id: `t${t.id}`, date: t.test_date, name: t.name, sub: subjectOf(t.subject_id), kind: 'Test' })),
  [a]); // eslint-disable-line

  // Upcoming Events = the de-duplicated union of the official Academic
  // Calendar and user-created Upcoming Events, already merged and sorted
  // by getUpcomingEvents().
  const eventItems = useMemo(() => (a?.upcomingEvents ?? []).map((e) => ({
    id: e.id,
    date: e.start_date,
    name: e.title,
    source: e.source,
    // Academic rows carry event_type codes; user rows carry a free-text type.
    kind: e.source === 'user' ? e.event_type : (labelOf(EVENT_TYPES, e.event_type) || e.event_type),
    holiday: e.event_type === 'holiday' || e.event_type === 'break',
    mode: e.mode,
    dl: deadlineLabel(e, today),
  })), [a, today]); // eslint-disable-line

  // Academic Radar — one merged, date-sorted attention list.
  const radarItems = useMemo(() => academicRadar({
    today,
    tests: data?.tests ?? [],
    assignments: data?.assignments ?? [],
    events: data?.events ?? [],
    customEvents: data?.hackathons ?? [],
  }), [data, today]); // eslint-disable-line

  const att = a?.overallAtt ?? { total: 0, present: 0, absent: 0, pct: null };
  const target = Number(settings?.attendance_threshold ?? 75);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(target));

  if (!a || !data) return <DashboardSkeleton />;

  const saveTarget = async () => {
    const n = Number(targetInput);
    if (!Number.isFinite(n) || n < 1 || n > 100) { flash('Target must be 1–100.'); return; }
    await saveSettings({ attendance_threshold: n });
    setEditingTarget(false);
  };

  // ---------------- hero recommendation (from real context only) ----------------
  // Outstanding assignments, straight from the shared query — the same rows
  // the Assignments page lists as due/overdue.
  const dueAssignments = a.dueAssignments ?? [];
  const dueSplit = a.dueSplit ?? { overdue: [], today: [], later: [] };
  const resolve = (s) => (s ? { ...s, name: subjectOf(s.subject_id) } : null);
  const slots = a.todaySlots ?? [];
  const recommendation = dashboardRecommendation({
    today,
    current: resolve(a.current) && { ...resolve(a.current), end_time: fmtTime12(a.current.end_time) },
    next: resolve(a.next) && { ...resolve(a.next), start_time: fmtTime12(a.next.start_time) },
    overdueCount: dueSplit.overdue.length,
    dueTodayCount: dueSplit.today.length,
    nextTest: testItems[0] ? { name: testItems[0].name, date: testItems[0].date } : null,
    classesToday: slots.length,
  });
  const REC_ICON = {
    ongoing: Clock, overdue: Flame, 'due-today': ClipboardList,
    test: FileText, 'next-class': Clock, free: Lightbulb, clear: Lightbulb,
  };
  const RecIcon = REC_ICON[recommendation.key] || Lightbulb;

  // ---------------- summary tiles (counts = proven sources) ----------------
  const tiles = [
    {
      label: "Today's Classes", value: a.todaySlots.length, icon: BookOpen, tone: 'purple', to: 'schedule',
      sub: a.current
        ? `${subjectOf(a.current.subject_id)} happening now`
        : a.next
          ? `Next at ${fmtTime12(a.next.start_time)}`
          : a.todaySlots.length ? 'All classes done for today 🌙' : 'Enjoy the break! ☀️',
    },
    {
      label: 'Assignments Due', value: dueAssignments.length, icon: CheckCircle2, tone: 'green', to: 'assignments',
      sub: dueAssignments.length === 0
        ? 'All caught up! 🎉'
        : dueSplit.overdue.length > 0
          ? `${dueSplit.overdue.length} overdue · ${dueSplit.today.length} due today`
          : dueSplit.today.length > 0
            ? `${dueSplit.today.length} due today`
            : `${dueSplit.later.length} still outstanding`,
    },
    {
      label: 'Upcoming Tests', value: testItems.length, icon: FileText, tone: 'coral', to: 'tests',
      sub: testItems.length === 0 ? 'No tests scheduled' : `Next: ${testItems[0].name}`,
    },
    {
      label: 'Upcoming Events', value: eventItems.length, icon: CalendarClock, tone: 'orange', to: 'events',
      sub: eventItems.length === 0 ? 'Stay updated' : `Next: ${eventItems[0].name}`,
    },
  ];

  // ---------------- today timeline (lunch inserted, never a class) ----------------
  const lunchAfter = slots.findIndex((s) => s.start_time >= '14:00');
  const showLunch = lunchAfter > 0;

  // ---------------- next class ----------------
  const minsTo = (slot) => {
    const m = Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5));
    return m - nowMins;
  };
  const fmtDur = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
  const nextSlot = a.current || a.next;
  const nextCountdown = a.current
    ? `Happening now · ends in ${fmtDur(Math.max((Number(a.current.end_time.slice(0, 2)) * 60 + Number(a.current.end_time.slice(3, 5))) - nowMins, 0))}`
    : a.next ? `Starts in ${fmtDur(Math.max(minsTo(a.next), 0))}` : null;

  // ---------------- tasks ----------------
  const taskRows = [
    ...dueSplit.overdue.map((t) => ({ ...t, flag: 'Overdue', tone: 'coral' })),
    ...dueSplit.today.map((t) => ({ ...t, flag: 'Due today', tone: 'blue' })),
  ];
  const completeTask = async (t) => {
    await updateRow('assignments', t.id, { status: 'completed' });
    flash('Task completed.');
  };

  // ---------------- attendance ----------------

  // ---------------- test performance ----------------
  const gradedTests = (data.tests ?? [])
    .filter((t) => t.marks_obtained != null)
    .sort((x, y) => (x.test_date < y.test_date ? 1 : -1));

  // ------- mini calendar: ACADEMIC CALENDAR ONLY -------
  // Strict separation of systems: this calendar is fed exclusively by
  // `data.events` (the academic_events table). The weekly class timetable
  // (`data.schedule`), tests, assignments and user-created events
  // (`data.hackathons`) must never create an indicator here — those belong
  // to Today's Classes / Next Class / the Class Schedule page.
  // "Date TBA" sentinel rows (9999-12-31) are excluded by isRealDate().
  const calItems = useMemo(
    () =>
      (data?.events ?? [])
        .filter((e) => isRealDate(e.start_date))
        .map((e) => {
          const cat = academicCategory(e.event_type);
          return { id: `e-${e.id}`, date: e.start_date, color: cat.color, title: e.title, sub: cat.label };
        }),
    [data],
  );

  return (
    <div className="space-y-5">
      {/* ============ HERO ============ */}
      <section className="or-hero">
        {/* decorative layers */}
        <HeroScene />
        <span className="or-star or-star--twinkle w-1.5 h-1.5" style={{ left: '44%', top: '16%' }} aria-hidden="true" />
        <span className="or-star or-star--twinkle w-1 h-1" style={{ left: '57%', top: '74%', animationDelay: '1.2s' }} aria-hidden="true" />
        <span className="or-star or-star--twinkle w-1 h-1" style={{ left: '69%', top: '28%', animationDelay: '2.4s' }} aria-hidden="true" />

        <div className="relative z-10 flex items-stretch gap-4 p-6 md:p-8 lg:p-10">
          <div className="min-w-0 flex-1 max-w-2xl">
            <p className="or-kicker">{dateLine}</p>
            <h1 className="text-[30px] md:text-[42px] font-extrabold tracking-[-0.02em] text-orbit-text mt-2 leading-[1.08]">
              {greeting}, {name} <span aria-hidden="true">👋</span>
            </h1>
            <p className="text-[14px] font-medium text-orbit-text-soft mt-2.5">
              {[profile?.program, profile?.branch, venue].filter(Boolean).join(' · ') || 'Your day at a glance'}
            </p>

            {/* context-driven recommendation (never fabricated) */}
            <button className="or-hero-rec mt-6 max-w-xl" onClick={() => navTo(recommendation.to)}>
              <span className="or-icon-chip or-icon-chip-sm or-tone-purple !w-8 !h-8 !rounded-lg shrink-0">
                <RecIcon className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <span className="text-[13.5px] font-semibold text-orbit-text leading-snug min-w-0">{recommendation.text}</span>
              <ChevronRight className="w-4 h-4 text-orbit-muted shrink-0 ml-auto" />
            </button>

            {/* Daily line — kept under the copy so it never fights the scene art. */}
            <p className="mt-5 flex items-start gap-2 max-w-xl text-[12.5px] font-medium text-orbit-text-mute">
              <span className="text-[22px] leading-none text-orbit-bright-purple font-serif shrink-0">“</span>
              <span className="italic tracking-wide">{quote[0]} {quote[1]}</span>
            </p>
          </div>

          </div>
      </section>

      {/* ============ STAT CARDS ============ */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <OrbitStat
            key={t.label}
            icon={t.icon}
            tone={t.tone}
            value={t.value}
            label={t.label}
            sub={t.sub}
            onClick={() => navTo(t.to)}
          />
        ))}
      </section>

      {/* ============ CLASSES / NEXT CLASS / CALENDAR ============ */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Today's classes timeline */}
        <OrbitSection
          className="xl:col-span-6"
          icon={CalendarDays}
          tone="purple"
          title="Today's Classes"
          action={<button onClick={() => navTo('schedule')} className="or-pill-link or-pill-link-sm">View Full Schedule <ChevronRight className="w-3 h-3" /></button>}
        >
          {slots.length === 0 ? (
            <OrbitEmptyState
              art={<RestOrbitArt />}
              title="No classes scheduled for today."
              sub="Enjoy the break! ☀️"
              compact
            />
          ) : (
            <div className="space-y-2">
              {slots.map((c, i) => {
                const st = c.status || 'upcoming';
                return (
                  <div key={c.id}>
                    {showLunch && i === lunchAfter && <LunchRow />}
                    <div className={`or-inset or-inset-hover flex flex-wrap items-center gap-3 px-3.5 py-3 ${st === 'ongoing' ? 'or-slot-ongoing' : ''}`}>
                      <span className="text-[11.5px] font-bold text-orbit-text-soft bg-orbit-surface border border-orbit-border rounded-lg px-2 py-1 whitespace-nowrap">
                        {fmtTime12(c.start_time).replace(' ', '')} – {fmtTime12(c.end_time).replace(' ', '')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[13.5px] text-orbit-text truncate">{subjectOf(c.subject_id)}</p>
                        <p className="text-[11.5px] text-orbit-text-mute font-medium flex flex-wrap items-center gap-x-2 mt-0.5">
                          {codeOf(c.subject_id) && <span>{codeOf(c.subject_id)} ·</span>}
                          <span>{(c.notes || '').split('·')[0].trim() || 'Class'}</span>
                          {c.room && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.room}</span>}
                        </p>
                      </div>
                      {st === 'ongoing' ? (
                        <OrbitBadge tone="green"><span className="or-live-dot" /> Now</OrbitBadge>
                      ) : st === 'completed' ? (
                        <OrbitBadge tone="neutral">Completed</OrbitBadge>
                      ) : (
                        <OrbitBadge tone="blue">Upcoming</OrbitBadge>
                      )}
                    </div>
                  </div>
                );
              })}
              {showLunch && lunchAfter >= slots.length && <LunchRow />}
            </div>
          )}
        </OrbitSection>

        {/* Next class */}
        <OrbitSection
          className="xl:col-span-3"
          icon={Clock}
          tone="lavender"
          title="Next Class"
          action={<button onClick={() => navTo('schedule')} className="or-pill-link or-pill-link-sm">Full Timetable <ChevronRight className="w-3 h-3" /></button>}
          bodyClass="p-4 md:p-5 flex-1 flex flex-col"
        >
          {nextSlot ? (
            <div className="flex-1 flex flex-col">
              {nextCountdown && <OrbitBadge tone="green" className="self-start mb-3">{nextCountdown}</OrbitBadge>}
              <div className="flex items-start gap-3">
                <div className="text-center bg-orbit-purple-soft rounded-xl px-2.5 py-2 shrink-0">
                  <p className="font-extrabold text-[13px] text-[#a78bfa] leading-tight">{fmtTime12(nextSlot.start_time).replace(' ', '')}</p>
                  <p className="text-[10px] font-semibold text-[#c4b5fd] mt-0.5">{fmtTime12(nextSlot.end_time).replace(' ', '')}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[13.5px] text-orbit-text leading-snug">{subjectOf(nextSlot.subject_id)}</p>
                  <p className="text-[11.5px] text-orbit-text-mute font-medium mt-0.5">
                    {codeOf(nextSlot.subject_id) ? `${codeOf(nextSlot.subject_id)} · ` : ''}{(nextSlot.notes || '').split('·')[0].trim() || 'Class'}
                  </p>
                  {nextSlot.room && <p className="text-[11.5px] text-orbit-text-mute font-medium inline-flex items-center gap-0.5 mt-0.5"><MapPin className="w-3 h-3" />{nextSlot.room}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <OrbitEmptyState
                art={<MoonRestArt />}
                title="No more classes today 🌙"
                sub="You're done for the day."
                compact
              />
            </div>
          )}
        </OrbitSection>

        {/* Compact calendar */}
        <OrbitCard className="xl:col-span-3 overflow-hidden">
          <div className="or-card-head !border-b-0 pb-0">
            <span className="or-icon-chip or-icon-chip-sm or-tone-green"><CalendarDays className="w-[18px] h-[18px]" strokeWidth={2.2} /></span>
            <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight">This Month</h2>
          </div>
          <OrbitCalendar
            today={today}
            items={calItems}
            legend={[
              { label: 'Academic Event', color: TONE_HEX.blue },
              { label: 'Assessment / Exam', color: TONE_HEX.purple },
              { label: 'Holiday', color: TONE_HEX.green },
            ]}
            onOpenDay={() => navTo('calendar')}
          />
        </OrbitCard>
      </section>

      {/* ============ ACADEMIC RADAR ============ */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <OrbitSection
          className="xl:col-span-2"
          icon={Target}
          tone="purple"
          title="Your Academic Radar"
          sub="Things that need your attention soon."
          action={radarItems.length > 7 ? (
            <button onClick={() => setRadarExpanded((v) => !v)} className="or-pill-link">
              {radarExpanded ? 'Show Less' : 'View All'} <ChevronRight className={`w-3.5 h-3.5 transition-transform ${radarExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : null}
        >
          {radarItems.length === 0 ? (
            <OrbitEmptyState
              icon={CheckCircle2}
              title="Nothing needs your attention."
              sub="You're all caught up — no upcoming tests, assignments or events."
              compact
            />
          ) : (
            <OrbitTimeline
              items={(radarExpanded ? radarItems : radarItems.slice(0, 7)).map((item) => {
                const meta = RADAR_META[item.kind] || RADAR_META.EVENT;
                return {
                  id: item.id,
                  icon: meta.icon,
                  tone: meta.tone,
                  badge: (
                    <span className={`or-chip or-chip-${meta.tone} !px-2 !text-[9.5px] !tracking-[0.08em] mb-0.5`}>{meta.label}</span>
                  ),
                  title: item.title,
                  sub: [
                    item.subjectId ? subjectOf(item.subjectId) : null,
                    item.date ? fmtDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' }) : null,
                  ].filter(Boolean).join(' · '),
                  right: <OrbitBadge tone={daysLeftTone(item.daysLeft, item.overdue)}>{daysLeftLabel(item)}</OrbitBadge>,
                };
              })}
            />
          )}
        </OrbitSection>

        {/* Upcoming events (same list source as the tile count) */}
        <OrbitSection
          icon={Trophy}
          tone="orange"
          title="Upcoming Events"
          action={<button onClick={() => navTo('events')} className="or-pill-link">View All <ChevronRight className="w-3.5 h-3.5" /></button>}
        >
          {eventItems.length === 0 ? (
            <OrbitEmptyState
              icon={CalendarClock}
              title="No upcoming events."
              sub="College events, competitions and hackathons will appear here."
              compact
              action={<OrbitButton size="sm" variant="soft" onClick={() => openAdd('events')}><Plus className="w-4 h-4" /> Add Event</OrbitButton>}
            />
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
              {eventItems.map((e) => (
                <button key={e.id} onClick={() => navTo(e.mode ? 'events' : 'calendar')} className="w-full or-inset or-inset-hover flex items-center gap-3 px-3 py-2.5 text-left">
                  <div className={`w-11 text-center rounded-lg py-1.5 shrink-0 ${e.holiday ? 'bg-orbit-green-soft' : 'bg-orbit-coral-soft'}`}>
                    <p className={`text-[9px] font-bold uppercase ${e.holiday ? 'text-[#34d399]' : 'text-[#fb7185]'}`}>{e.date ? fmtDate(e.date, { month: 'short' }) : 'TBA'}</p>
                    <p className="font-extrabold text-[14px] leading-none text-orbit-text mt-0.5">{e.date ? Number(e.date.slice(8)) : '—'}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-orbit-text truncate">{e.name}</p>
                    <p className="text-[11.5px] text-orbit-text-mute font-medium truncate">{e.kind}{e.mode ? ` · ${e.mode}` : ''}</p>
                  </div>
                  <OrbitBadge tone={e.holiday ? 'green' : daysLeftTone(e.date ? daysBetween(today, e.date) : null, false)}>
                    {e.dl && !e.dl.includes('closed') ? e.dl.replace('Registration ', 'Reg ') : e.date ? countdownLabel(e.date, today) : 'TBA'}
                  </OrbitBadge>
                </button>
              ))}
            </div>
          )}
        </OrbitSection>
      </section>

      {/* ============ UPCOMING TESTS + LOWER ROW ============ */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Upcoming tests (same list source as the tile count) */}
        <OrbitSection
          icon={FileText}
          tone="coral"
          title="Upcoming Tests"
          action={<button onClick={() => navTo('tests')} className="or-pill-link">View All <ChevronRight className="w-3.5 h-3.5" /></button>}
        >
          {testItems.length === 0 ? (
            <OrbitEmptyState
              icon={FileText}
              title="No upcoming tests."
              sub="You're all clear for now."
              compact
              action={<OrbitButton size="sm" variant="soft" onClick={() => openAdd('tests')}><Plus className="w-4 h-4" /> Add Your First Test</OrbitButton>}
            />
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
              {testItems.map((t) => (
                <button key={t.id} onClick={() => navTo('tests')} className="w-full or-inset or-inset-hover flex items-center gap-3 px-3 py-2.5 text-left">
                  <div className="w-11 text-center rounded-lg py-1.5 shrink-0 bg-orbit-coral-soft">
                    <p className="text-[9px] font-bold uppercase text-[#fb7185]">{fmtDate(t.date, { month: 'short' })}</p>
                    <p className="font-extrabold text-[14px] leading-none text-orbit-text mt-0.5">{Number(t.date.slice(8))}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-orbit-text truncate">{t.name}</p>
                    <p className="text-[11.5px] text-orbit-text-mute font-medium truncate">{t.sub} · {t.kind}</p>
                  </div>
                  <OrbitBadge tone={daysLeftTone(daysBetween(today, t.date), false)}>{countdownLabel(t.date, today)}</OrbitBadge>
                </button>
              ))}
            </div>
          )}
        </OrbitSection>

        {/* Today's tasks */}
        <OrbitSection
          icon={ListChecks}
          tone="yellow"
          title="Today's Tasks"
          action={<OrbitBadge tone={taskRows.length ? 'yellow' : 'green'}>{taskRows.length}</OrbitBadge>}
          bodyClass="p-4 md:p-5 flex-1 flex flex-col"
        >
          <div className="flex-1 space-y-2">
            {taskRows.length === 0 ? (
              <OrbitEmptyState icon={CheckCircle2} title="No assignments due today." sub="Enjoy the momentum! 🎉" compact />
            ) : taskRows.map((t) => (
              <div key={t.id} className="or-inset flex items-center gap-2.5 px-3 py-2.5">
                <button
                  onClick={() => completeTask(t)}
                  className="w-5 h-5 rounded-md border-[1.5px] border-orbit-border-strong bg-orbit-surface shrink-0 hover:bg-orbit-green-soft hover:border-orbit-green transition-colors"
                  title="Mark completed"
                  aria-label={`Complete ${t.title}`}
                />
                <button onClick={() => navTo('assignments')} className="min-w-0 flex-1 text-left">
                  <p className="text-[13px] font-semibold text-orbit-text truncate">{t.title}</p>
                  <p className="text-[11px] text-orbit-text-mute font-medium truncate">{subjectOf(t.subject_id)}</p>
                </button>
                <OrbitBadge tone={t.tone}>{t.flag}</OrbitBadge>
              </div>
            ))}
          </div>
          <div className="pt-3 mt-3 border-t border-orbit-border">
            <button onClick={() => openAdd('assignments')} className="or-link text-[12px] inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add assignment</button>
          </div>
        </OrbitSection>

        {/* Attendance overview */}
        <OrbitSection
          icon={Percent}
          tone="green"
          title="Attendance"
          bodyClass="p-4 md:p-5 flex-1 flex flex-col"
        >
          {att.total === 0 ? (
            <div className="flex-1 flex flex-col">
              <OrbitEmptyState icon={Percent} title="No attendance synced yet." sub="Sync the Excel attendance sheet to populate this." compact />
              <div className="mt-auto pt-2">
                <OrbitButton size="sm" variant="primary" className="w-full" onClick={syncAttendance} disabled={syncingAttendance}>
                  <RefreshCw className={`w-3.5 h-3.5${syncingAttendance ? ' animate-spin' : ''}`} strokeWidth={2.4} /> {syncingAttendance ? 'Syncing…' : 'Sync from Excel'}
                </OrbitButton>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-4">
                <Donut pct={att.pct} size={92} stroke={10} color={(att.pct ?? 0) >= target ? '#34d399' : '#fb7185'}>
                  <span className="font-extrabold text-[17px] text-orbit-text leading-none"><Pct value={att.pct} /></span>
                  <span className="text-[8.5px] font-bold text-orbit-text-mute uppercase tracking-wider mt-0.5">overall</span>
                </Donut>
                <div className="text-[12px] font-semibold space-y-1.5 min-w-0 text-orbit-text-soft">
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orbit-green inline-block" /> Attended <b className="ml-auto text-orbit-text pl-3">{att.present}</b></p>
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orbit-coral inline-block" /> Missed <b className="ml-auto text-orbit-text pl-3">{att.absent}</b></p>
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orbit-text-mute/40 inline-block" /> Total <b className="ml-auto text-orbit-text pl-3">{att.total}</b></p>
                </div>
              </div>
              <div className="mt-auto pt-3">
                {editingTarget ? (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="1" max="100" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="or-input !w-16 !px-2 !py-1.5 text-xs" />
                    <span className="text-[11px] font-semibold text-orbit-text-mute">%</span>
                    <OrbitButton size="sm" onClick={saveTarget}>Save</OrbitButton>
                    <OrbitButton size="sm" variant="ghost" onClick={() => setEditingTarget(false)}>Cancel</OrbitButton>
                  </div>
                ) : (
                  <div className="or-inset flex items-center gap-2 px-3 py-2 bg-orbit-blue-soft !border-orbit-blue-soft">
                    <Target className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span className="text-[12px] font-semibold text-orbit-text">Target Attendance</span>
                    <span className="text-[12px] font-extrabold text-orbit-text ml-auto">{target}%</span>
                    <button onClick={() => { setTargetInput(String(target)); setEditingTarget(true); }} className="or-chip or-chip-neutral cursor-pointer !bg-orbit-surface hover:!bg-orbit-bg">Edit</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </OrbitSection>
      </section>

      {/* ============ PERFORMANCE + QUICK ACTIONS ============ */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Test performance */}
        <OrbitSection
          className="xl:col-span-2"
          icon={BarChart3}
          tone="purple"
          title="Test Performance"
          action={<button onClick={() => navTo('analytics')} className="or-pill-link">Details <ChevronRight className="w-3.5 h-3.5" /></button>}
        >
          {gradedTests.length === 0 ? (
            <OrbitEmptyState icon={BarChart3} title="No graded tests yet." sub="Add tests with marks and your analytics build themselves." compact />
          ) : (
            <>
              <p className="or-kicker">AVERAGE SCORE</p>
              <p className="text-[30px] font-extrabold text-orbit-text leading-none mt-1.5 tracking-tight"><Pct value={a.overall.avgPct} /></p>
              <p className="text-[12px] font-medium text-orbit-text-mute mt-1">{a.overall.total} graded test{a.overall.total === 1 ? '' : 's'}</p>
              <OrbitProgress className="mt-3" value={a.overall.avgPct} tone="#8b5cf6" />
              <div className="space-y-1.5 mt-4">
                {gradedTests.slice(0, 3).map((t) => (
                  <div key={t.id} className="or-inset flex items-center justify-between px-3 py-2 text-[12px]">
                    <span className="font-semibold text-orbit-text truncate mr-2">{t.name}</span>
                    <span className="shrink-0 text-orbit-text-mute font-medium">{t.marks_obtained}/{t.max_marks} · <b className="text-orbit-text">{Math.round((t.marks_obtained / t.max_marks) * 1000) / 10}%</b></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </OrbitSection>

        {/* Quick actions */}
        <OrbitSection
          className="md:col-span-2 xl:col-span-2"
          icon={Zap}
          tone="blue"
          title="Quick Actions"
          bodyClass="p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1"
        >
          <QuickAction icon={ClipboardList} label="Add Assignment" tone="purple" onClick={() => openAdd('assignments')} />
          <QuickAction icon={FileText} label="Add Test" tone="blue" onClick={() => openAdd('tests')} />
          <QuickAction icon={CheckCircle2} label="Sync Attendance" tone="green" onClick={syncAttendance} />
          <QuickAction icon={CalendarClock} label="Add Event" tone="orange" onClick={() => openAdd('calendar')} />
        </OrbitSection>
      </section>
    </div>
  );
}

function LunchRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 my-1 border border-dashed border-orbit-border-strong rounded-xl bg-orbit-surface/60">
      <span className="text-[11px] font-bold text-orbit-text-mute whitespace-nowrap">{fmtTime12(LUNCH.start_time).replace(' ', '')} – {fmtTime12(LUNCH.end_time).replace(' ', '')}</span>
      <Utensils className="w-3.5 h-3.5 text-orbit-text-mute" />
      <span className="text-[12.5px] font-semibold text-orbit-text-mute">{LUNCH.title}</span>
      <OrbitBadge tone="neutral" className="ml-auto">Break</OrbitBadge>
    </div>
  );
}

function QuickAction({ icon: Icon, label, tone, onClick }) {
  return (
    <button onClick={onClick} className="or-inset or-inset-hover flex items-center gap-2.5 px-3.5 py-3 text-[13px] font-semibold text-orbit-text text-left">
      <span className={`or-icon-chip or-icon-chip-sm or-tone-${tone}`}><Icon className="w-4 h-4" strokeWidth={2.2} /></span>
      {label}
      <ChevronRight className="w-3.5 h-3.5 text-orbit-text-mute ml-auto" />
    </button>
  );
}

// Empty-state art: an idle orbit with a warm sun, for "no classes today".
function RestOrbitArt() {
  return (
    <svg viewBox="0 0 140 96" width="150" height="103" className="mb-3" aria-hidden="true">
      <defs>
        <radialGradient id="orRestSun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="70" cy="44" r="30" fill="url(#orRestSun)" />
      <circle cx="70" cy="44" r="13" fill="#fcd34d" opacity="0.85" />
      <circle cx="70" cy="44" r="20" stroke="rgba(245, 158, 11, 0.42)" strokeWidth="1" fill="none" />
      <ellipse cx="70" cy="44" rx="46" ry="17" stroke="rgba(139, 92, 246, 0.45)" strokeWidth="1.2" fill="none" transform="rotate(-14 70 44)" />
      <ellipse cx="70" cy="44" rx="34" ry="12" stroke="rgba(56, 189, 248, 0.32)" strokeWidth="1" fill="none" transform="rotate(18 70 44)" />
      <g fill="#f8fafc" opacity="0.55">
        <circle cx="20" cy="20" r="1.4" />
        <circle cx="118" cy="26" r="1.1" />
        <circle cx="30" cy="72" r="1" />
        <circle cx="110" cy="76" r="1.3" />
      </g>
    </svg>
  );
}

// Empty-state art: a crescent moon over a quiet horizon, for "day is done".
function MoonRestArt() {
  return (
    <svg viewBox="0 0 140 96" width="130" height="89" className="mb-3" aria-hidden="true">
      <defs>
        <radialGradient id="orMoonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orMoonBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="40" r="34" fill="url(#orMoonGlow)" />
      <circle cx="70" cy="40" r="17" fill="url(#orMoonBody)" />
      <circle cx="78" cy="33" r="15" fill="#0c1428" />
      <circle cx="62" cy="45" r="2" fill="#0c1428" opacity="0.35" />
      <ellipse cx="70" cy="40" rx="42" ry="15" stroke="rgba(167, 139, 250, 0.4)" strokeWidth="1.1" fill="none" transform="rotate(-18 70 40)" />
      <circle cx="112" cy="48" r="3" fill="#c4b5fd" />
      <g fill="#f8fafc" opacity="0.5">
        <circle cx="24" cy="24" r="1.2" />
        <circle cx="116" cy="16" r="1" />
        <circle cx="32" cy="68" r="1.1" />
      </g>
      <path d="M18 82 h104" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// Cinematic night-orbit scene for the hero: a campus silhouette under a
// deep blue sky, a large violet moon, nebula wash, drifting stars, slow
// orbital rings and the Orbit robot watching over it. Purely decorative —
// it never carries data and is hidden from assistive tech.
function HeroScene() {
  return (
    <svg
      className="or-hero-scene hidden md:block"
      viewBox="0 0 520 260"
      fill="none"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="orHeroMoon" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#e9d5ff" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#a78bfa" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.06" />
        </radialGradient>
        <linearGradient id="orHeroRidge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#050816" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="orHeroBldg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0b1024" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="orHeroWin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id="orHeroNebula" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.34" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* nebula wash */}
      <ellipse cx="360" cy="60" rx="210" ry="120" fill="url(#orHeroNebula)" />
      <ellipse cx="500" cy="180" rx="130" ry="80" fill="url(#orHeroNebula)" opacity="0.6" />

      {/* star field */}
      <g fill="#f8fafc">
        <circle cx="120" cy="34" r="1.5" opacity="0.75" />
        <circle cx="196" cy="18" r="1" opacity="0.55" />
        <circle cx="262" cy="62" r="1.2" opacity="0.45" />
        <circle cx="150" cy="104" r="0.9" opacity="0.5" />
        <circle cx="86" cy="150" r="1.3" opacity="0.4" />
        <circle cx="300" cy="18" r="0.9" opacity="0.6" />
        <circle cx="452" cy="26" r="1.1" opacity="0.5" />
        <circle cx="500" cy="96" r="0.9" opacity="0.45" />
        <circle cx="236" cy="140" r="1" opacity="0.35" />
        <circle cx="42" cy="72" r="1.1" opacity="0.5" />
      </g>
      <g fill="#a78bfa">
        <circle cx="176" cy="52" r="1.4" opacity="0.7" />
        <circle cx="330" cy="106" r="1.2" opacity="0.6" />
        <circle cx="478" cy="140" r="1" opacity="0.5" />
      </g>

      {/* the moon / planet */}
      <circle cx="372" cy="112" r="60" fill="url(#orHeroMoon)" />
      <circle cx="372" cy="112" r="60" stroke="rgba(196, 181, 253, 0.45)" strokeWidth="1.2" />
      <circle cx="358" cy="99" r="8" fill="#a78bfa" opacity="0.22" />
      <circle cx="388" cy="126" r="5.5" fill="#a78bfa" opacity="0.18" />
      <circle cx="381" cy="90" r="3.6" fill="#a78bfa" opacity="0.16" />

      {/* slow orbital rings + a satellite mote */}
      <g className="or-hero-orbit">
        <ellipse cx="372" cy="112" rx="124" ry="44" stroke="rgba(167, 139, 250, 0.42)" strokeWidth="1.2" transform="rotate(-16 372 112)" />
        <circle cx="262" cy="146" r="4" fill="#c4b5fd" />
      </g>
      <g className="or-hero-orbit-rev">
        <ellipse cx="372" cy="112" rx="90" ry="30" stroke="rgba(56, 189, 248, 0.34)" strokeWidth="1" transform="rotate(22 372 112)" />
        <circle cx="446" cy="92" r="3" fill="#7dd3fc" />
      </g>

      {/* campus skyline at night */}
      <path d="M0 214 h52 v-26 h16 v26 h30 v-40 h18 v40 h26 v-18 h34 v18 h44 v-52 h20 v52 h26 v-30 h16 v30 h48 v-22 h22 v22 h66 v46 H0 Z" fill="url(#orHeroBldg)" />
      {/* central academic block with a clock tower */}
      <rect x="196" y="118" width="30" height="44" rx="2" fill="url(#orHeroBldg)" />
      <rect x="205" y="100" width="12" height="20" rx="2" fill="url(#orHeroBldg)" />
      <circle cx="211" cy="108" r="3.6" fill="#fbbf24" opacity="0.85" />
      {/* lit windows */}
      <g fill="url(#orHeroWin)" opacity="0.8">
        <rect x="66" y="182" width="3" height="4" rx="1" />
        <rect x="76" y="182" width="3" height="4" rx="1" />
        <rect x="116" y="168" width="3" height="4" rx="1" />
        <rect x="126" y="168" width="3" height="4" rx="1" />
        <rect x="202" y="128" width="4" height="5" rx="1" />
        <rect x="214" y="128" width="4" height="5" rx="1" />
        <rect x="202" y="142" width="4" height="5" rx="1" />
        <rect x="214" y="142" width="4" height="5" rx="1" />
        <rect x="268" y="176" width="3" height="4" rx="1" />
        <rect x="300" y="176" width="3" height="4" rx="1" />
        <rect x="396" y="182" width="3" height="4" rx="1" />
        <rect x="406" y="182" width="3" height="4" rx="1" />
      </g>

      {/* the Orbit robot watching over the campus */}
      <g transform="translate(300 96)">
        <ellipse cx="0" cy="26" rx="17" ry="5" fill="#8b5cf6" opacity="0.22" />
        <circle cx="0" cy="14" r="11" fill="#0b1024" stroke="#8b5cf6" strokeWidth="1.2" />
        <circle cx="-4" cy="12" r="2.2" fill="#f8fafc" />
        <circle cx="4" cy="12" r="2.2" fill="#f8fafc" />
        <path d="M-3.4 17.4 q3.4 2.6 6.8 0" stroke="#a78bfa" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <line x1="0" y1="-1" x2="0" y2="-7" stroke="#a78bfa" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="0" cy="-9" r="2" fill="#c4b5fd" />
        <path d="M-11 14 a11 11 0 0 1 22 0" stroke="rgba(167,139,250,.4)" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}



// Skeleton matching the dashboard layout while analytics resolve.
function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading dashboard">
      <div className="or-skeleton h-40 md:h-44 !rounded-[24px]" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => <div key={i} className="or-skeleton h-[104px] !rounded-[18px]" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="or-skeleton h-72 !rounded-[18px] xl:col-span-6" />
        <div className="or-skeleton h-72 !rounded-[18px] xl:col-span-3" />
        <div className="or-skeleton h-72 !rounded-[18px] xl:col-span-3" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="or-skeleton h-64 !rounded-[18px] xl:col-span-2" />
        <div className="or-skeleton h-64 !rounded-[18px]" />
      </div>
      <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-orbit-text-mute pt-2">
        <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Preparing your academic universe…
      </div>
    </div>
  );
}
