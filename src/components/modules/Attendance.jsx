// Attendance is READ-ONLY and Excel-only.
//
// The connected Google Sheet (BST Section A attendance sheet) is the
// single source of truth:
//     Excel sheet ──► sync ──► attendance rows ──► this page
//                                             └► Dashboard / Analytics / AI
//
// There is deliberately NO create, edit or delete path on this page —
// not a disabled one. The student's only actions are Export and Sync
// Now, and every number below is derived from the synced rows through
// the shared selectors in lib/calc.js and lib/queries.js, which the
// Dashboard, Analytics, Summary and the AI snapshot also use.

import { useMemo, useState } from 'react';
import { Download, Check, X, CalendarCheck, Percent, Calculator, RefreshCw, CloudUpload, TriangleAlert, TrendingUp, Lock } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitStat, OrbitProgress, MiniBars, Donut } from '../orbit/Orbit.jsx';
import { fmtTime12, fmtDate } from '../../lib/datetime.js';
import { attendanceProjection, classesToTarget, attendanceExcludedBeforeStart, attendanceTrend } from '../../lib/calc.js';
import { downloadCSV } from '../../lib/csv.js';

// A record's human label. The sheet has one genuinely undated column
// ("Clubs and clans") with no subject row, so fall back to the label
// the sync stored rather than printing a blank or a fabricated subject.
function recordLabel(r, subjects = []) {
  if (r.class_label) return r.class_label;
  return subjects.find((s) => s.id === r.subject_id)?.name || '—';
}

// Every synced row is from the sheet. Rows written before the current
// pipeline existed are labelled as such — never as something the
// student did, because they can no longer create anything.
function sourceLabel(r) {
  return r.source === 'excel_sync' ? 'Excel sync' : 'Excel (legacy row)';
}

