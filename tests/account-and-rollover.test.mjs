import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { partitionBoard } from '../planner-model.mjs';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function declaration(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function setup(names, extra = {}) {
  const board = { day: [{ id: 'a', text: 'Private A', horizon: 'day', period: '2026-09-29', done: false }], tomorrow: [], week: [], month: [], year: [] };
  const context = vm.createContext({
    DEMO: false, activeAccount: 'A', sessionVersion: 1, state: board, loadedBoardDate: '2026-09-29',
    profile: {}, habits: [], dayRefresh: null, justAddedId: null,
    periodFor: () => '2026-09-29', tomorrowPeriod: () => '2026-09-30',
    ensureBoardDay: async () => true, toast: () => {}, renderBoard: () => {}, renderChrome: () => {},
    appView: { hidden: true }, partitionBoard, ...extra
  });
  const guards = source.match(/^const (?:captureSession|sessionCurrent) = .*$/gm).join('\n');
  vm.runInContext(guards + '\n' + names.map(declaration).join('\n'), context);
  return context;
}
function switchAccount(context) {
  context.sessionVersion++;
  context.activeAccount = 'B';
  context.state = { day: [], tomorrow: [], week: [], month: [], year: [] };
  context.profile = { user_id: 'B' };
}

for (const action of ['moveTask', 'addGoal', 'editTask']) {
  test(`${action} ignores a successful response after an account switch`, async () => {
    const pending = deferred(), requested = deferred();
    const query = { update: () => query, insert: () => query, eq: () => query, select: () => query, single: () => { requested.resolve(); return pending.promise; } };
    let renders = 0;
    const context = setup([action], { sb: { from: () => query }, renderBoard: () => renders++ });
    const args = action === 'moveTask' ? ['day', 'a', 'tomorrow', { text: 'Edited A' }] : action === 'addGoal' ? ['day', 'New A'] : ['day', 'a', { text: 'Edited A' }];
    const result = context[action](...args);
    await requested.promise;
    switchAccount(context);
    pending.resolve({ data: { id: 'a', text: 'Private A' }, error: null });
    assert.equal(await result, false);
    assert.equal(context.state.day.length, 0);
    assert.equal(context.state.tomorrow.length, 0);
    assert.equal(renders, 0);
  });
}

test('move sends task edits and date in the same update and retains state on failure', async () => {
  let payload;
  const query = { update: values => { payload = values; return query; }, eq: () => query, select: () => query, single: async () => ({ error: { message: 'Offline' } }) };
  const context = setup(['moveTask'], { sb: { from: () => query } });
  const changes = { text: 'Edited', notes: 'Keep this note', estimate_min: 40 };
  assert.equal(await context.moveTask('day', 'a', 'tomorrow', changes), false);
  assert.equal(payload.text, changes.text);
  assert.equal(payload.notes, changes.notes);
  assert.equal(payload.estimate_min, 40);
  assert.equal(payload.period, '2026-09-30');
  assert.equal(context.state.day[0].text, 'Private A');
  assert.equal(context.state.tomorrow.length, 0);
});

test('loadBoard stops before further queries when its account changes', async () => {
  const pending = deferred();
  let queries = 0;
  const context = setup(['loadBoard'], { boardPeriods: () => ({ day: '2026-09-29' }), sb: { rpc: () => pending.promise, from: () => { queries++; throw new Error('Must not run'); } } });
  const result = context.loadBoard();
  switchAccount(context);
  pending.resolve({ error: null });
  assert.equal(await result, false);
  assert.equal(queries, 0);
});

test('ensureBoardDay repartitions an overnight demo before a new dated action', async () => {
  const periods = { day: '2026-09-30', tomorrow: '2026-10-01', week: '2026-09-28', month: '2026-09-01', year: '2026-01-01' };
  const context = setup(['ensureBoardDay'], { DEMO: true, periodFor: () => periods.day, boardPeriods: () => periods });
  context.state.tomorrow.push({ id: 'b', horizon: 'day', period: '2026-09-30', text: 'Next day' });
  assert.equal(await context.ensureBoardDay(), true);
  assert.equal(context.loadedBoardDate, periods.day);
  assert.deepEqual(Array.from(context.state.day, t => t.id), ['a', 'b']);
  assert.equal(context.state.tomorrow.length, 0);
  assert.ok(context.state.day.every(t => t.period === periods.day));
});

test('a successful move saves edits and changes the destination column together', async () => {
  const query = { update: () => query, eq: () => query, select: () => query, single: async () => ({ data: { id: 'a' }, error: null }) };
  const context = setup(['moveTask'], { sb: { from: () => query } });
  assert.equal(await context.moveTask('day', 'a', 'tomorrow', { text: 'Edited', notes: 'Keep', estimate_min: 40 }), true);
  assert.equal(context.state.day.length, 0);
  assert.equal(context.state.tomorrow[0].text, 'Edited');
  assert.equal(context.state.tomorrow[0].notes, 'Keep');
  assert.equal(context.state.tomorrow[0].estimate_min, 40);
  assert.equal(context.state.tomorrow[0].period, '2026-09-30');
});

test('late board/profile query results cannot overwrite the next account', async () => {
  const goals = deferred(), profile = deferred(), requested = deferred();
  const periods = { day: '2026-09-29', tomorrow: '2026-09-30', week: '2026-09-28', month: '2026-09-01', year: '2026-01-01' };
  let count = 0;
  function queryFor(table) {
    let reading = false;
    const query = { update: () => query, eq: () => query, lt: () => query, select: () => { reading = true; return query; }, or: () => query, order: () => query, maybeSingle: () => query,
      then: (resolve, reject) => {
        if (!reading) return Promise.resolve({ error: null }).then(resolve, reject);
        if (++count === 2) requested.resolve();
        return (table === 'goals' ? goals.promise : profile.promise).then(resolve, reject);
      } };
    return query;
  }
  const context = setup(['loadBoard'], { boardPeriods: () => periods, sb: { rpc: async () => ({ error: null }), from: queryFor } });
  const result = context.loadBoard();
  await requested.promise;
  switchAccount(context);
  goals.resolve({ data: [{ id: 'private', horizon: 'day', period: periods.day }], error: null });
  profile.resolve({ data: { user_id: 'A', context: 'Private briefing' }, error: null });
  assert.equal(await result, false);
  assert.equal(context.state.day.length, 0);
  assert.equal(context.profile.user_id, 'B');
});

test('an old boot cannot initialize a workspace or fetch habits for the next account', async () => {
  const pending = deferred();
  let habitLoads = 0;
  const context = setup(['boot'], { booted: false, loadBoard: () => pending.promise, loadHabits: () => { habitLoads++; } });
  const result = context.boot();
  switchAccount(context);
  pending.resolve(true);
  await result;
  assert.equal(habitLoads, 0);
  assert.equal(context.state.day.length, 0);
});
