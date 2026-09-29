import { draftPlan, replanRemaining, timelineLayout, taskFingerprint, focusElapsedMs, recordFocus, recordedFocusSamples, workspaceKey, readWorkspace, writeWorkspace } from './planner-model.mjs';

export function createWorkspace(api) {
  const controller = new AbortController();
  const alive = () => !controller.signal.aborted;
  const ready = async () => {
    try { return alive() && await api.ensureBoardDay() && alive(); }
    catch (error) { if (alive()) api.toast('Could not refresh your day: ' + error.message); return false; }
  };
  const $ = id => document.getElementById(id);
  const listen = (element, name, handler) => element.addEventListener(name, handler, { signal: controller.signal });
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const key = workspaceKey(api.getProfile().user_id, api.demo);
  let memory = { inbox: [], plan: null, work: {}, focus: null };
  let storageWarning = false;
  function read() {
    if (!key) return;
    try {
      memory = readWorkspace(localStorage, key, api.today());
    } catch { api.toast('Browser drafts could not be loaded. Your synced tasks are unaffected.'); }
  }
  function store(next) {
    if (!alive()) return false;
    if (!api.demo) {
      if (!key) { api.toast('Load your account profile before saving browser drafts.'); return false; }
      try { writeWorkspace(localStorage, key, next); }
      catch { storageWarning = true; api.toast('Browser storage is unavailable. This draft was not saved.'); return false; }
    }
    memory = next;
    return true;
  }
  read();
  if (api.demo) {
    $('plan-dialog').lastElementChild.textContent = 'Demo plans and task changes are kept only until this page reloads.';
    const sample = draftPlan(api.getState().day, { start: '10:00', end: '17:00', buffer: 15 });
    if (sample.blocks.length) memory.plan = { ...sample, date: api.today(), demoSample: true };
  }
  let editing = null, draft = null, busy = false, promoting = null, replanning = false, draftDate = null, currentLayout = null;
  function button(text, action) {
    const element = node('button', text);
    element.type = 'button';
    element.addEventListener('click', action, { signal: controller.signal });
    return element;
  }
  function dates() {
    const today = new Date(api.today() + 'T12:00:00');
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const monday = new Date(today); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    $('today-label').textContent = 'Your day';
    $('today-date').textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('tomorrow-label').textContent = 'Tomorrow';
    $('tomorrow-date').textContent = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('week-strip').replaceChildren();
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday); day.setDate(monday.getDate() + i);
      const item = node('span', day.toLocaleDateString('en-US', { weekday: 'short' }));
      item.append(node('b', String(day.getDate())));
      if (day.toDateString() === today.toDateString()) item.setAttribute('aria-current', 'date');
      $('week-strip').append(item);
    }
  }
  function blockElement(block, completed = false) {
    const element = node('div', undefined, 'agenda-block' + (completed ? ' done' : ''));
    element.append(node('p', `${block.start}–${block.end} · ${block.minutes} min${completed ? ' · complete' : ''}`, 'planner-note'), node('div', block.text));
    return element;
  }
  function updateClock() {
    if (!alive() || !currentLayout) return;
    const area = $('agenda-events'), now = new Date(), minute = now.getHours() * 60 + now.getMinutes();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let marker = area.querySelector('.timeline-now');
    if (api.today() !== localDate || minute < currentLayout.from || minute >= currentLayout.to) { marker?.remove(); return; }
    if (!marker) { marker = node('div', undefined, 'timeline-now'); marker.setAttribute('aria-hidden', 'true'); marker.append(node('span')); area.append(marker); }
    marker.style.top = (minute - currentLayout.from) * 1.5 + 'px';
    marker.firstElementChild.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const clockTimer = setInterval(updateClock, 60000);
  controller.signal.addEventListener('abort', () => clearInterval(clockTimer), { once: true });
  function renderAgenda() {
    const tasks = api.getState().day;
    const area = $('agenda-events'); area.replaceChildren();
    const accepted = memory.plan?.date === api.today() ? memory.plan : null;
    const stale = accepted && accepted.fingerprint !== taskFingerprint(tasks);
    $('agenda-status').textContent = stale ? 'Needs replan' : accepted?.demoSample ? 'Sample plan' : 'Manual plan';
    $('plan-day').firstChild.textContent = accepted ? 'Replan ' : 'Plan day ';
    $('timeline-plan').textContent = accepted ? 'Replan ↗' : 'Plan ↗';
    $('calendar-status').textContent = 'Horizon task blocks · calendar not connected';
    $('plan-state').textContent = accepted ? (stale ? 'Tasks changed. Replan to update your timeline.' : accepted.demoSample ? 'Sample task plan · demo only' : api.demo ? 'Accepted demo plan · resets on reload' : 'Accepted plan · saved in this browser') : 'Add estimates, then make a plan for your day.';
    const visibleBlocks = (accepted?.blocks || []).filter(block => tasks.some(task => task.id === block.id));
    const layout = timelineLayout(visibleBlocks, accepted?.settings);
    currentLayout = layout;
    area.style.height = layout.height + 'px';
    const shortList = $('short-tasks'); shortList.replaceChildren(); shortList.hidden = true;
    for (let minute = layout.from; minute < layout.to; minute += 60) {
      const hour = Math.floor(minute / 60);
      const tick = node('div', undefined, 'timeline-hour');
      tick.style.top = (minute - layout.from) * 1.5 + 'px';
      tick.append(node('span', `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`));
      tick.setAttribute('aria-hidden', 'true'); area.append(tick);
    }
    for (const block of layout.blocks) {
      const task = tasks.find(t => t.id === block.id);
      const source = task.source === 'habit' ? 'Habit' : task.source === 'assistant' ? 'Planner' : 'Personal';
      if (block.minutes <= 15) {
        const row = button(`${block.start} · ${task.text} · ${block.minutes} min · ${source}${task.done ? ' · complete' : ''}`, () => openTask('day', task.id));
        row.className = 'short-task-button'; row.dataset.id = task.id;
        row.setAttribute('aria-label', `${source} task: ${task.text}, ${block.start} to ${block.end}, ${block.minutes} minute${block.minutes === 1 ? '' : 's'}${task.done ? ', complete' : ''}. Open task details.`);
        shortList.append(row); shortList.hidden = false;
        const mark = node('div', undefined, 'timeline-short-mark ' + (task.source === 'habit' ? 'habit-block' : task.source === 'assistant' ? 'assistant-block' : 'personal-block'));
        mark.style.top = block.top + 'px'; mark.style.height = block.height + 'px'; mark.title = `${task.text} · ${block.start}–${block.end}`;
        mark.setAttribute('aria-hidden', 'true'); area.append(mark);
        continue;
      }
      const element = button('', () => openTask('day', task.id));
      element.className = 'calendar-block ' + (task.source === 'habit' ? 'habit-block' : task.source === 'assistant' ? 'assistant-block' : 'personal-block') + (task.done ? ' completed-block' : '') + (block.height < 42 ? ' compact-block' : block.height < 60 ? ' short-block' : '');
      element.style.top = block.top + 'px'; element.style.height = block.height + 'px';
      element.setAttribute('aria-label', `${source} task: ${task.text}, ${block.start} to ${block.end}, ${block.minutes} minutes${task.done ? ', complete' : ''}. Open task details.`);
      element.title = `${task.text} · ${block.start}–${block.end}`;
      element.dataset.id = task.id;
      element.append(node('span', task.text, 'calendar-block-title'), node('span', `${source} · ${block.start}–${block.end}${task.done ? ' · complete' : ''}`, 'calendar-block-time'));
      area.append(element);
    }
    if (!layout.blocks.length) {
      const empty = node('div', undefined, 'timeline-empty');
      empty.append(node('span', 'A little structure. More room to breathe.', 'timeline-empty-title'), node('p', 'Estimate your tasks, then preview a plan. Your calendar stays disconnected.', 'planner-note'), button('Plan your day', () => openPlan()));
      area.append(empty);
    }
    updateClock();
    const remaining = tasks.filter(t => !t.done);
    const estimated = remaining.reduce((sum, t) => sum + (t.estimate_min || 0), 0);
    const unknown = remaining.filter(t => !t.estimate_min).length;
    $('remaining-time').textContent = estimated >= 60 ? `${Math.floor(estimated / 60)}h${estimated % 60 ? ' ' + estimated % 60 + 'm' : ''}` : `${estimated}m`;
    $('unestimated-note').textContent = unknown ? `${unknown} task${unknown === 1 ? '' : 's'} still need${unknown === 1 ? 's' : ''} an estimate.` : 'All remaining tasks have estimates.';
    const done = tasks.filter(t => t.done).length;
    $('planned-summary').replaceChildren(node('span', `${remaining.length} to do`), node('span', `${done} complete${unknown ? ' · ' + unknown + ' unestimated' : ''}`));
    const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    $('day-progress').setAttribute('aria-valuenow', String(progress));
    $('day-progress').firstElementChild.style.width = progress + '%';
  }
  function renderInbox() {
    $('inbox-count').textContent = String(memory.inbox.length);
    $('inbox-count').hidden = !memory.inbox.length;
    const list = $('inbox-list'); list.replaceChildren();
    if (!memory.inbox.length) list.append(node('li', 'No unscheduled tasks. Capture one above.', 'planner-note'));
    for (const item of memory.inbox) {
      const row = node('li', undefined, 'inbox-item');
      const text = node('div', item.text, 'inbox-text');
      text.append(node('p', 'No date · browser draft', 'planner-note'));
      const actions = node('div', undefined, 'planner-actions');
      const today = button('Today', () => promote(item, 'day'));
      const tomorrow = button('Tomorrow', () => promote(item, 'tomorrow'));
      const discard = button('Discard', () => {
        if (store({ ...memory, inbox: memory.inbox.filter(t => t.id !== item.id) })) renderInbox();
      });
      [today, tomorrow, discard].forEach(b => { b.disabled = promoting === item.id; actions.append(b); });
      row.append(text, actions); list.append(row);
    }
  }
  async function promote(item, day) {
    if (promoting) return;
    promoting = item.id; renderInbox();
    try {
      if (await api.addGoal(day, item.text) && alive()) {
        // The synced copy now exists. If browser storage fails, retain the draft visibly.
        if (store({ ...memory, inbox: memory.inbox.filter(t => t.id !== item.id) })) api.toast(`Added to ${day === 'day' ? 'Today' : 'Tomorrow'}.`);
        else api.toast('Task saved to your account, but the browser draft could not be removed. Discard it before retrying.');
      }
    } catch (error) { if (alive()) api.toast('Could not add the captured task: ' + error.message); }
    finally { if (alive()) { promoting = null; renderInbox(); } }
  }
  function focusedTask() {
    const draft = memory.focus;
    if (draft) return api.getState().day.find(task => task.id === draft.taskId) || { id: draft.taskId, text: draft.taskText, estimate_min: draft.estimateMin, done: true };
    return api.getState().day.find(task => !task.done);
  }
  function renderFocus() {
    const task = focusedTask(), draft = memory.focus;
    $('focus-task-name').textContent = task ? task.text : 'Today is complete';
    $('focus-task-estimate').textContent = task ? (task.estimate_min ? `${task.estimate_min} min estimated` : 'Add an estimate in task details.') : 'No unfinished tasks remain.';
    const elapsed = focusElapsedMs(draft);
    $('focus-clock').textContent = `${String(Math.floor(elapsed / 3600000)).padStart(2, '0')}:${String(Math.floor(elapsed / 60000) % 60).padStart(2, '0')}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`;
    $('focus-status').textContent = draft?.startedAt ? 'Recording work on this task.' : draft ? 'Paused. Resume or save your recorded time.' : 'Start a session when you begin working. Time is recorded when you save it.';
    $('focus-start').hidden = !task || !!draft?.startedAt;
    $('focus-start').textContent = draft ? 'Resume' : 'Start';
    $('focus-pause').hidden = !draft?.startedAt;
    $('focus-save').hidden = !draft;
    $('focus-complete').hidden = !task || !!task.done;
  }
  function checkpointFocus() {
    const draft = memory.focus;
    if (!draft?.startedAt || !key) return;
    try { writeWorkspace(localStorage, key, { ...memory, focus: { ...draft, accumulatedMs: focusElapsedMs(draft), startedAt: null } }); }
    catch { /* The next manual save will surface a storage error. */ }
  }
  function pauseFocus() {
    const draft = memory.focus;
    if (!draft?.startedAt) return true;
    const paused = { ...draft, accumulatedMs: focusElapsedMs(draft), startedAt: null };
    if (!store({ ...memory, focus: paused })) return false;
    renderFocus(); return true;
  }
  function saveFocusTime() {
    const draft = memory.focus;
    if (!draft) return false;
    const task = focusedTask();
    let work;
    try { work = recordFocus(memory.work, draft, task, api.today()); }
    catch (error) { api.toast(error.message); return false; }
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const minDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    work = Object.fromEntries(Object.entries(work).filter(([, sample]) => sample.date >= minDate));
    if (!store({ ...memory, work, focus: null })) return false;
    api.onFocusSaved?.(); renderFocus(); api.toast('Focus time saved in this browser.'); return true;
  }
  function render() { if (!alive()) return; dates(); renderAgenda(); renderInbox(); if ($('focus-dialog').open) renderFocus(); }
  function focusTask(id, fromTimeline = false) {
    const block = fromTimeline && Array.from(document.querySelectorAll('.calendar-block,.short-task-button')).find(task => task.dataset.id === id && task.getClientRects().length);
    const title = Array.from(document.querySelectorAll('.task')).find(task => task.dataset.id === id)?.querySelector('.task-title-button');
    const paneSwitch = $('workspace-switch').querySelector('[data-pane="timeline"]');
    (block || (title?.getClientRects().length ? title : null) || (paneSwitch.getClientRects().length ? paneSwitch : $('plan-day'))).focus({ preventScroll: true });
  }
  function detailChanges() {
    const text = $('detail-title').value.trim();
    if (!text) throw new Error('Enter a task name.');
    const raw = $('detail-estimate').value;
    const estimate = raw ? Number(raw) : null;
    if (estimate !== null && (!Number.isInteger(estimate) || estimate < 1 || estimate > 600)) throw new Error('Estimate must be a whole number from 1 to 600.');
    return { text, notes: $('detail-notes').value, estimate_min: estimate };
  }
  async function openTask(horizon, id) {
    const fromTimeline = document.activeElement?.matches('.calendar-block,.short-task-button');
    if (!await ready()) return;
    const task = api.getState()[horizon]?.find(t => t.id === id);
    if (!task) return;
    editing = { horizon, id, fromTimeline };
    $('detail-title').value = task.text;
    $('detail-notes').value = task.notes || '';
    $('detail-estimate').value = task.estimate_min || '';
    $('detail-error').textContent = '';
    $('detail-source').textContent = task.source === 'habit' ? 'Recurring habit instance' : task.source === 'assistant' ? 'Proposed by the planner' : 'Your task';
    $('detail-complete').hidden = !['day', 'tomorrow'].includes(horizon);
    $('detail-complete').textContent = task.done ? 'Mark not done' : 'Mark complete';
    $('detail-move').hidden = task.done || task.source === 'habit' || !['day', 'tomorrow'].includes(horizon);
    $('detail-move').textContent = horizon === 'tomorrow' ? 'Move to today' : 'Move to tomorrow';
    $('task-dialog').showModal();
  }
  listen($('task-detail-form'), 'submit', async event => {
    event.preventDefault(); if (busy || !editing) return;
    let changes;
    try { changes = detailChanges(); } catch (error) { $('detail-error').textContent = error.message; return; }
    busy = true; const submit = event.submitter || event.target.querySelector('[type="submit"]'); submit.disabled = true; $('detail-move').disabled = true;
    try {
      if (await api.editTask(editing.horizon, editing.id, changes) && alive()) {
        $('task-dialog').close(); focusTask(editing.id, editing.fromTimeline); api.toast('Task saved.');
      }
    } catch (error) { if (alive()) $('detail-error').textContent = error.message; }
    finally { if (alive()) { busy = false; submit.disabled = false; $('detail-move').disabled = false; } }
  });
  listen($('detail-move'), 'click', async () => {
    if (busy || !editing) return;
    let changes;
    try { changes = detailChanges(); } catch (error) { $('detail-error').textContent = error.message; return; }
    busy = true; $('detail-move').disabled = true;
    try {
      const target = editing.horizon === 'tomorrow' ? 'day' : 'tomorrow';
      if (await api.moveTask(editing.horizon, editing.id, target, changes) && alive()) { $('task-dialog').close(); focusTask(editing.id, editing.fromTimeline); api.toast(`Saved and moved to ${target === 'day' ? 'Today' : 'Tomorrow'}.`); }
    } catch (error) { if (alive()) $('detail-error').textContent = error.message; }
    finally { if (alive()) { busy = false; $('detail-move').disabled = false; } }
  });
  listen($('detail-complete'), 'click', async () => {
    if (busy || !editing) return;
    const task = api.getState()[editing.horizon]?.find(item => item.id === editing.id);
    if (!task) return;
    let changes;
    try { changes = detailChanges(); } catch (error) { $('detail-error').textContent = error.message; return; }
    if (changes.text !== task.text || changes.notes !== (task.notes || '') || changes.estimate_min !== (task.estimate_min || null)) {
      $('detail-error').textContent = 'Save your task edits before changing completion.'; return;
    }
    busy = true; $('detail-complete').disabled = true;
    try {
      if (await api.toggleGoal(editing.horizon, editing.id) && alive()) {
        $('task-dialog').close(); focusTask(editing.id, editing.fromTimeline);
      }
    } catch (error) { if (alive()) $('detail-error').textContent = error.message; }
    finally { if (alive()) { busy = false; $('detail-complete').disabled = false; } }
  });
  listen($('inbox-add'), 'submit', event => {
    event.preventDefault(); const input = event.target.querySelector('input');
    const text = input.value.trim(); if (!text) return;
    const item = { id: crypto.randomUUID(), text };
    if (store({ ...memory, inbox: [...memory.inbox, item] })) { input.value = ''; renderInbox(); input.focus(); }
  });
  listen($('tomorrow-add'), 'submit', async event => {
    event.preventDefault(); const input = event.target.querySelector('input'); const submit = event.submitter;
    submit.disabled = true;
    try { if (await api.addGoal('tomorrow', input.value) && alive()) input.value = ''; }
    catch (error) { if (alive()) api.toast('Could not add task: ' + error.message); }
    finally { if (alive()) { submit.disabled = false; input.focus(); } }
  });
  document.querySelectorAll('[data-close-dialog]').forEach(element => listen(element, 'click', () => {
    const dialog = element.closest('dialog');
    if (dialog.id === 'task-dialog' && busy) return;
    dialog.close();
  }));
  listen($('task-dialog'), 'cancel', event => { if (busy) event.preventDefault(); });
  listen($('task-dialog'), 'close', () => { if (alive() && editing) focusTask(editing.id, editing.fromTimeline); });
  async function previewPlan() {
    if (!await ready()) return;
    const area = $('plan-preview'); area.replaceChildren(); $('accept-plan').hidden = true; draft = null;
    try {
      const settings = { start: $('plan-start').value, end: $('plan-end').value, buffer: Number($('plan-buffer').value) };
      const now = new Date();
      const accepted = memory.plan?.date === api.today() ? memory.plan : null;
      draftDate = api.today();
      draft = replanning ? replanRemaining(api.getState().day, settings, accepted, now.getHours() * 60 + now.getMinutes()) : draftPlan(api.getState().day, settings);
      area.append(node('p', `${draft.planned} min planned / ${draft.available} min in your window`, 'planner-note'));
      draft.blocks.forEach(block => area.append(blockElement(block, api.getState().day.some(task => task.id === block.id && task.done))));
      if (draft.omitted.length) {
        const omitted = node('div', undefined, 'plan-omitted'); omitted.append(node('strong', 'Not scheduled'));
        draft.omitted.forEach(task => omitted.append(node('p', `${task.text} — ${task.reason}`)));
        area.append(omitted);
      }
      if (!draft.blocks.length) area.append(node('p', 'No tasks fit yet. Add estimates or extend the window.', 'planner-note'));
      $('accept-plan').hidden = draft.blocks.length === 0;
    } catch (error) { const message = node('p', error.message); message.setAttribute('role', 'alert'); area.append(message); }
  }
  async function openPlan() {
    if (!await ready()) return;
    replanning = memory.plan?.date === api.today();
    $('plan-dialog-heading').textContent = replanning ? 'Replan remaining work' : 'Plan today';
    const settings = memory.plan?.settings;
    if (settings) { $('plan-start').value = settings.start; $('plan-end').value = settings.end; $('plan-buffer').value = settings.buffer; }
    $('plan-preview').replaceChildren(); $('accept-plan').hidden = true; draft = null;
    $('plan-dialog').showModal();
    if (replanning) previewPlan();
  }
  listen($('plan-day'), 'click', () => openPlan());
  listen($('timeline-plan'), 'click', () => openPlan());
  listen($('workspace-switch'), 'click', event => {
    const selected = event.target.closest('[data-pane]');
    if (!selected) return;
    document.querySelector('.planner-grid').dataset.mobilePane = selected.dataset.pane;
    $('workspace-switch').querySelectorAll('button').forEach(control => control.setAttribute('aria-pressed', String(control === selected)));
    $('content').scrollTop = 0;
  });
  async function capture() { if (await ready()) { $('capture-input').value = ''; $('capture-dialog').showModal(); $('capture-input').focus(); } }
  listen($('capture-open'), 'click', capture);
  listen($('capture-form'), 'submit', event => {
    event.preventDefault();
    const value = $('capture-input').value.trim();
    if (!value) return;
    const item = { id: crypto.randomUUID(), text: value };
    if (store({ ...memory, inbox: [...memory.inbox, item] })) {
      renderInbox(); $('capture-dialog').close(); $('capture-open').focus(); api.toast('Saved to Inbox.');
    }
  });
  listen(document, 'keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); capture(); } });
  listen($('plan-form'), 'submit', event => { event.preventDefault(); previewPlan(); });
  listen($('plan-form'), 'input', () => { draft = null; $('accept-plan').hidden = true; $('plan-preview').replaceChildren(); });
  listen($('accept-plan'), 'click', async () => {
    if (!await ready()) return;
    if (!draft) return;
    const now = new Date();
    if (draftDate !== api.today() || draft.fingerprint !== taskFingerprint(api.getState().day) || (replanning && now.getHours() * 60 + now.getMinutes() > draft.boundary)) { await previewPlan(); api.toast('The plan changed. Review the refreshed draft before accepting.'); return; }
    if (store({ ...memory, plan: { ...draft, date: api.today() } })) { $('plan-dialog').close(); renderAgenda(); api.toast('Manual plan accepted.'); }
  });
  async function openFocus() { if (await ready()) { renderFocus(); $('focus-dialog').showModal(); } }
  listen($('focus-open'), 'click', openFocus);
  listen($('timeline-focus'), 'click', openFocus);
  listen($('focus-start'), 'click', () => {
    const task = focusedTask(); if (!task || task.done || memory.focus?.startedAt) return;
    const focus = memory.focus || { taskId: task.id, taskText: task.text, estimateMin: task.estimate_min || null, date: api.today(), accumulatedMs: 0, startedAt: null };
    if (store({ ...memory, focus: { ...focus, startedAt: Date.now() } })) renderFocus();
  });
  listen($('focus-pause'), 'click', pauseFocus);
  listen($('focus-save'), 'click', saveFocusTime);
  listen($('focus-dialog'), 'close', pauseFocus);
  listen($('focus-complete'), 'click', async () => {
    const task = focusedTask();
    if (!task || task.done) return;
    $('focus-complete').disabled = true;
    try {
      if (memory.focus && !saveFocusTime()) return;
      await api.toggleGoal('day', task.id); if (alive()) renderFocus();
    }
    catch (error) { if (alive()) api.toast('Could not complete task: ' + error.message); }
    finally { if (alive()) $('focus-complete').disabled = false; }
  });
  const focusClockTimer = setInterval(() => { if (alive() && $('focus-dialog').open && memory.focus?.startedAt) renderFocus(); }, 1000);
  const focusCheckpointTimer = setInterval(checkpointFocus, 15000);
  controller.signal.addEventListener('abort', () => { clearInterval(focusClockTimer); clearInterval(focusCheckpointTimer); }, { once: true });
  listen(document, 'visibilitychange', () => { if (document.hidden) pauseFocus(); });
  listen(window, 'pagehide', checkpointFocus);
  if (key) listen(window, 'storage', event => { if (event.key === key) { memory = { inbox: [], plan: null, work: {}, focus: null }; read(); render(); } });
  return { render, openTask, focusRecords: () => recordedFocusSamples(memory.work), destroy: () => { checkpointFocus(); controller.abort(); $('task-detail-form').querySelector('[type="submit"]').disabled = false; $('detail-move').disabled = false; $('tomorrow-add').querySelector('button').disabled = false; $('focus-complete').disabled = false; }, storageAvailable: () => !storageWarning };
}
