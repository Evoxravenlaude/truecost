/* The public accuracy log. Once a day (and whenever someone runs /cost) we log a funding forecast;
   when its hold time has passed we score it against what was actually paid. Nothing is ever edited after logging. */
const HOLDS = [24, 72, 168];
const H = 3600e3;

/* Daily reference forecasts: every market, both venues, each hold, for a $10,000 long. */
function dailyForecasts(E, snap) {
  const out = [], start = Date.parse(snap.asOf);
  snap.markets.forEach(m => ['hl', 'lt'].forEach(v => {
    if (!m[v].maxLev) return;
    HOLDS.forEach(hours => {
      const f = E.funding(m.sym, v, 1, 1, hours); // fraction of notional, long side
      out.push({ id: `${m.sym}|${v}|${hours}|${start}`, sym: m.sym, v, hours, start, p10: f.p10, p50: f.median, p90: f.p90, kind: 'daily' });
    });
  }));
  return out;
}

/* Realized cumulative funding (fraction, long side) over [start, start+hours) from a snapshot's history. */
function realized(snap, rec) {
  const series = rec.v === 'hl' && snap.histHL && snap.histHL[rec.sym] ? snap.histHL[rec.sym] : snap.hist[rec.sym];
  if (!series) return null;
  const i0 = Math.round((rec.start / 1000 - snap.histStart) / 3600);
  if (i0 < 0 || i0 + rec.hours > series.length) return null;
  let s = 0; for (let i = i0; i < i0 + rec.hours; i++) s += series[i];
  return s;
}

class Calibration {
  constructor(store) { this.store = store; }
  log() { return this.store.read('forecasts', []); }
  add(recs) {
    const log = this.log(), seen = new Set(log.map(r => r.id)); let n = 0;
    recs.forEach(r => { if (!seen.has(r.id)) { log.push(r); n++; } });
    if (n) this.store.write('forecasts', log);
    return n;
  }
  /* Score every forecast whose hold time has ended and whose window is inside the snapshot history. */
  score(snap) {
    const log = this.log(), end = Date.parse(snap.asOf); let n = 0;
    log.forEach(r => {
      if (r.real != null || r.start + r.hours * H > end) return;
      const x = realized(snap, r); if (x == null) return;
      r.real = x; r.hit = x >= r.p10 && x <= r.p90; r.scoredAt = snap.asOf; n++;
    });
    if (n) this.store.write('forecasts', log);
    return n;
  }
  stats(kind = 'daily') {
    const s = this.log().filter(r => r.real != null && (!kind || r.kind === kind)), byH = {};
    HOLDS.forEach(h => { const r = s.filter(x => x.hours === h); if (r.length) byH[h] = { n: r.length, rate: r.filter(x => x.hit).length / r.length }; });
    return { n: s.length, rate: s.length ? s.filter(x => x.hit).length / s.length : 0, byH };
  }
}
module.exports = { Calibration, dailyForecasts, realized, HOLDS };
