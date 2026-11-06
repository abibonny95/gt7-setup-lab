#!/usr/bin/env node
/* Setup Lab - Step 0: rete di sicurezza.
   Estrae dal <script> di index.html il solo motore (dati + gen + effects + piano PP, niente DOM),
   lo esegue in una sandbox `vm` su una matrice di configurazioni, controlla gli invarianti
   e confronta i risultati con uno snapshot.

   Uso (dalla radice del repo):
     node tools/safety-net.js             controlla invarianti + confronta con lo snapshot
     node tools/safety-net.js --update    riscrive lo snapshot (dopo aver approvato le differenze)
     node tools/safety-net.js --file=percorso/index.html
   Codice di uscita (bitmask): 1 = invarianti violati, 2 = snapshot diverso, 4 = snapshot assente. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const fileArg = (args.find(a => a.startsWith('--file=')) || '').slice(7);
const SNAP = path.join(__dirname, 'safety-snapshot.json');
const TOL_S = 1e-6, TOL_FX = 2e-4;           /* tolleranze di confronto: valori setup / barre effetti */
const EPS = 1e-9;

function findHtml() {
  const c = fileArg ? [path.resolve(fileArg)] : [
    path.resolve(process.cwd(), 'index.html'), path.join(__dirname, 'index.html'), path.join(__dirname, '..', 'index.html')];
  const f = c.find(p => fs.existsSync(p));
  if (!f) throw new Error('index.html non trovato. Provati: ' + c.join(', ') + '. Usa --file=percorso.');
  return f;
}

/* ---------- estrazione del motore ---------- */
const M0 = '/* ===== DATI ===== */', M1 = '/* ===== LINGUA (IT / EN) ===== */';
function loadEngine() {
  const html = fs.readFileSync(findHtml(), 'utf8');
  const a = html.indexOf(M0), b = html.indexOf(M1);
  if (a < 0 || b <= a) throw new Error('Marcatori del motore non trovati in index.html (' + M0 + ' ... ' + M1 + '). Se li hai rinominati, aggiorna M0/M1 qui.');
  const src = html.slice(a, b);
  const E = vm.runInNewContext(src + '\n;({gen,effects,biasOf,effCar,defRanges,gearDefaults,has,CIRCUITS,P})', {}, { filename: 'motore(index.html)' });
  return { E, hash: crypto.createHash('sha1').update(src).digest('hex').slice(0, 10) };
}

/* ---------- matrice ---------- */
const LAYOUTS = {
  FF: { e: 'F', d: 'FWD', L: 'FF' }, FR: { e: 'F', d: 'RWD', L: 'FR' }, MR: { e: 'M', d: 'RWD', L: 'MR' }, RR: { e: 'R', d: 'RWD', L: 'RR' },
  '4WD-F': { e: 'F', d: 'AWD', L: '4WD' }, '4WD-M': { e: 'M', d: 'AWD', L: '4WD' }, '4WD-R': { e: 'R', d: 'AWD', L: '4WD' } };
const WFS = [40, 50, 60, 70];
const TYRE_PAIRS = [['CH', 'CH'], ['SM', 'SM'], ['RS', 'RS'], ['INT', 'INT'], ['CM', 'RS'], ['RS', 'CM'], ['SS', 'SH']]; /* omogenee + miste */
const TERR = ['asfalto', 'sterrato', 'neve'];
const FULL = { susp: 'full', lsd: true, tv: true, aero: true, brk: true, trans: true, ws: true };
const PARTS = {
  full: { gears: 6, inst: FULL },
  full10: { gears: 10, inst: FULL },
  partial4: { gears: 4, inst: { susp: 'height', lsd: true, tv: false, aero: false, brk: true, trans: true, ws: false } },
  minimal: { gears: 6, inst: { susp: 'none', lsd: false, tv: false, aero: false, brk: false, trans: false, ws: false } },
  /* stress dell'ordinamento marce: tutti i rapporti con lo stesso range (limiti inseriti a mano) + profilo a rettilinei lunghi.
     Con i range di default la correzione "le marce devono scendere" non scatta mai: senza questa variante non verrebbe provata. */
  flatgears: { gears: 8, inst: FULL, flat: true, circuit: 'monza' },
  /* limiti modificati dall'utente (stretti per frequenza e barre, larghi per altezza e LSD): rende misurabile
     ogni dipendenza delle barre effetti o del generatore dai range editabili invece che da quelli di riferimento */
  customrng: { gears: 6, inst: FULL, rng: { freqF: [1.5, 3, .01], freqR: [1.5, 3, .01], rhF: [60, 200, 1], rhR: [60, 200, 1],
    arbF: [1, 5, 1], arbR: [1, 5, 1], lsdA: [10, 100, 1], camF: [0, 10, .1], camR: [0, 10, .1] } } };
const FXK = ['os', 'turn', 'stab', 'trac', 'brk', 'grip'];