export default function Attendance() {
  const { data, analytics, today, syncAttendanceNow, flash } = useApp();
  const subjects = data?.subjects ?? [];
  const records = data?.attendance ?? [];
  const syncLogs = data?.syncLogs ?? [];
  const [targetInput, setTargetInput] = useState({});
  const [syncing, setSyncing] = useState(false);

  const subjectRows = analytics?.subjectAttendance ?? [];
  const overall = analytics?.overallAtt;
  const trend = useMemo(() => attendanceTrend(records, today, 6), [records, today]);

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

  const lastLog = syncLogs[0] ?? null;
  const lastGood = syncLogs.find((l) => l.status !== 'FAILED');
  const failedSince = lastLog?.status === 'FAILED';
  const totalRecords = records.length;
  const excelCount = records.filter((r) => r.source === 'excel_sync').length;
  const excludedCount = attendanceExcludedBeforeStart(records);
  // Synced sessions the timetable could not attribute to a subject
  // (the sheet's undated "Clubs and clans" column). They are real
  // classes and are counted above; this only explains the difference
  // between the overall total and the sum of the subject cards.
  const unattributed = analytics?.unattributedAtt?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="ATTENDANCE"
        title="Attendance"
        sub="Every number here comes from the connected Excel attendance sheet."
        actions={(
          <>
            <OrbitButton variant="outline" onClick={() => downloadCSV('attendance.csv',
              ['Date', 'Subject', 'Status', 'Source'],
              records.map((r) => [r.class_date || 'Undated', recordLabel(r, subjects), r.status, sourceLabel(r)]))}>
              <Download className="w-4 h-4" strokeWidth={2.2} /> Export
            </OrbitButton>
            <OrbitButton onClick={runSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4${syncing ? ' animate-spin' : ''}`} strokeWidth={2.4} /> {syncing ? 'Syncing…' : 'Sync Now'}
            </OrbitButton>
          </>
        )}
      />

      {!records.length && !subjects.length ? (
        <OrbitCard>
          <OrbitEmptyState icon={Percent} title="No subjects yet" sub="Add subjects first — attendance is tracked per subject." />
        </OrbitCard>
      ) : (
        <>
          {/* ---- Source-of-truth strip ---- */}
          <OrbitCard className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-orbit-text-soft">
              <CloudUpload className="w-3.5 h-3.5" strokeWidth={2.3} style={{ color: '#34d399' }} />
              Source: Excel (BST Section A attendance sheet)
            </span>
            <OrbitBadge tone="neutral">
              Last successful sync: {lastGood ? `${fmtDate(lastGood.completed_at ?? lastGood.started_at)} · ${fmtTime12(String(lastGood.completed_at ?? lastGood.started_at).slice(11, 19))}` : 'never'}
            </OrbitBadge>
            <OrbitBadge tone="neutral">
              Records: {totalRecords}{excelCount ? ` · ${excelCount} from Excel` : ''}{excludedCount ? ` · ${excludedCount} before 25 Aug not counted` : ''}
            </OrbitBadge>
            <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-bold text-orbit-text-mute">
              <Lock className="w-3 h-3" strokeWidth={2.4} /> Read-only
            </span>
          </OrbitCard>

          {/* A failed sync never erases data — say so explicitly. */}
          {failedSince && (
            <div className="or-inset flex items-start gap-2.5 px-4 py-3" style={{ background: '#312e81', borderColor: '#4338ca' }}>
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#fb7185' }} strokeWidth={2.3} />
              <div>
                <p className="text-[13px] font-bold text-orbit-text">Last Excel sync failed.</p>
                <p className="text-[12.5px] text-orbit-text-soft mt-0.5 leading-relaxed">
                  All {totalRecords} existing attendance record{totalRecords === 1 ? ' is' : 's are'} preserved and still shown below.
                  {lastLog?.error_message || lastLog?.message ? ` Reason: ${lastLog.error_message || lastLog.message}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* ---- Overall ---- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <OrbitStat icon={Percent} tone="green" value={overall?.pct != null ? `${overall.pct}%` : '—'} label="Overall attendance" sub={overall ? `${overall.present} of ${overall.total} classes` : 'No records yet'} />
            <OrbitStat icon={Check} tone="blue" value={overall?.present ?? 0} label="Present" sub="Classes attended" />
            <OrbitStat icon={X} tone="coral" value={overall?.absent ?? 0} label="Absent" sub="Classes missed" />
            <OrbitStat icon={CalendarCheck} tone="purple" value={overall?.total ?? 0} label="Total classes" sub="Recorded to date" />
          </div>

          {/* ---- Subject-wise ---- */}
          <section>
            <p className="or-kicker mb-2.5">Subject-wise attendance</p>
            {subjectRows.length === 0 ? (
              <OrbitCard><OrbitEmptyState icon={Percent} title="Not enough data yet." sub="Subject attendance appears once classes are recorded." compact /></OrbitCard>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {subjectRows.map((s) => (
                    <SubjectAttendanceCard key={s.subjectId} s={s} records={records} targetInput={targetInput} setTargetInput={setTargetInput} />
                  ))}
                </div>
                {unattributed > 0 && (
                  <p className="mt-2.5 text-[11.5px] font-semibold text-orbit-text-mute leading-relaxed">
                    Plus {unattributed} session{unattributed === 1 ? '' : 's'} the sheet records without a subject or date
                    {analytics?.unattributedAtt?.present != null ? ` (${analytics.unattributedAtt.present} present, ${analytics.unattributedAtt.absent} absent)` : ''}
                    , counted in the totals above.
                  </p>
                )}
              </>
            )}
          </section>

          {/* ---- Trend + recent ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <p className="or-kicker mb-2.5">Attendance trend</p>
              <OrbitCard className="h-full">
                {trend.filter((w) => w.total > 0).length < 2 ? (
                  <OrbitEmptyState icon={TrendingUp} title="Not enough data yet." sub="Attendance is tracked week by week as the Excel sheet syncs." compact />
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <Donut pct={overall?.pct ?? 0} size={80} stroke={9} color={overall?.pct >= 75 ? '#34d399' : overall?.pct >= 70 ? '#f59e0b' : '#fb7185'}>
                        <span className="text-[15px] font-extrabold text-orbit-text">{overall?.pct ?? '—'}%</span>
                      </Donut>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-orbit-text">Overall attendance</p>
                        <p className="text-[12px] text-orbit-text-mute mt-0.5">{overall?.present ?? 0} present of {overall?.total ?? 0} recorded classes</p>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-orbit-border">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-3">Present per week</p>
                      <MiniBars
                        data={trend.map((w) => ({
                          label: fmtDate(w.start, { day: 'numeric', month: 'short' }),
                          value: w.total ? w.present : null,
                          color: '#34d399',
                        }))}
                        height={130}
                      />
                    </div>
                  </>
                )}
              </OrbitCard>
            </div>

            <div className="lg:col-span-3">
              <p className="or-kicker mb-2.5">Recent attendance</p>
              <OrbitCard className="overflow-x-auto h-full">
                {records.length === 0 ? (
                  <OrbitEmptyState icon={CloudUpload} title="Not enough data yet." sub="Attendance appears here after the Excel sheet syncs." compact />
                ) : (
                  <table className="or-table w-full min-w-[420px]">
                    <thead>
                      <tr><th className="text-left">Date</th><th className="text-left">Subject</th><th className="text-left">Status</th><th className="text-left">Source</th></tr>
                    </thead>
                    <tbody>
                      {[...records].sort((a, b) => ((a.class_date ?? '') < (b.class_date ?? '') ? 1 : -1)).slice(0, 15).map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap">{r.class_date ? fmtDate(r.class_date) : 'Undated'}</td>
                          <td>{recordLabel(r, subjects)}</td>
                          <td><OrbitBadge tone={r.status === 'present' ? 'green' : 'coral'}>{r.status === 'present' ? 'Present' : 'Absent'}</OrbitBadge></td>
                          <td><span className="text-[11.5px] text-orbit-text-mute">{sourceLabel(r)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </OrbitCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SubjectAttendanceCard({ s, records, targetInput, setTargetInput }) {
  const target = targetInput[s.subjectId] ?? s.required ?? 75;
  const proj = attendanceProjection(records.filter((r) => r.subject_id === s.subjectId), 1);
  const toTarget = classesToTarget(records.filter((r) => r.subject_id === s.subjectId), Number(target));
  const low = s.total > 0 && s.pct != null && s.pct < s.required;

  return (
    <OrbitCard className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[14px] font-bold text-orbit-text truncate">{s.name}</p>
        {low && <OrbitBadge tone="coral">Below {s.required}%</OrbitBadge>}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[28px] font-extrabold text-orbit-text leading-none">{s.pct != null ? `${s.pct}%` : '—'}</span>
        <span className="text-[12px] font-semibold text-orbit-text-mute">{s.present}/{s.total} · required {s.required}%</span>
      </div>
      <OrbitProgress value={s.pct} tone={low ? '#fb7185' : '#34d399'} />

      {/* What-if projection — derived from the same synced records. */}
      {s.total > 0 && (
        <div className="mt-3.5 p-3 rounded-xl bg-orbit-bg/10">
          <p className="or-kicker mb-2 flex items-center gap-1"><Calculator className="w-3 h-3" strokeWidth={2.4} /> What if…</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-orbit-text-soft">
            <span>Attend next → <b style={{ color: '#34d399' }}>{proj.attend != null ? `${proj.attend}%` : '—'}</b></span>
            <span>Miss next → <b style={{ color: '#fb7185' }}>{proj.miss != null ? `${proj.miss}%` : '—'}</b></span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-orbit-border text-[12px] font-semibold text-orbit-text-mute">
            <span>Reach</span>
            <input type="number" min="1" max="100" value={target} onChange={(e) => setTargetInput((p) => ({ ...p, [s.subjectId]: e.target.value }))} className="or-input w-16 px-2 py-1 text-xs" />
            <span>% → attend</span>
            <span style={{ color: '#8b5cf6' }} className="font-bold">
              {toTarget.feasible ? (toTarget.need === 0 ? 'already there ✓' : `${toTarget.need} in a row`) : 'not reachable'}
            </span>
          </div>
        </div>
      )}
    </OrbitCard>
  );
}