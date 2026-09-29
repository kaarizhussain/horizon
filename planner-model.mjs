export function minutesFromTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function timeFromMinutes(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function timelineLayout(blocks, settings = {}) {
  const { start = '09:00', end = '17:00' } = settings || {};
  const valid = blocks.filter(block => block && minutesFromTime(block.start) !== null && minutesFromTime(block.end) > minutesFromTime(block.start));
  const from = Math.floor(Math.min(minutesFromTime(start) ?? 540, ...valid.map(block => minutesFromTime(block.start))) / 60) * 60;
  const to = Math.min(1440, Math.ceil(Math.max(minutesFromTime(end) ?? 1020, from + 60, ...valid.map(block => minutesFromTime(block.end))) / 60) * 60);
  return { from, to, height: (to - from) * 1.5, blocks: valid.map(block => ({ ...block, top: (minutesFromTime(block.start) - from) * 1.5, height: (minutesFromTime(block.end) - minutesFromTime(block.start)) * 1.5 })) };
}

export function taskFingerprint(tasks) {
  return JSON.stringify(tasks.map(task => [task.id, task.text, task.estimate_min || null]));
}

export function normalizePlanFingerprint(value) {
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows) || !rows.every(row => Array.isArray(row) && (row.length === 3 || row.length === 4))) return value;
    return JSON.stringify(rows.map(row => row.length === 4 ? [row[0], row[1], row[3]] : row));
  } catch { return value; }
}

export function workspaceKey(userId, demo = false) {
  return !demo && userId ? `horizon.workspace.v1.${userId}` : null;
}

export function focusElapsedMs(focus, now = Date.now()) {
  if (!focus) return 0;
  return Math.max(0, Math.floor(focus.accumulatedMs || 0) + (focus.startedAt ? Math.max(0, now - focus.startedAt) : 0));
}

export function recordFocus(work, focus, task, date, now = Date.now()) {
  const elapsed = focusElapsedMs(focus, now);
  if (!focus || !task || focus.taskId !== task.id || elapsed < 1000) throw new Error('Start a focus session before saving time.');
  const previous = work[task.id];
  return { ...work, [task.id]: { ms: (previous?.ms || 0) + elapsed, estimateMin: task.estimate_min || previous?.estimateMin || null, date } };
}

export function recordedFocusSamples(work, sinceDate = '0000-01-01') {
  return Object.values(work).filter(sample => sample.date >= sinceDate && sample.ms >= 1000 && Number.isFinite(sample.estimateMin) && sample.estimateMin > 0);
}

export function readWorkspace(storage, key, date) {
  const empty = { inbox: [], plan: null, work: {}, focus: null };
  if (!key) return empty;
  const saved = JSON.parse(storage.getItem(key) || 'null');
  if (!saved || !Array.isArray(saved.inbox)) return empty;
  const inbox = saved.inbox.filter(t => t && typeof t.id === 'string' && typeof t.text === 'string').map(t => ({ id: t.id, text: t.text.slice(0, 200) }));
  const work = {};
  if (saved.work && typeof saved.work === 'object' && !Array.isArray(saved.work)) {
    for (const [id, sample] of Object.entries(saved.work)) {
      if (typeof id === 'string' && sample && Number.isFinite(sample.ms) && sample.ms >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(sample.date) && (sample.estimateMin === null || (Number.isInteger(sample.estimateMin) && sample.estimateMin > 0))) work[id] = sample;
    }
  }
  const savedFocus = saved.focus;
  const focus = savedFocus?.date === date && typeof savedFocus.taskId === 'string' && Number.isFinite(savedFocus.accumulatedMs) && savedFocus.accumulatedMs >= 0
    ? { taskId: savedFocus.taskId, taskText: typeof savedFocus.taskText === 'string' ? savedFocus.taskText.slice(0, 200) : 'Saved task', estimateMin: Number.isInteger(savedFocus.estimateMin) && savedFocus.estimateMin > 0 ? savedFocus.estimateMin : null, date, accumulatedMs: savedFocus.accumulatedMs, startedAt: null } : null;
  const plan = saved.plan;
  const valid = plan?.date === date && typeof plan.fingerprint === 'string' && Array.isArray(plan.blocks) && plan.blocks.every(b => b && typeof b.id === 'string' && typeof b.text === 'string' && minutesFromTime(b.start) !== null && minutesFromTime(b.end) !== null && Number.isInteger(b.minutes) && b.minutes > 0);
  return { inbox, plan: valid ? { ...plan, fingerprint: normalizePlanFingerprint(plan.fingerprint) } : null, work, focus };
}

