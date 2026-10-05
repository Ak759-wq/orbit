// Demo data generator. Every row is tagged is_demo=true so it can
// be cleared without touching real data. Dates are generated
// relative to "today" so the dashboard/analytics always have a
// living semester to show.

import { todayISO, addDaysISO, dayOfWeek } from '../lib/datetime.js';

function d(offset) { return addDaysISO(todayISO(), offset); }
function t(hm) { return `${String(hm).padStart(4, '0').slice(0, 2)}:${String(hm).padStart(4, '0').slice(2)}`; }

export function buildDemoData() {
  const today = todayISO();
  const dow = dayOfWeek(today);

  const subjects = [
    { name: 'Java Programming', code: 'CS201', faculty: 'Dr. Rao', credits: 4, target_percentage: 85, attendance_required_pct: 75, color: '#7c63f5', description: 'OOP, collections, threads and spring basics.' },
    { name: 'Mathematics II', code: 'MA202', faculty: 'Prof. Iyer', credits: 4, target_percentage: 80, attendance_required_pct: 75, color: '#57a8ff', description: 'Linear algebra, probability and statistics.' },
    { name: 'Data Structures', code: 'CS210', faculty: 'Dr. Menon', credits: 3, target_percentage: 85, attendance_required_pct: 80, color: '#34c77b', description: 'Trees, graphs, hashing and complexity.' },
    { name: 'Digital Electronics', code: 'EC204', faculty: 'Dr. Fernandes', credits: 3, target_percentage: 75, attendance_required_pct: 70, color: '#ff9e2c', description: 'Logic gates, flip-flops and finite state machines.' },
  ];

  // Weekly schedule (day_of_week uses JS getDay(): 0=Sun)
  const schedule = [
    { subject: 'Java Programming', room: 'LH-3', day_of_week: 1, start_time: t(900), end_time: t(1000), notes: '' },
    { subject: 'Mathematics II', room: 'LH-1', day_of_week: 1, start_time: t(1000), end_time: t(1100), notes: '' },
    { subject: 'Data Structures', room: 'LH-2', day_of_week: 1, start_time: t(1130), end_time: t(1230), notes: 'Bring laptop' },
    { subject: 'Java Programming', room: 'Lab-2', day_of_week: 1, start_time: t(1400), end_time: t(1600), notes: 'Lab session' },
    { subject: 'Mathematics II', room: 'LH-1', day_of_week: 2, start_time: t(900), end_time: t(1000), notes: '' },
    { subject: 'Data Structures', room: 'LH-2', day_of_week: 2, start_time: t(1100), end_time: t(1200), notes: '' },
    { subject: 'Digital Electronics', room: 'EC-1', day_of_week: 2, start_time: t(1400), end_time: t(1500), notes: '' },
    { subject: 'Java Programming', room: 'LH-3', day_of_week: 3, start_time: t(900), end_time: t(1000), notes: '' },
    { subject: 'Mathematics II', room: 'LH-1', day_of_week: 3, start_time: t(1000), end_time: t(1100), notes: '' },
    { subject: 'Data Structures', room: 'LH-2', day_of_week: 3, start_time: t(1130), end_time: t(1230), notes: '' },
    { subject: 'Digital Electronics', room: 'EC-1', day_of_week: 3, start_time: t(1400), end_time: t(1500), notes: '' },
    { subject: 'Mathematics II', room: 'LH-1', day_of_week: 4, start_time: t(900), end_time: t(1000), notes: '' },
    { subject: 'Java Programming', room: 'LH-3', day_of_week: 4, start_time: t(1100), end_time: t(1200), notes: '' },
    { subject: 'Data Structures', room: 'Lab-1', day_of_week: 4, start_time: t(1400), end_time: t(1600), notes: 'Lab session' },
    { subject: 'Digital Electronics', room: 'EC-1', day_of_week: 5, start_time: t(900), end_time: t(1000), notes: '' },
    { subject: 'Data Structures', room: 'LH-2', day_of_week: 5, start_time: t(1100), end_time: t(1200), notes: '' },
  ];

  const events = [
    { title: 'Semester Start', event_type: 'semester_start', start_date: d(-35), end_date: d(-35), priority: 'normal', description: 'Odd semester 2026-27 begins.' },
    { title: 'Java Internal Test', event_type: 'internal', start_date: d(5), end_date: d(5), priority: 'high', subject: 'Java Programming', description: 'Units 1-3. Closed book.' },
    { title: 'Mid-Semester Exams', event_type: 'midsem', start_date: d(18), end_date: d(24), priority: 'high', description: 'All subjects, detailed timetable on notice board.' },
    { title: 'DS Quiz 2', event_type: 'internal', start_date: d(9), end_date: d(9), priority: 'normal', subject: 'Data Structures', description: 'Trees and graphs.' },
    { title: 'Project Proposal Deadline', event_type: 'project', start_date: d(12), end_date: d(12), priority: 'high', subject: 'Java Programming', description: 'Submit via portal.' },
    { title: 'Founder\u2019s Day', event_type: 'college_event', start_date: d(15), end_date: d(15), priority: 'low', description: 'College festival, no classes.' },
    { title: 'Dussehra Holiday', event_type: 'holiday', start_date: d(21), end_date: d(23), priority: 'normal', description: 'College closed.' },
    { title: 'End-Semester Exams', event_type: 'endsem', start_date: d(60), end_date: d(72), priority: 'high', description: 'Theory exams.' },
    { title: 'Semester End', event_type: 'semester_end', start_date: d(80), end_date: d(80), priority: 'normal', description: 'Semester closes.' },
  ];

  const tests = [
    { name: 'Java Class Test 1', subject: 'Java Programming', test_type: 'class_test', test_date: d(-28), max_marks: 50, marks_obtained: 31, topic: 'OOP basics' },
    { name: 'Java Quiz 1', subject: 'Java Programming', test_type: 'quiz', test_date: d(-14), max_marks: 20, marks_obtained: 15, topic: 'Inheritance' },
    { name: 'Java Class Test 2', subject: 'Java Programming', test_type: 'class_test', test_date: d(-4), max_marks: 50, marks_obtained: 39, topic: 'Collections' },
    { name: 'Maths Test 1', subject: 'Mathematics II', test_type: 'class_test', test_date: d(-21), max_marks: 40, marks_obtained: 27, topic: 'Matrices' },
    { name: 'Maths Quiz 1', subject: 'Mathematics II', test_type: 'quiz', test_date: d(-7), max_marks: 20, marks_obtained: 12, topic: 'Probability' },
    { name: 'DS Class Test 1', subject: 'Data Structures', test_type: 'class_test', test_date: d(-18), max_marks: 50, marks_obtained: 38, topic: 'Linked lists, stacks' },
    { name: 'DS Quiz 1', subject: 'Data Structures', test_type: 'quiz', test_date: d(-6), max_marks: 20, marks_obtained: 17, topic: 'Trees' },
    { name: 'DE Class Test 1', subject: 'Digital Electronics', test_type: 'class_test', test_date: d(-10), max_marks: 30, marks_obtained: 18, topic: 'K-maps' },
  ];

  const assignments = [
    { title: 'Java Assignment 3: Collections', subject: 'Java Programming', task_type: 'assignment', due_date: d(3), priority: 'high', status: 'in_progress', description: 'Implement a custom ArrayList and LinkedList.' },
    { title: 'Maths Problem Set 4', subject: 'Mathematics II', task_type: 'homework', due_date: d(-2), priority: 'normal', status: 'not_started', description: 'Probability exercises 4.1-4.12.' },
    { title: 'DS Lab Report 2', subject: 'Data Structures', task_type: 'lab', due_date: d(1), priority: 'normal', status: 'in_progress', description: 'AVL tree rotations report.' },
    { title: 'DE Worksheet 3', subject: 'Digital Electronics', task_type: 'homework', due_date: today, priority: 'high', status: 'not_started', description: 'Flip-flop conversions.' },
    { title: 'Java Assignment 2', subject: 'Java Programming', task_type: 'assignment', due_date: d(-9), priority: 'normal', status: 'completed', description: 'Inheritance hierarchy.' },
    { title: 'Maths Problem Set 3', subject: 'Mathematics II', task_type: 'homework', due_date: d(-5), priority: 'normal', status: 'completed', description: 'Determinants.' },
    { title: 'DS Lab Report 1', subject: 'Data Structures', task_type: 'lab', due_date: d(-12), priority: 'normal', status: 'completed', description: 'Stack/queue implementations.' },
  ];

  // No demo attendance. Attendance is Excel-only and read-only, so the
  // sample semester must not invent P/A marks for the rows the
  // Attendance page, Dashboard, Analytics and Orbit AI all read. A new
  // account syncs the real sheet instead.

  const sessions = [
    { subject: 'Java Programming', topic: 'Collections revision', session_date: d(-2), start_time: t(1700), end_time: t(1830), goal: 'Revise list implementations', status: 'completed' },
    { subject: 'Data Structures', topic: 'AVL rotations practice', session_date: d(-1), start_time: t(1800), end_time: t(1930), goal: '10 rotation problems', status: 'completed' },
    { subject: 'Java Programming', topic: 'Previous year questions', session_date: d(0), start_time: t(1700), end_time: t(1830), goal: 'Solve 2024 paper', status: 'planned' },
    { subject: 'Mathematics II', topic: 'Bayes theorem drills', session_date: d(0), start_time: t(2000), end_time: t(2100), goal: '12 problems', status: 'planned' },
    { subject: 'Data Structures', topic: 'Graph traversals', session_date: d(1), start_time: t(1700), end_time: t(1830), goal: 'BFS + DFS sheet', status: 'planned' },
    { subject: 'Digital Electronics', topic: 'K-map practice', session_date: d(2), start_time: t(1700), end_time: t(1800), goal: 'Worksheet 3 prep', status: 'planned' },
    { subject: 'Java Programming', topic: 'Threads intro', session_date: d(3), start_time: t(1700), end_time: t(1830), goal: 'Read + notes', status: 'planned' },
  ];

  const goals = [
    { name: 'Score 85% in Java', goal_type: 'manual', subject: 'Java Programming', target_value: 85, current_value: 70.6, start_date: d(-35), deadline: d(45) },
    { name: 'Maintain 85% attendance', goal_type: 'attendance', target_value: 85, current_value: 0, start_date: d(-35), deadline: d(45) },
    { name: 'Complete 50 DSA problems', goal_type: 'manual', target_value: 50, current_value: 23, start_date: d(-30), deadline: d(30) },
  ];

  const resources = [
    { title: 'Java Collections cheat sheet', resource_type: 'link', subject: 'Java Programming', url: 'https://docs.oracle.com/javase/8/docs/technotes/guides/collections/', description: 'Official overview.' },
    { title: 'Class notes: Units 1-3', resource_type: 'note', subject: 'Java Programming', content: 'OOP pillars, constructors, inheritance, interfaces, collections intro.', description: 'Compiled lecture notes.' },
    { title: '3Blue1Brown Linear Algebra', resource_type: 'video', subject: 'Mathematics II', url: 'https://www.3blue1brown.com/topics/linear-algebra', description: 'Essence of linear algebra series.' },
    { title: 'LeetCode blind 75', resource_type: 'practice', subject: 'Data Structures', url: 'https://leetcode.com/problem-list/oizxjo/', description: 'Core DSA practice list.' },
    { title: 'DE lab manual', resource_type: 'document', subject: 'Digital Electronics', url: 'https://example.com/de-lab-manual.pdf', description: 'Experiment procedures.' },
    { title: 'NPTEL DSA course', resource_type: 'reference', subject: 'Data Structures', url: 'https://nptel.ac.in/courses/106102064', description: 'Video reference.' },
  ];

  return { subjects, schedule, events, tests, assignments, sessions, goals, resources, dow, today };
}
