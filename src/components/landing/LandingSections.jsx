// Post-hero landing sections. Same visual language: black space,
// glass panels, violet/cyan accents, scroll reveals.

import { CheckCircle2 } from 'lucide-react';

/* ---------------- 1. Academic Universe ---------------- */
export function UniverseSection() {
  return (
    <section className="ob-sec" id="ob-about">
      <div className="ob-sec-head center ob-reveal">
        <span className="ob-kicker">One system</span>
        <h2 className="ob-h2">Your academic universe, connected</h2>
        <p className="ob-lead">
          Most students juggle five apps and a pile of notebooks. Orbit puts your classes,
          deadlines, marks, attendance and study time into a single system — where every
          piece of information updates everything else.
        </p>
      </div>
      <div className="ob-band">
        {[
          ['1', 'connected workspace'],
          ['13+', 'event & task types'],
          ['100%', 'of your marks tracked'],
          ['0', 'deadlines missed'],
        ].map(([n, l], i) => (
          <div key={l} className="ob-reveal" style={{ ['--rd']: `${i * 0.08}s` }}>
            <b>{n}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- shared split layout ---------------- */
function Split({ kicker, title, lead, bullets, visual, reverse, id }) {
  return (
    <div className={`ob-split ${reverse ? 'ob-split-rev' : ''}`}>
      <div className="ob-sec-head ob-reveal" style={{ paddingTop: 8 }}>
        <span className="ob-kicker">{kicker}</span>
        <h2 className="ob-h2">{title}</h2>
        <p className="ob-lead">{lead}</p>
        {bullets && (
          <ul style={{ margin: '22px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bullets.map((b) => (
              <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#c9c5de', fontSize: 14.5, fontWeight: 600 }}>
                <CheckCircle2 size={16} color="#6ee7b7" /> {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ob-visual ob-reveal" id={id} style={{ ['--rd']: '0.12s' }}>
        <div className="ob-visual-bar"><i /><i /><i /></div>
        {visual}
      </div>
    </div>
  );
}

/* ---------------- 2. Class Schedule ---------------- */
export function ScheduleSection() {
  return (
    <div className="ob-sec">
      <Split
        kicker="Class Schedule"
        title="Know what's next, every day"
        lead="Build your weekly timetable once. Orbit shows today's classes with live status — upcoming, ongoing, done — and pulls them straight onto your dashboard."
        bullets={['Recurring weekly slots', 'Faculty & room at a glance', 'Attendance synced from your Excel sheet']}
        visual={(
          <div>
            {[
              ['Java Programming', '09:00 – 10:00 · LH-3', 'ongoing', ''],
              ['Mathematics II', '10:00 – 11:00 · LH-1', 'upcoming', 'p'],
              ['Data Structures', '11:30 – 12:30 · LH-2', 'upcoming', 'c'],
            ].map(([name, time, tag, tone]) => (
              <div className="ob-vrow" key={name}>
                <span className={`ob-vdot ${tone}`} />
                <div><b>{name}</b><br /><span>{time}</span></div>
                <span className={`ob-vtag ${tone}`}>{tag}</span>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}

/* ---------------- 3. Academic Calendar ---------------- */
export function CalendarSection() {
  const cells = Array.from({ length: 28 }, (_, i) => {
    if ([2, 9, 16].includes(i)) return 'exam';
    if ([5, 12, 13, 19, 20, 24].includes(i)) return 'ev';
    return '';
  });
  return (
    <div className="ob-sec">
      <Split
        reverse
        kicker="Academic Calendar"
        title="Every deadline in orbit"
        lead="Semester dates, exams, holidays, project deadlines — with automatic countdowns like “5 days remaining”, feeding your dashboard and reminders."
        visual={(
          <div>
            <div className="ob-cal">
              {cells.map((c, i) => <i key={i} className={c} />)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span className="ob-vtag">Mid-sem · 18d</span>
              <span className="ob-vtag p">Project due · 5d</span>
              <span className="ob-vtag c">Quiz · tomorrow</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}

/* ---------------- 4. Tests & Marks ---------------- */
export function TestsSection() {
  return (
    <div className="ob-sec">
      <Split
        kicker="Tests & Marks"
        title="See your growth"
        lead="Record every test once. Percentages, subject averages and trends are calculated instantly — so you always know exactly where you stand."
        visual={(
          <div>
            {[
              ['Java Class Test 2', '39/50', '78%', ''],
              ['DS Quiz 1', '17/20', '85%', 'p'],
              ['Maths Test 1', '27/40', '67.5%', 'c'],
            ].map(([name, score, pct, tone]) => (
              <div className="ob-vrow" key={name}>
                <div><b>{name}</b><br /><span>{score}</span></div>
                <span className={`ob-vtag ${tone}`}>{pct}</span>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}

/* ---------------- 5. Assignments ---------------- */
export function AssignmentsSection() {
  return (
    <div className="ob-sec">
      <Split
        reverse
        kicker="Assignments"
        title="Never miss a deadline"
        lead="Assignments, labs, projects and submissions — sorted into overdue, due today and this week. Mark them done and watch your completion rate climb."
        bullets={['Priority & status flow', 'Submission links attached', 'Overdue warnings that actually help']}
        visual={(
          <div>
            {[
              ['Java Assignment 3', 'Due in 3 days', 'in progress', 'p'],
              ['DE Worksheet 3', 'Due today', 'not started', 'c'],
              ['Maths Problem Set 4', 'Overdue · 2 days', 'overdue', ''],
            ].map(([name, due, tag, tone]) => (
              <div className="ob-vrow" key={name}>
                <span className={`ob-vdot ${tone}`} />
                <div><b>{name}</b><br /><span>{due}</span></div>
                <span className={`ob-vtag ${tone}`}>{tag}</span>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