const isNum = x => typeof x === 'number' && isFinite(x);
const r6 = x => +(+x).toFixed(6), r4 = x => +(+x).toFixed(4);
const mapv = (o, f) => { const r = {}; for (const k of Object.keys(o).sort()) r[k] = f(o[k]); return r };

function runCase(E, lay, wf, tyres, terr, pn) {
  const Ly = LAYOUTS[lay], pt = PARTS[pn], errs = [];
  const car = { name: 't', engine: Ly.e, drive: Ly.d, weight: 1100, wf, stabL: '', stabH: '', rotL: 0, rotM: 0, rotH: 0, power: 250, torque: 300,
    asp: 'NA', cg: 'auto', pp: 600, ppNow: 640, gears: pt.gears, tyre: tyres[0], tyreR: tyres[1], aero: pt.inst.aero, inst: { ...pt.inst },
    comp: { ecu: true, rst: true, bal: true }, terrain: terr, style: 'neutro', prof: { ...E.CIRCUITS[pt.circuit || 'spa'].p } };
  const carE = E.effCar(car, { ecu: 100, rst: 100, bal: 0, balp: 0 });
  const R = { ...E.defRanges(), ...E.gearDefaults(pt.gears) };   /* come fa l'app quando cambia nGears */
  if (pt.flat) for (let i = 1; i <= 10; i++) R['g' + i] = { min: 1, max: 4, step: .001 };
  if (pt.rng) for (const k in pt.rng) R[k] = { min: pt.rng[k][0], max: pt.rng[k][1], step: pt.rng[k][2] };
  const INV = { toe: true, bb: false }, lv = { dfF: null, dfR: null, ts: null, rsa: null };
  let g;
  try { g = E.gen(carE, R, INV, lv) } catch (x) { return { errs: [['eccezione', 'gen(): ' + x.message]] } }
  if (g.L !== Ly.L) errs.push(['layout', `atteso ${Ly.L}, ottenuto ${g.L}`]);
  if (!isNum(g.r) || g.r < -1 - EPS || g.r > 1 + EPS) errs.push(['r', 'r=' + g.r]);
  if (!isNum(g.g)) errs.push(['g', 'g=' + g.g]);
  for (const k in g.auto) if (!isNum(g.auto[k]) || g.auto[k] < -EPS || g.auto[k] > 1 + EPS) errs.push(['auto', `${k}=${g.auto[k]}`]);
  /* set di chiavi atteso: dipende da layout, parti installate e numero di marce */
  const ng = Math.min(10, Math.max(4, Math.round(pt.gears)));
  const exp = E.P.filter(q => !(q.awd && Ly.L !== '4WD') && E.has(carE, q.need) && (!q.gear || q.gear <= ng)).map(q => q.k).sort();
  const got = Object.keys(g.S).sort();
  const miss = exp.filter(k => !got.includes(k)), extra = got.filter(k => !exp.includes(k));
  if (miss.length) errs.push(['chiavi-mancanti', miss.join(',')]);
  if (extra.length) errs.push(['chiavi-in-piu', extra.join(',')]);
  for (const k of got) {
    const v = g.S[k], u = R[k];
    if (!isNum(v)) errs.push(['non-finito', `${k}=${v}`]);
    else if (u && (v < u.min - EPS || v > u.max + EPS)) errs.push(['fuori-range', `${k}=${v} [${u.min},${u.max}]`]);
  }
  if (E.has(carE, 'trans')) for (let i = 2; i <= ng; i++) {
    const a = g.S['g' + (i - 1)], b = g.S['g' + i];
    if (isNum(a) && isNum(b) && !(b < a)) errs.push(['marce-non-decrescenti', `g${i - 1}=${a} g${i}=${b}`]);
  }
  /* effetti: base (S=B), e setup tutto al minimo / tutto al massimo del range (stress dei limiti) */
  let fx, fxMin, fxMax;
  try {
    const bias = E.biasOf(carE, g.L, g.g, g.r), B = { ...g.S }, Smin = {}, Smax = {};
    for (const k of got) { Smin[k] = R[k].min; Smax[k] = R[k].max }
    fx = E.effects(carE, g.S, B, R, INV, bias); fxMin = E.effects(carE, Smin, B, R, INV, bias); fxMax = E.effects(carE, Smax, B, R, INV, bias);
    for (const [n, o] of [['base', fx], ['min', fxMin], ['max', fxMax]]) for (const k of FXK)
      if (!isNum(o[k]) || o[k] < -EPS || o[k] > 100 + EPS) errs.push(['effetti', `${n}.${k}=${o[k]}`]);
  } catch (x) { errs.push(['eccezione', 'effects(): ' + x.message]) }
  const rec = { L: g.L, r: r6(g.r), g: r6(g.g), S: mapv(g.S, r6), auto: mapv(g.auto, r6) };
  if (fx) { rec.fx = mapv(fx, r4); rec.fxMin = mapv(fxMin, r4); rec.fxMax = mapv(fxMax, r4) }
  return { errs, rec };
}

