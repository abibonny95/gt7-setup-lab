#!/usr/bin/env node
/* Setup Lab - controllo del modello PP con aerodinamica (CAL.ppAero, leva dfk, ciclo di calibrazione).
   Estrae il motore da index.html come safety-net.js ed esegue casi con risultato noto calcolato a mano, piu' invarianti su una griglia.
   Con --baseline=percorso/index.html (versione precedente) confronta anche i piani con ppAero = 0: devono essere identici.

   Uso: node tools/aero-pp-check.js [--file=index.html] [--baseline=index_vecchio.html]
   Uscita: 0 ok, 1 controlli falliti, 8 errore. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2), arg = n => (args.find(a => a.startsWith('--' + n + '=')) || '').slice(n.length + 3);
const M0 = '/* ===== DATI ===== */', M1 = '/* ===== LINGUA (IT / EN) ===== */';
function load(f) {
  const html = fs.readFileSync(f, 'utf8'), a = html.indexOf(M0), b = html.indexOf(M1);
  if (a < 0 || b <= a) throw new Error('Marcatori del motore non trovati in ' + f);
  /* i nomi mancanti (motore precedente senza aero) diventano undefined invece di far fallire il caricamento */
  const names = ['gen', 'effCar', 'dModel', 'dAero', 'aeroMeans', 'ppPred', 'calibrate', 'solvePlan', 'plDefault', 'defRanges', 'CIRCUITS', 'CAL', 'PL', 'has'];
  return vm.runInNewContext(html.slice(a, b) + '\n;({' + names.map(n => `${n}:(typeof ${n}==='undefined'?undefined:${n})`).join(',') + '})', {}, { filename: f });
}
const file = path.resolve(arg('file') || path.join(__dirname, '..', 'index.html'));
const E = load(file);
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FALLITO  ' + msg) } };
const near = (a, b, t, msg) => ok(Math.abs(a - b) <= t, `${msg}: ${a} vs ${b} (tol ${t})`);

const mkCar = (o = {}) => ({ name: 't', engine: 'F', drive: 'RWD', weight: 1300, wf: 52, power: 350, torque: 400, asp: 'NA', cg: 'auto', pp: 560, ppNow: 640,
  gears: 6, tyre: 'SM', tyreR: 'SM', aero: true, inst: { susp: 'full', lsd: true, tv: true, aero: true, brk: true, trans: true, ws: true },
  comp: { ecu: true, rst: true, bal: true, aero: true }, terrain: 'asfalto', style: 'neutro', prof: { ...E.CIRCUITS.spa.p },
  ae: { Rg: E.defRanges(), base: { dfF: .5, dfR: .5 }, cur: { dfF: 20, dfR: 60 } }, ...o });
const plan0 = () => ({ ...E.plDefault() });

/* 1) valori noti: livelli base .5/.5, attuali 20/60 su range 0-100 -> livello attuale medio .4 */
console.log('1) contributo aero con valori calcolati a mano');
E.CAL.ppAero = 0;
near(E.dAero(mkCar(), plan0()), 0, 1e-12, 'ppAero=0 -> contributo 0');
E.CAL.ppAero = 40;
near(E.dAero(mkCar(), plan0()), 4, 1e-9, 'dfk=100: 40*(0.5-0.4)=+4');
near(E.dAero(mkCar(), { ...plan0(), dfk: 50 }), -6, 1e-9, 'dfk=50: 40*(0.25-0.4)=-6');
near(E.dAero(mkCar({ ae: { ...mkCar().ae, cur: {} } }), plan0()), 0, 1e-9, 'senza valori attuali: contributo 0 a dfk=100');
near(E.dAero(mkCar({ ae: { ...mkCar().ae, cur: {} } }), { ...plan0(), dfk: 50 }), -10, 1e-9, 'senza valori attuali, dfk=50: 40*(0.25-0.5)=-10');
near(E.dAero(mkCar({ ae: { ...mkCar().ae, base: {} } }), plan0()), 0, 1e-12, 'senza livelli generati: 0');
near(E.dAero(mkCar({ inst: { ...mkCar().inst, aero: false } }), plan0()), 0, 1e-12, 'aero non installata: 0');
near(E.dAero(mkCar({ ae: undefined }), plan0()), 0, 1e-12, 'senza contesto aero: 0');
/* limiti utente: stesso valore fisico, range diverso -> livello diverso, quindi contributo diverso */
{ const c = mkCar(); c.ae = { ...c.ae, Rg: { ...c.ae.Rg, dfF: { min: 0, max: 200, step: 1 }, dfR: { min: 0, max: 200, step: 1 } } };
  near(E.dAero(c, plan0()), 40 * (.5 - .2), 1e-9, 'limiti 0-200: livelli attuali 0.1/0.3 -> media 0.2'); }
