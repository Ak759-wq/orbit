// Shared constants: every option list used by forms, filters and badges.

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EVENT_TYPES = [
  { value: 'semester_start', label: 'Semester Start' },
  { value: 'semester_end', label: 'Semester End' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'exam', label: 'Exam' },
  { value: 'midsem', label: 'Mid-Semester Exam' },
  { value: 'endsem', label: 'End-Semester Exam' },
  { value: 'assignment', label: 'Assignment Deadline' },
  { value: 'project', label: 'Project Deadline' },
  { value: 'practical', label: 'Practical Exam' },
  { value: 'internal', label: 'Internal Assessment' },
  { value: 'college_event', label: 'College Event' },
  { value: 'break', label: 'Break' },
  { value: 'other', label: 'Other' },
];

export const TEST_TYPES = [
  { value: 'class_test', label: 'Class Test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'internal', label: 'Internal Assessment' },
  { value: 'midsem', label: 'Mid-Semester' },
  { value: 'endsem', label: 'End-Semester' },
  { value: 'practical', label: 'Practical' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'other', label: 'Other' },
];

export const TASK_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
  { value: 'lab', label: 'Lab Work' },
  { value: 'study_task', label: 'Study Task' },
  { value: 'submission', label: 'Submission' },
  { value: 'other', label: 'Other' },
];

export const TASK_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export const SESSION_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export const RESOURCE_TYPES = [
  { value: 'note', label: 'Notes' },
  { value: 'link', label: 'Important Link' },
  { value: 'document', label: 'Document' },
  { value: 'video', label: 'Video' },
  { value: 'practice', label: 'Practice Resource' },
  { value: 'reference', label: 'Reference Material' },
];

export const GOAL_TYPES = [
  { value: 'manual', label: 'Manual Progress' },
  { value: 'attendance', label: 'Attendance % (auto)' },
  { value: 'test_average', label: 'Test Average % (auto)' },
  { value: 'assignments_completed', label: 'Assignments Completed (auto)' },
  { value: 'study_hours', label: 'Study Hours (auto)' },
];

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export const NOTIFICATION_TYPES = [
  { value: 'upcoming_test', label: 'Upcoming tests' },
  { value: 'assignment_deadline', label: 'Assignment deadlines' },
  { value: 'overdue_assignment', label: 'Overdue assignments' },
  { value: 'upcoming_exam', label: 'Upcoming exams' },
  { value: 'low_attendance', label: 'Low attendance warnings' },
  { value: 'study_session', label: "Today's study sessions" },
  { value: 'academic_event', label: 'Academic events' },
];

// value → { label, bg, text } for badge chips
export const EVENT_TYPE_STYLE = {
  semester_start: { label: 'Semester Start', bg: '#d3f5e3' },
  semester_end: { label: 'Semester End', bg: '#ffe8c7' },
  holiday: { label: 'Holiday', bg: '#e2f5b8' },
  exam: { label: 'Exam', bg: '#ffe1d6' },
  midsem: { label: 'Mid-Sem', bg: '#ff6b4a' },
  endsem: { label: 'End-Sem', bg: '#ff6b4a' },
  assignment: { label: 'Assignment', bg: '#d9ebff' },
  project: { label: 'Project', bg: '#ddd6ff' },
  practical: { label: 'Practical', bg: '#d9ebff' },
  internal: { label: 'Internal', bg: '#ddd6ff' },
  college_event: { label: 'College Event', bg: '#ffc900' },
  break: { label: 'Break', bg: '#e2f5b8' },
  other: { label: 'Other', bg: '#f6f1e7' },
};

export const PRIORITY_STYLE = {
  low: { label: 'Low', bg: '#f6f1e7', text: '#4a463d' },
  normal: { label: 'Normal', bg: '#d9ebff', text: '#141414' },
  high: { label: 'High', bg: '#ffe1d6', text: '#141414' },
};

export const STATUS_STYLE = {
  not_started: { label: 'Not Started', bg: '#f6f1e7', text: '#4a463d' },
  in_progress: { label: 'In Progress', bg: '#ffc900', text: '#141414' },
  completed: { label: 'Completed', bg: '#d3f5e3', text: '#141414' },
  planned: { label: 'Planned', bg: '#d9ebff', text: '#141414' },
};

export const SUBJECT_COLORS = [
  '#7c63f5', '#57a8ff', '#34c77b', '#ff9e2c', '#ff6b4a',
  '#ffc900', '#e564b4', '#2bb3a3', '#8a8474', '#4d5fd1',
];

export const labelOf = (list, value) => list.find((x) => x.value === value)?.label ?? value;