export function writeWorkspace(storage, key, snapshot) {
  if (!key) throw new Error('An account is required to save browser drafts.');
  storage.setItem(key, JSON.stringify(snapshot));
}

export function partitionBoard(rows, periods, rollUnfinished = false) {
  const board = { day: [], tomorrow: [], week: [], month: [], year: [] };
  for (const original of rows) {
    const task = rollUnfinished && original.horizon === 'day' && !original.done && original.period < periods.day
      ? { ...original, period: periods.day } : original;
    const column = task.horizon === 'day' && task.period === periods.tomorrow ? 'tomorrow' : task.horizon;
    if (board[column] && task.period === periods[column]) board[column].push(task);
  }
  return board;
}

export function replanRemaining(tasks, settings, accepted, nowMinutes) {
  draftPlan([], settings); // Validate the user's window even when nothing remains.
  const completed = (accepted?.blocks || []).filter(block => tasks.some(task => task.id === block.id && task.done));
  const boundary = Math.max(minutesFromTime(settings.start) ?? 0, nowMinutes, ...completed.map(block => minutesFromTime(block.end) ?? 0));
  const finish = minutesFromTime(settings.end);
  const reserve = Number(settings.buffer);
  if (finish === null || !Number.isInteger(reserve) || reserve < 0 || reserve > 120) throw new Error('Choose a valid finish time and buffer.');
  if (boundary >= finish - reserve) {
    return { blocks: completed, omitted: tasks.filter(t => !t.done).map(t => ({ id: t.id, text: t.text, reason: 'No time remains in the window' })), available: 0, planned: 0, settings, fingerprint: taskFingerprint(tasks), boundary };
  }
  const remaining = draftPlan(tasks, { ...settings, start: timeFromMinutes(boundary) });
  return { ...remaining, blocks: [...completed, ...remaining.blocks], settings, boundary };
}

// A manual task-only draft, not a claim about free calendar time.
export function draftPlan(tasks, { start, end, buffer = 15 }) {
  const from = minutesFromTime(start), to = minutesFromTime(end);
  const reserve = Number(buffer);
  if (from === null || to === null || to <= from) throw new Error('Choose a finish time after the start time.');
  if (!Number.isInteger(reserve) || reserve < 0 || reserve > 120 || reserve >= to - from) throw new Error('Choose a buffer smaller than your planning window (0–120 minutes).');
  const blocks = [], omitted = [];
  let cursor = from;
  for (const task of tasks) {
    if (task.done) continue;
    const estimate = Number(task.estimate_min);
    if (!Number.isInteger(estimate) || estimate < 1 || estimate > 600) {
      omitted.push({ id: task.id, text: task.text, reason: 'Needs an estimate' });
      continue;
    }
    if (cursor + estimate > to - reserve) {
      omitted.push({ id: task.id, text: task.text, reason: 'Does not fit the window' });
      continue;
    }
    blocks.push({ id: task.id, text: task.text, start: timeFromMinutes(cursor), end: timeFromMinutes(cursor + estimate), minutes: estimate });
    cursor += estimate;
  }
  return { blocks, omitted, available: to - from - reserve, planned: cursor - from, settings: { start, end, buffer: reserve }, fingerprint: taskFingerprint(tasks) };
}