/* valori attuali fuori range: clamp 0..1, nessun NaN */
near(E.dAero(mkCar({ ae: { ...mkCar().ae, cur: { dfF: -50, dfR: 900 } } }), plan0()), 40 * (.5 - .5), 1e-9, 'valori attuali fuori range: clamp');

/* 2) ciclo di calibrazione: lam vero 1.3, PP letti con aero applicato */
console.log('2) calibrazione lam con aero');
{ const c = mkCar(), pl = { ...plan0(), ecu: 80, bal: 60, balp: 0, dfk: 70 }, lamTrue = 1.3;
  const obs = c.ppNow + lamTrue * E.dModel(c, pl) + E.dAero(c, pl);
  near(E.calibrate(c, pl, obs, 1), lamTrue, 1e-9, 'lam recuperato dai PP letti');
  near(E.ppPred(c, pl, lamTrue), obs, 1e-9, 'ppPred coerente con i PP letti'); }

/* 3) piano con aero come leva */
console.log('3) solvePlan con aero come leva');
const Rg = E.defRanges();
{ const c = mkCar(), pl = plan0();
  for (const mode of ['off', 'use']) {
    const r = E.solvePlan(c, pl, 1, { share: .6, method: 'ecu', pos: 'auto', aero: mode }, Rg);
    const pred = E.ppPred(c, r.plan, 1);
    console.log(`   aero=${mode}: dfk ${r.plan.dfk}%, ecu ${r.plan.ecu}%, zavorra ${r.plan.bal} kg, previsti ${pred.toFixed(1)} (target ${c.pp}), stato ${r.state}`);
    ok(Math.abs(pred - c.pp) <= 1.5, `${mode}: PP previsti vicini al target (${pred.toFixed(1)})`);
    ok(r.plan.dfk >= Rg.dfk.min && r.plan.dfk <= 100, `${mode}: dfk nei limiti`);
    if (mode === 'off') ok(r.plan.dfk === 100, 'off: dfk resta 100');
    if (mode === 'use') ok(r.plan.dfk < 100, 'use: dfk ridotto');
  }
  /* con la leva aero il piano chiede meno a potenza/peso */
  const a = E.solvePlan(c, pl, 1, { share: .6, method: 'ecu', pos: 'auto', aero: 'off' }, Rg).plan, b = E.solvePlan(c, pl, 1, { share: .6, method: 'ecu', pos: 'auto', aero: 'use' }, Rg).plan;
  ok(b.ecu >= a.ecu && b.bal <= a.bal && (b.ecu > a.ecu || b.bal < a.bal), 'con aero come leva servono meno riduzioni di potenza/peso');
  /* ppAero = 0: la leva non si muove e il piano e' quello senza aero */
  E.CAL.ppAero = 0;
  const z = E.solvePlan(c, pl, 1, { share: .6, method: 'ecu', pos: 'auto', aero: 'use' }, Rg).plan;
  ok(z.dfk === 100, 'ppAero=0: dfk resta 100 anche con la leva attiva');
  E.CAL.ppAero = 40;
  /* bersaglio sopra i PP attuali: l'aero non deve alzare dfk oltre 100 ne' inventare riduzioni */
  const up = E.solvePlan(mkCar({ pp: 700 }), pl, 1, { share: .6, method: 'ecu', pos: 'auto', aero: 'use' }, Rg);
  ok(up.plan.dfk === 100 && up.plan.ecu === 100 && up.plan.bal === 0, 'target sopra i PP attuali: piano neutro'); }

/* 3b) la quota dfk scala davvero la deportanza generata (range di riferimento 0-100, livelli base del generatore) */
console.log('3b) gen con quota dfk');
{ const c = mkCar(), inv = { toe: true, bb: true }, lvN = { dfF: null, dfR: null, ts: null, rsa: null };
  const g100 = E.gen(E.effCar(c, plan0()), Rg, inv, lvN), g50 = E.gen(E.effCar(c, { ...plan0(), dfk: 50 }), Rg, inv, lvN);
  ok(g100.S.dfF > 10 && g100.S.dfR > 10, 'caso di prova con deportanza suggerita significativa');
  near(g50.S.dfF, g100.S.dfF * .5, 1, 'dfk 50 dimezza dfF'); near(g50.S.dfR, g100.S.dfR * .5, 1, 'dfk 50 dimezza dfR');
  near(g50.auto.dfF, g100.auto.dfF, 1e-12, 'auto[] resta il livello pieno');
  /* livello scelto dall'utente: la quota si applica a quello */
  const gl = E.gen(E.effCar(c, { ...plan0(), dfk: 50 }), Rg, inv, { ...lvN, dfF: .8, dfR: .6 });
  near(gl.S.dfF, 40, 1, 'livello utente 0.8 x dfk 50 = 40'); near(gl.S.dfR, 30, 1, 'livello utente 0.6 x dfk 50 = 30'); }

