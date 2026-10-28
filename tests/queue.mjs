import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { WriteQueue } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../writeQueue.js', import.meta.url))).toString('base64'));
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
    const calls = [], timers = new Map(), errors = [];
    let active = 0, peak = 0, id = 0;
    const q = new WriteQueue(snapshot => new Promise((resolve, reject) => {
        active++; peak = Math.max(peak, active);
        calls.push({ snapshot, resolve: () => { active--; resolve(); }, reject: () => { active--; reject(Error('disk full')); } });
    }), { schedule: cb => { timers.set(++id, cb); return id; }, cancel: id => timers.delete(id), report: e => errors.push(e) });
    return { q, calls, timers, errors, peak: () => peak };
}
{
    const s = setup(); s.q.request([0]); await tick();
    for (let i = 1; i <= 10000; i++) s.q.request([i]);
    assert.equal(s.calls.length, 1); s.calls[0].resolve(); await tick();
    assert.deepEqual(s.calls[1].snapshot, [10000]); s.calls[1].resolve();
    assert.equal(await s.q.flush(), true); assert.equal(s.peak(), 1); assert.equal(s.calls.length, 2);
}
{
    const s = setup(); s.q.request('old'); await tick(); s.q.request('new'); s.calls[0].reject(); await tick();
    assert.equal(s.errors.length, 1); assert.equal(s.timers.size, 1);
    const flush = s.q.flush(); await tick(); assert.equal(s.timers.size, 0);
    assert.equal(s.calls[1].snapshot, 'new'); s.calls[1].resolve(); assert.equal(await flush, true);
}
{
    const s = setup(); s.q.request('failed'); await tick(); s.calls[0].reject(); await tick();
    const flush = s.q.flush(); await tick(); s.calls[1].reject(); assert.equal(await flush, false);
    assert.equal(s.q.pending, 'failed'); assert.equal(s.timers.size, 0);
    s.q.request('recovered'); await tick(); s.calls[2].resolve(); assert.equal(await s.q.flush(), true);
}
{
    const s = setup(); s.q.request('retry'); await tick();
    for (let i = 0; i < 4; i++) {
        s.calls[i].reject(); await tick();
        if (i < 3) { const [id, cb] = [...s.timers][0]; s.timers.delete(id); cb(); await tick(); }
    }
    assert.equal(s.timers.size, 0); assert.equal(s.q.pending, 'retry'); assert.equal(s.calls.length, 4);
}
{
    const s = setup(); s.q.request('first'); await tick(); const flush = s.q.flush();
    s.q.request('enable-again'); s.calls[0].resolve(); await tick();
    assert.equal(s.calls[1].snapshot, 'enable-again'); s.calls[1].resolve();
    assert.equal(await flush, true); assert.equal(s.peak(), 1);
}
console.log('Queue: 5 scenarios passed, including 10,000 concurrent requests and failure recovery.');
