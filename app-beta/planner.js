// Planner: the "assistant" maths behind What should I do now?, Plan my week, gentle rescheduling and project health.
// Plain functions over the task list, no AI: the buddy uses them as tools and explains the result in its own words.
// Works in the app (require) and in the page (window.Planner).
(function (root) {
  const DAY = 86400000;
  const dn = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
  const nd = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const dow = (s) => new Date(s + 'T12:00:00Z').getUTCDay();
  const PRI = { high: 3, medium: 2, low: 1 };
  const isOpen = (t) => t.status !== 'done' && t.status !== 'cancelled';
  const pri = (t) => PRI[String(t.priority || '').toLowerCase() === 'normal' ? 'medium' : String(t.priority || '').toLowerCase()] || 2;

  // next working days from a date (inclusive), using the days you work (0 = Sunday)
  function workdays(from, count, days = [1, 2, 3, 4, 5]) {
    const out = []; let n = dn(from);
    for (let i = 0; out.length < count && i < count * 7 + 7; i++, n++) if (days.includes(new Date(n * DAY).getUTCDay())) out.push(nd(n));
    return out;
  }
  function workdaysBetween(a, b, days) { let c = 0; for (let n = dn(a); n <= dn(b); n++) if (days.includes(new Date(n * DAY).getUTCDay())) c++; return c; }

  // ---- What should I do now? One task, with the reason, plus two others
  function next(tasks, { today, now = '12:00', days } = {}) {
    const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
    const scored = tasks.filter((t) => isOpen(t) && t.status !== 'hold' && (!t.start || t.start <= today)).map((t) => {
      let s = pri(t) * 10, why = [];
      if (t.due && t.due < today) { s += 60 + Math.min(30, dn(today) - dn(t.due)); why.push('late'); }
      else if (t.due === today) { s += 40; why.push('due today'); }
      else if (t.due && dn(t.due) - dn(today) <= 2) { s += 20; why.push('due soon'); }
      if (t.due === today && t.time) {
        const left = toMin(t.time) - toMin(now);
        if (left >= 0 && left <= 90) { s += 50; why.push(`at ${t.time}`); }
        else if (left < 0) { s += 10; }
      }
      if (t.status === 'doing') { s += 15; why.push('already started'); }
      if (pri(t) === 3) why.push('high priority');
      return { id: t.id, title: t.title, project: t.project || null, due: t.due || null, time: t.time || null, priority: t.priority || null, status: t.status, score: s, why };
    }).sort((a, b) => b.score - a.score || String(a.due || '9').localeCompare(String(b.due || '9')));
    return { pick: scored[0] || null, also: scored.slice(1, 3), open_count: scored.length };
  }

  // ---- Gentle rescheduling: late tasks get realistic new dates on the coming working days (at most perDay a day)
  function reschedule(tasks, { today, days = [1, 2, 3, 4, 5], perDay = 3 } = {}) {
    const late = tasks.filter((t) => isOpen(t) && t.status !== 'hold' && t.due && t.due < today)
      .sort((a, b) => pri(b) - pri(a) || a.due.localeCompare(b.due));
    if (!late.length) return { late: 0, plan: [] };
    const load = {};
    for (const t of tasks) if (isOpen(t) && t.due && t.due >= today) load[t.due] = (load[t.due] || 0) + 1;
    const slots = workdays(today, 30, days);
    const plan = [];
    for (const t of late) {
      const day = slots.find((d) => (load[d] || 0) < perDay) || slots[slots.length - 1];
      load[day] = (load[day] || 0) + 1;
      const len = t.start && t.due ? Math.max(0, dn(t.due) - dn(t.start)) : 0;
      const start = t.start && t.start < today ? (len ? nd(Math.max(dn(today), dn(day) - len)) : day) : (t.start || day);
      plan.push({ id: t.id, title: t.title, project: t.project || null, was_due: t.due, days_late: dn(today) - dn(t.due), new_start: start > day ? day : start, new_due: day });
    }
    return { late: late.length, plan };
  }

  // ---- Plan my week: what's open, how much fits each working day, and a suggested day for each task
  function week(tasks, { today, days = [1, 2, 3, 4, 5], perDay = 4 } = {}) {
    const span = workdays(today, 5, days);
    const end = span[span.length - 1];
    const open = tasks.filter((t) => isOpen(t) && t.status !== 'hold');
    const fixed = {};                                                       // tasks that already have a time keep their day
    for (const t of open) if (t.due && t.due >= today && t.due <= end && t.time) (fixed[t.due] ||= []).push(t);
    const want = open.filter((t) => !(t.time && t.due >= today && t.due <= end) && (!t.due || t.due <= end || t.status === 'doing'))
      .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || pri(b) - pri(a));
    const load = Object.fromEntries(span.map((d) => [d, (fixed[d] || []).length]));
    const plan = [];
    for (const t of want) {
      const latest = t.due && t.due >= today ? t.due : (t.due ? today : end);
      const okDays = span.filter((d) => d <= latest);
      const day = (okDays.length ? okDays : span).reduce((best, d) => ((load[d] || 0) < (load[best] || 0) ? d : best), (okDays.length ? okDays : span)[0]);
      if ((load[day] || 0) >= perDay + 2) continue;                        // the week is full: leave it for later
      load[day] = (load[day] || 0) + 1;
      plan.push({ id: t.id, title: t.title, project: t.project || null, day, due: t.due || null, priority: t.priority || null, late: !!(t.due && t.due < today) });
    }
    const leftOut = want.filter((t) => !plan.some((p) => p.id === t.id)).map((t) => ({ id: t.id, title: t.title, due: t.due || null }));
    return { days: span.map((d) => ({ date: d, fixed: (fixed[d] || []).map((t) => ({ id: t.id, title: t.title, time: t.time })), planned: plan.filter((p) => p.day === d) })), left_for_later: leftOut };
  }

  // ---- Project health: on track / at risk / late, with the reason (key + args, so the page can translate it)
  const R = (state, key, ...args) => ({ state, key, args, reason: key.replace(/\{(\d)\}/g, (_, i) => args[i]) });
  function health(projectTasks, { today, days = [1, 2, 3, 4, 5] } = {}) {
    const live = projectTasks.filter((t) => t.status !== 'cancelled');
    const open = live.filter(isOpen);
    if (!live.length || !open.length) return R('done', 'Everything is done');
    const late = open.filter((t) => t.status !== 'hold' && t.due && t.due < today);
    if (late.length) return late.length === 1 ? R('late', '"{0}" is late', late[0].title) : R('late', '{0} tasks are late', late.length);
    const soon = open.filter((t) => t.status === 'todo' && t.due && dn(t.due) - dn(today) <= 1 && t.start && t.start < today);
    if (soon.length) return soon[0].due === today ? R('risk', '"{0}" is due today and not started', soon[0].title) : R('risk', '"{0}" is due tomorrow and not started', soon[0].title);
    const ends = open.map((t) => t.due).filter(Boolean).sort().pop();
    if (ends) {
      const left = workdaysBetween(today, ends, days);
      if (open.length > Math.max(1, left) * 3) return R('risk', '{0} open tasks, {1} working days left', open.length, left);
    }
    return R('ok', 'On track');
  }

  const P = { next, reschedule, week, health, workdays };
  if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.Planner = P;
})(typeof window !== 'undefined' ? window : globalThis);
