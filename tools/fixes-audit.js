#!/usr/bin/env node
/* Setup Lab - audit del segno delle Correzioni rapide (FIXES).
   Per ogni layout applica ogni correzione con la stessa formula di applyFix() (delta in frazione dei limiti, inversione del toe,
   segno di lsdA per layout, arrotondamento al passo e clamp) e controlla che la barra interessata si muova nel verso dichiarato dal nome.
   La variazione e' misurata con bias neutro a 50, perche' per FF e 4WD la barra os parte sotto 0 e il clamp 0-100 la blocca.
   Uso: node tools/fixes-audit.js [--file=percorso/index.html]   Uscita: 0 ok, 1 verso sbagliato, 8 errore. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const fileArg = (process.argv.slice(2).find(a => a.startsWith('--file=')) || '').slice(7);
const cands = fileArg ? [path.resolve(fileArg)] : [path.resolve(process.cwd(), 'index.html'), path.join(__dirname, '..', 'index.html')];
function main() {
  const f = cands.find(p => fs.existsSync(p));
  if (!f) throw new Error('index.html non trovato (' + cands.join(', ') + ')');
  const html = fs.readFileSync(f, 'utf8');
  const a = html.indexOf('/* ===== DATI ===== */'), b = html.indexOf('/* ===== LINGUA (IT / EN) ===== */');
  const fa = html.indexOf('const FIXES=['), fb = html.indexOf('];', fa) + 2;
  if (a < 0 || b <= a || fa < 0) throw new Error('Marcatori del motore o FIXES non trovati in index.html');
  /* sintassi dell'intero <script>, che la rete di sicurezza non copre (UI, FIXES, applyFix) */
  new vm.Script(html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>')), { filename: 'script' });
  const X = vm.runInNewContext(html.slice(a, b) + '\n' + html.slice(fa, fb) +
    '\n;({gen,effects,biasOf,effCar,defRanges,CIRCUITS,FIXES,PK,invOf,clamp,decs,LSDA_SIGN:(typeof LSDA_SIGN!=="undefined"?LSDA_SIGN:null)})', {});
  const LAY = { FF: ['F', 'FWD'], FR: ['F', 'RWD'], MR: ['M', 'RWD'], RR: ['R', 'RWD'], '4WD': ['F', 'AWD'] };
  /* nome -> [barra, +1 deve salire / -1 deve scendere]; le correzioni non elencate non hanno un verso univoco sulle barre */
  const EXP = {
    'Sottosterzo in curva': ['os', 1], 'Sovrasterzo in curva': ['os', -1], 'Sottosterzo in ingresso': ['os', 1], 'Sovrasterzo in rilascio': ['os', -1],
    'Sottosterzo in uscita': ['os', 1], 'Sovrasterzo in uscita': ['os', -1], 'Sottosterzo ad alta velocità': ['os', 1], 'Sovrasterzo ad alta velocità': ['os', -1],
    'Instabile ad alta velocità': ['stab', 1] };
  /* contraddizioni note tra FIXES e pesi di FX, da risolvere con una decisione di modello (non sono bug di segno certi): non fanno fallire il controllo */
  const OPEN = new Set(['Instabile ad alta velocità|rhR']);   /* la correzione abbassa rhR, ma FX.rhR ha stab:+.2 (rhR piu' alto = piu' stabile) */
  const INV = { toe: true, bb: true }, R = X.defRanges(), b50 = { os: 50, turn: 50, stab: 50, trac: 50, brk: 50, grip: 50 }, bad = [], opp = [], open = [], notes = [];
  let n = 0;
  for (const lay in LAY) {
    const car = { name: 't', engine: LAY[lay][0], drive: LAY[lay][1], weight: 1100, wf: 52, stabL: '', stabH: '', rotL: 0, rotM: 0, rotH: 0, power: 250, torque: 300,
      asp: 'NA', cg: 'auto', pp: 600, ppNow: 640, gears: 6, tyre: 'SM', tyreR: 'SM', aero: true,
      inst: { susp: 'full', lsd: true, tv: true, aero: true, brk: true, trans: true, ws: true }, comp: { ecu: true, rst: true, bal: true },
      terrain: 'asfalto', style: 'neutro', prof: { ...X.CIRCUITS.spa.p } };
    const carE = X.effCar(car, { ecu: 100, rst: 100, bal: 0, balp: 0 });
    const g = X.gen(carE, R, INV, { dfF: null, dfR: null, ts: null, rsa: null }), bias = X.biasOf(carE, g.L, g.g, g.r);
    for (const k in bias) if (bias[k] < 0 || bias[k] > 100) notes.push(`bias.${k} ${lay} = ${bias[k].toFixed(1)}: fuori 0-100, la barra reale resta bloccata`);
    const sgn = X.LSDA_SIGN ? (X.LSDA_SIGN[g.L] || 1) : (g.L === 'FF' ? -1 : 1);
    for (const [name, d] of X.FIXES) {
      if (!EXP[name]) continue;
      const S = { ...g.S }, B = { ...g.S }, [idx, want] = EXP[name];
      /* applica un singolo parametro della correzione come fa applyFix; ritorna la variazione della barra bersaglio */
      const step1 = (T, k) => {
        const u = R[k]; let dt = d[k]; if (d._s && k === 'lsdA') dt *= sgn; if (X.invOf(X.PK[k], INV)) dt = -dt;
        T[k] = +X.clamp(Math.round((T[k] + dt * (u.max - u.min)) / u.step) * u.step, u.min, u.max).toFixed(X.decs(u.step));
      };
      const e0 = X.effects(carE, B, B, R, INV, b50);
      for (const k in d) {
        if (k === '_s' || !(k in S)) continue;
        step1(S, k);
        /* componente singola: se spinge la barra bersaglio nel verso opposto a quello della correzione, e' un segno sbagliato o un compromesso da rivedere */
        const T1 = { ...B }; step1(T1, k); const dk = X.effects(carE, T1, B, R, INV, b50)[idx] - e0[idx];
        if (dk * want < -1e-9) (OPEN.has(name + '|' + k) ? open : opp).push(`${lay.padEnd(4)} ${name}: ${k} spinge ${idx} ${dk >= 0 ? '+' : ''}${dk.toFixed(2)} (atteso ${want > 0 ? 'su' : 'giu'})`);
      }
      const e1 = X.effects(carE, S, B, R, INV, b50), delta = e1[idx] - e0[idx];
      n++; if (!(delta * want > 1e-9)) bad.push(`${lay.padEnd(4)} ${name}: ${idx} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (atteso ${want > 0 ? 'su' : 'giu'})`);
    }
  }
  console.log(`Correzioni controllate: ${n} | verso netto sbagliato: ${bad.length} | componenti contrarie: ${opp.length} | note aperte: ${open.length} | sintassi <script>: OK`);
  bad.forEach(s => console.log('  SBAGLIATO  ' + s));
  opp.forEach(s => console.log('  CONTRARIA  ' + s));
  open.forEach(s => console.log('  APERTA     ' + s));
  notes.forEach(s => console.log('  NOTA  ' + s));
  return bad.length || opp.length ? 1 : 0;
}
try { process.exitCode = main() } catch (x) { console.error('ERRORE:', x.message); process.exitCode = 8 }
