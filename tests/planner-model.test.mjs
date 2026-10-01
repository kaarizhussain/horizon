import test from 'node:test';
import assert from 'node:assert/strict';
import { draftPlan, replanRemaining, timelineLayout, partitionBoard, taskFingerprint, normalizePlanFingerprint, focusElapsedMs, recordFocus, recordedFocusSamples, minutesFromTime, workspaceKey, readWorkspace, writeWorkspace } from '../planner-model.mjs';

test('planner preserves completed work and keeps every proposed block inside the window', () => {
  const tasks = [{ id: 'done', done: true, estimate_min: 100 }, { id: 'a', text: 'Resume', estimate_min: 45 }, { id: 'b', text: 'Apply', estimate_min: 30 }, { id: 'c', text: 'Follow up', estimate_min: 15 }];
  const plan = draftPlan(tasks, { start: '09:00', end: '10:30', buffer: 15 });
  assert.deepEqual(plan.blocks.map(b => b.id), ['a', 'b']);
  assert.equal(plan.blocks[1].end, '10:15');
  assert.equal(plan.planned, 75);
  assert.equal(plan.omitted[0].id, 'c');
  assert.equal(tasks[0].done, true);
});

test('missing estimates stay unscheduled rather than silently consuming zero minutes', () => {
  const plan = draftPlan([{ id: 'unknown', text: 'Unknown' }, { id: 'known', text: 'Known', estimate_min: 15 }], { start: '23:00', end: '23:59', buffer: 0 });
  assert.deepEqual(plan.blocks.map(b => b.id), ['known']);
  assert.equal(plan.omitted[0].reason, 'Needs an estimate');
});

test('invalid windows and buffers cannot produce an accepted draft', () => {
  assert.equal(minutesFromTime('25:00'), null);
  assert.equal(minutesFromTime('09:60'), null);
  for (const settings of [{ start: '17:00', end: '09:00', buffer: 15 }, { start: '09:00', end: '09:15', buffer: 15 }, { start: '09:00', end: '12:00', buffer: -1 }]) assert.throws(() => draftPlan([], settings));
});

test('completion preserves a schedule while timing edits invalidate it', () => {
  const task = { id: 'a', text: 'Task', estimate_min: 30, done: false };
  const original = taskFingerprint([task]);
  assert.equal(original, taskFingerprint([{ ...task, done: true }]));
  assert.notEqual(original, taskFingerprint([{ ...task, estimate_min: 60 }]));
  assert.equal(normalizePlanFingerprint(JSON.stringify([['a', 'Task', false, 30]])), original);
});

test('browser drafts survive reload and are isolated by account and local day', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const a = workspaceKey('user-a'), b = workspaceKey('user-b');
  const plan = { ...draftPlan([{ id: 'task', text: 'Work', estimate_min: 30 }], { start: '09:00', end: '10:00', buffer: 15 }), date: '2026-09-29' };
  writeWorkspace(storage, a, { inbox: [{ id: 'draft', text: 'Capture' }], plan });
  assert.deepEqual(readWorkspace(storage, a, '2026-09-29').plan.blocks, plan.blocks);
  assert.equal(readWorkspace(storage, b, '2026-09-29').inbox.length, 0);
  assert.equal(readWorkspace(storage, a, '2026-09-30').plan, null);
  assert.equal(readWorkspace(storage, a, '2026-09-30').inbox[0].text, 'Capture');
  assert.equal(workspaceKey('user-a', true), null);
  const legacy = { ...plan, fingerprint: JSON.stringify([['task', 'Work', false, 30]]) };
  writeWorkspace(storage, a, { inbox: [], plan: legacy });
  assert.equal(readWorkspace(storage, a, '2026-09-29').plan.fingerprint, taskFingerprint([{ id: 'task', text: 'Work', estimate_min: 30 }]));
});

test('storage failures are observable, and malformed plans cannot restore blocks', () => {
  assert.throws(() => writeWorkspace({ setItem: () => { throw new Error('Quota exceeded'); } }, 'account', { inbox: [] }), /Quota/);
  assert.throws(() => readWorkspace({ getItem: () => '{broken' }, 'account', '2026-09-29'));
  const storage = { getItem: () => JSON.stringify({ inbox: [{ id: 'ok', text: 'Retain draft' }], plan: { date: '2026-09-29', fingerprint: 'bad', blocks: [{ start: 'invalid' }] } }) };
  assert.equal(readWorkspace(storage, 'account', '2026-09-29').plan, null);
  assert.equal(readWorkspace(storage, 'account', '2026-09-29').inbox[0].text, 'Retain draft');
});