/* 4) griglia di invarianti */
console.log('4) invarianti su griglia (layout, aero, ppAero, gap)');
let nGrid = 0;
for (const ppA of [0, 15, 40, 120]) { E.CAL.ppAero = ppA;
  for (const drive of ['FWD', 'RWD', 'AWD']) for (const gap of [-120, -40, -5, 0, 30]) for (const aero of ['off', 'use']) for (const cur of [{}, { dfF: 30, dfR: 90 }, { dfF: 0, dfR: 0 }]) for (const hasAero of [true, false]) {
    const c = mkCar({ drive, pp: 640 + gap, ae: { Rg, base: { dfF: .62, dfR: .48 }, cur }, comp: { ecu: true, rst: true, bal: true, aero: hasAero }, inst: { ...mkCar().inst, aero: hasAero } });
    const r = E.solvePlan(c, plan0(), 1, { share: .6, method: 'ecu', pos: 'auto', aero }, Rg), p = r.plan, pr = E.ppPred(c, p, 1);
    nGrid++;
    ok([p.ecu, p.rst, p.bal, p.balp, p.dfk, pr, r.left].every(Number.isFinite), `finiti (${drive} gap ${gap} ${aero} ppAero ${ppA})`);
    ok(p.dfk >= Rg.dfk.min && p.dfk <= 100 && (hasAero || p.dfk === 100), `dfk valido (${drive} gap ${gap} ${aero} ${hasAero})`);
    /* il generatore con quota dfk < 100 non deve produrre valori fuori range ne' NaN e deve ridurre (mai aumentare) la deportanza */
    const g100 = E.gen(E.effCar(c, plan0()), Rg, { toe: true, bb: true }, { dfF: null, dfR: null, ts: null, rsa: null });
    const gk = E.gen(E.effCar(c, p), Rg, { toe: true, bb: true }, { dfF: null, dfR: null, ts: null, rsa: null });
    ok(Object.values(gk.S).every(Number.isFinite), 'gen finito con dfk');
    if (!hasAero) { ok(gk.S.dfF === undefined && g100.S.dfF === undefined, 'senza aero installata: nessun valore aero'); continue }
    if (p.dfk < 100) ok(gk.S.dfF < g100.S.dfF && gk.S.dfR < g100.S.dfR, `dfk ${p.dfk} riduce davvero la deportanza (${gk.S.dfF}/${g100.S.dfF})`);
    ok(gk.S.dfF <= g100.S.dfF + 1e-9 && gk.S.dfR <= g100.S.dfR + 1e-9, `deportanza non aumenta con dfk<100 (${gk.S.dfF}/${g100.S.dfF})`);
    ok(gk.S.dfF >= Rg.dfF.min && gk.S.dfF <= Rg.dfF.max && gk.S.dfR >= Rg.dfR.min && gk.S.dfR <= Rg.dfR.max, 'deportanza nei limiti');
    if (p.dfk === 100) ok(gk.S.dfF === g100.S.dfF && gk.S.dfR === g100.S.dfR, 'dfk=100: setup identico');
  } }
console.log(`   ${nGrid} configurazioni`);

/* 5) regressione: con ppAero = 0 i piani coincidono con quelli del motore precedente */
const base = arg('baseline');
if (base) {
  console.log('5) regressione contro ' + base + ' (ppAero = 0)');
  const O = load(path.resolve(base));
  E.CAL.ppAero = 0; let n = 0;
  for (const drive of ['FWD', 'RWD']) for (const gap of [-150, -60, -10, 0, 40]) for (const share of [.25, .6, .85]) for (const method of ['ecu', 'rst']) for (const cur of [{}, { dfF: 30, dfR: 90 }]) {
    const co = mkCar({ drive, pp: 640 + gap }); delete co.ae; delete co.comp.aero;
    const cn = mkCar({ drive, pp: 640 + gap, ae: { Rg, base: { dfF: .6, dfR: .5 }, cur } });
    const op = { share, method, pos: 'auto' }, ro = O.solvePlan(co, O.plDefault(), 1, op, O.defRanges()), rn = E.solvePlan(cn, E.plDefault(), 1, { ...op, aero: 'use' }, Rg);
    n++;
    const same = ['ecu', 'rst', 'bal', 'balp'].every(k => ro.plan[k] === rn.plan[k]) && ro.state === rn.state;
    ok(same, `piano identico (${drive} gap ${gap} share ${share} ${method}): ${JSON.stringify(ro.plan)} vs ${JSON.stringify(rn.plan)}`);
    near(O.ppPred(co, ro.plan, 1), E.ppPred(cn, rn.plan, 1), 1e-9, 'ppPred identico');
  }
  console.log(`   ${n} piani confrontati`);
} else console.log('5) regressione saltata (nessun --baseline)');

console.log(`\n${checks} controlli | falliti: ${fails}`);
process.exitCode = fails ? 1 : 0;