/* ---------- confronto ---------- */
function flat(o, p, out) { for (const k in o) { const v = o[k], q = p ? p + '.' + k : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
function compare(oldC, newC) {
  const okeys = Object.keys(oldC), nkeys = Object.keys(newC);
  const added = nkeys.filter(k => !(k in oldC)), removed = okeys.filter(k => !(k in newC));
  const byParam = {}, changed = new Set();
  for (const key of nkeys) {
    if (!(key in oldC)) continue;
    const a = flat(oldC[key], '', {}), b = flat(newC[key], '', {});
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[p], y = b[p];
      let d = null;
      if (x === undefined || y === undefined) d = Infinity;                 /* parametro comparso / scomparso */
      else if (typeof x === 'number' && typeof y === 'number') { const t = p.startsWith('fx') ? TOL_FX : TOL_S; const dd = Math.abs(x - y); if (dd > t) d = dd }
      else if (x !== y) d = Infinity;
      if (d == null) continue;
      changed.add(key);
      /* profilo con limiti dell'utente separato dagli altri: distingue dipendenze dai range editabili da cambi del modello */
      const pk = (key.endsWith('|customrng') ? '[limiti utente] ' : '') + p;
      const e = byParam[pk] || (byParam[pk] = { n: 0, max: 0, ex: key, lays: new Set(), parts: new Set() }); e.n++; if (d > e.max) { e.max = d; e.ex = key }
      const kp = key.split('|'); e.lays.add(kp[0]); e.parts.add(kp[4]);
    }
  }
  return { added, removed, changed: [...changed], byParam };
}

/* ---------- main ---------- */
function main() {
  const { E, hash } = loadEngine();
  const cases = {}, errs = [];
  let n = 0;
  for (const lay in LAYOUTS) for (const wf of WFS) for (const ty of TYRE_PAIRS) for (const terr of TERR) for (const pn in PARTS) {
    const key = `${lay}|wf${wf}|${ty[0]}/${ty[1]}|${terr}|${pn}`; n++;
    const r = runCase(E, lay, wf, ty, terr, pn);
    if (r.rec) cases[key] = r.rec;
    for (const e of r.errs) errs.push([key, ...e]);
  }
  console.log(`Matrice: ${n} configurazioni | motore sha1 ${hash}`);
  let code = 0;
  if (errs.length) {
    code |= 1;
    const g = {}; for (const [key, t, d] of errs) (g[t] || (g[t] = [])).push(`${key}: ${d}`);
    console.log(`\nINVARIANTI VIOLATI: ${errs.length} violazioni in ${new Set(errs.map(e => e[0])).size} configurazioni`);
    for (const t in g) { console.log(`  [${t}] x${g[t].length}`); g[t].slice(0, 3).forEach(s => console.log('     ' + s)) }
  } else console.log('Invarianti: OK (finiti, in range, set di chiavi atteso, marce decrescenti, effetti 0-100)');

  if (UPDATE) {
    const lines = Object.keys(cases).map(k => JSON.stringify(k) + ':' + JSON.stringify(cases[k]));
    fs.writeFileSync(SNAP, `{"format":1,"engine":"${hash}","count":${lines.length},"cases":{\n${lines.join(',\n')}\n}}\n`);
    console.log(`\nSnapshot scritto: ${SNAP} (${lines.length} casi, ${(fs.statSync(SNAP).size / 1024).toFixed(0)} KB)` + (errs.length ? '\nATTENZIONE: lo snapshot contiene configurazioni con invarianti violati.' : ''));
    return code;
  }
  if (!fs.existsSync(SNAP)) { console.log('\nNessuno snapshot: esegui con --update per crearlo.'); return code | 4 }
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')), c = compare(snap.cases, cases);
  const same = !c.added.length && !c.removed.length && !c.changed.length;
  if (same) console.log(`Snapshot: IDENTICO${snap.engine !== hash ? ` (codice del motore modificato: ${snap.engine} -> ${hash}, risultati invariati)` : ''}`);
  else {
    code |= 2;
    console.log(`\nSNAPSHOT DIVERSO: ${c.changed.length} configurazioni cambiate, ${c.added.length} nuove, ${c.removed.length} rimosse`);
    const rows = Object.entries(c.byParam).sort((a, b) => b[1].max - a[1].max).slice(0, 25);
    console.log('  parametro            casi   max|delta|   layout | profili');
    for (const [p, e] of rows) console.log('  ' + p.padEnd(20) + String(e.n).padStart(5) + '  ' + (isFinite(e.max) ? e.max.toPrecision(3) : 'cambio struttura').padStart(12) + '   ' + [...e.lays].join(',') + ' | ' + [...e.parts].join(','));
    if (Object.keys(c.byParam).length > 25) console.log(`  ... altri ${Object.keys(c.byParam).length - 25} parametri`);
    console.log('Se le differenze sono volute: node tools/safety-net.js --update');
  }
  return code;
}
try { process.exitCode = main() } catch (x) { console.error('ERRORE:', x.message); process.exitCode = 8 }