test('focus time records elapsed work without counting a closed or backgrounded tab', () => {
  const running = { taskId: 'task', date: '2026-09-29', accumulatedMs: 30000, startedAt: 100000 };
  assert.equal(focusElapsedMs(running, 145000), 75000);
  const task = { id: 'task', estimate_min: 2 };
  const work = recordFocus({}, running, task, '2026-09-29', 145000);
  assert.equal(work.task.ms, 75000);
  assert.equal(recordFocus(work, { taskId: 'task', accumulatedMs: 45000, startedAt: null }, task, '2026-09-29').task.ms, 120000);
  assert.throws(() => recordFocus({}, { taskId: 'other', accumulatedMs: 5000 }, task, '2026-09-29'));
  const saved = { inbox: [], work, focus: { ...running, accumulatedMs: 70000 } };
  const restored = readWorkspace({ getItem: () => JSON.stringify(saved) }, 'account', '2026-09-29');
  assert.equal(restored.focus.startedAt, null);
  assert.equal(restored.focus.accumulatedMs, 70000);
  assert.equal(recordedFocusSamples(restored.work, '2026-09-01').length, 1);
  assert.equal(recordedFocusSamples(restored.work, '2026-09-30').length, 0);
});

test('replan retains completed blocks and puts remaining work after now and completed time', () => {
  const tasks = [{ id: 'a', text: 'Resume', estimate_min: 45 }, { id: 'b', text: 'Apply', estimate_min: 30 }];
  const settings = { start: '09:00', end: '17:00', buffer: 15 };
  const original = draftPlan(tasks, settings);
  tasks[0].done = true;
  const plan = replanRemaining(tasks, settings, original, 10 * 60);
  assert.deepEqual(plan.blocks[0], original.blocks[0]);
  assert.equal(plan.blocks[1].start, '10:00');
  assert.equal(plan.blocks[1].end, '10:30');
  assert.equal(tasks[0].done, true);
  assert.equal(replanRemaining(tasks, settings, original, 9 * 60).blocks[1].start, '09:45');
});

test('a replan after the window retains history and leaves remaining work unscheduled', () => {
  const tasks = [{ id: 'a', text: 'Done', done: true }, { id: 'b', text: 'Remaining', estimate_min: 30 }];
  const accepted = { blocks: [{ id: 'a', text: 'Done', start: '09:00', end: '09:30', minutes: 30 }] };
  const plan = replanRemaining(tasks, { start: '09:00', end: '10:00', buffer: 15 }, accepted, 12 * 60);
  assert.deepEqual(plan.blocks, accepted.blocks);
  assert.equal(plan.omitted[0].id, 'b');
  assert.equal(plan.available, 0);
  assert.throws(() => replanRemaining(tasks, { start: '09:00', end: '08:00', buffer: 15 }, accepted, 12 * 60));
});

test('overnight rollover promotes tomorrow and rolls unfinished work without mixing dates', () => {
  const periods = { day: '2026-09-30', tomorrow: '2026-10-01', week: '2026-09-28', month: '2026-09-01', year: '2026-01-01' };
  const rows = [{ id: 'old', horizon: 'day', period: '2026-09-29', done: false }, { id: 'done', horizon: 'day', period: '2026-09-29', done: true }, { id: 'tomorrow', horizon: 'day', period: '2026-09-30', done: false }, { id: 'future', horizon: 'day', period: '2026-10-01', done: false }];
  const board = partitionBoard(rows, periods, true);
  assert.deepEqual(board.day.map(t => t.id), ['old', 'tomorrow']);
  assert.deepEqual(board.tomorrow.map(t => t.id), ['future']);
  assert.ok(board.day.every(t => t.period === periods.day));
  assert.equal(rows[0].period, '2026-09-29');
});

test('timeline positions represent real start times and durations, including outside default hours', () => {
  const layout = timelineLayout([{ id: 'early', start: '08:30', end: '09:00' }, { id: 'work', start: '10:00', end: '10:45' }, { id: 'late', start: '18:00', end: '18:30' }]);
  assert.equal(layout.from, 8 * 60);
  assert.equal(layout.to, 19 * 60);
  assert.equal(layout.blocks[0].top, 45);
  assert.equal(layout.blocks[1].height, 67.5);
  assert.ok(layout.blocks.every(block => block.top >= 0 && block.top + block.height <= layout.height));
});

test('timeline omits invalid intervals and keeps an empty schedule visible', () => {
  const layout = timelineLayout([null, { start: '12:00', end: '11:00' }, { start: 'invalid', end: '12:00' }], null);
  assert.equal(layout.blocks.length, 0);
  assert.equal(layout.from, 9 * 60);
  assert.equal(layout.to, 17 * 60);
  assert.equal(layout.height, 720);
});
