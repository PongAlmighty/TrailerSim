'use strict';
// UI: state, controls, readouts. State is always stored in lb / in / mph; units only affect display.

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const S = { units: 'imp', speed: 55, hitch: 'receiver', wdRestore: 0.75, veh: null, trl: null, cargo: [], load: { front: 180, rear: 0, cargo: 100, cargoPos: 0.5 } };
let R = null;

const UNIT = {
  lb: { imp: [1, 'lb'], met: [0.45359237, 'kg'] },
  in: { imp: [1, 'in'], met: [25.4, 'mm'] },
  mph: { imp: [1, 'mph'], met: [1.609344, 'km/h'] },
  pct: { imp: [100, '%'], met: [100, '%'] },
  n: { imp: [1, ''], met: [1, ''] },
};
const uf = u => UNIT[u][S.units];
const fmt = (x, u, dp = 0) => (x * uf(u)[0]).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp }) + (uf(u)[1] ? ' ' + uf(u)[1] : '');
const fW = x => fmt(x, 'lb'), fL = x => fmt(x, 'in'), fV = x => fmt(x, 'mph');
const fM = x => (x * uf('lb')[0] * uf('in')[0]).toLocaleString('en-US', { maximumFractionDigits: 0 });

// ---------- controls ----------
const refreshers = { veh: [], trl: [], cargo: [], drive: [] };
function ctl(parent, group, o) { // o: {label, unit, min, max, step, get, set}
  const row = el('div', 'ctl'), head = el('div', 'ctl-head');
  const lab = el('label', null, o.label), num = el('input'), unit = el('span', 'unit'), range = el('input');
  num.type = 'number'; range.type = 'range'; range.setAttribute('aria-label', o.label);
  head.append(lab, num, unit); row.append(head, range); parent.append(row);
  const dp = o.unit === 'pct' ? 1 : 0;
  const show = () => +(o.get() * uf(o.unit)[0]).toFixed(dp);
  const refresh = () => {
    const [f, name] = uf(o.unit);
    const step = S.units === 'met' && o.unit === 'lb' ? o.step / 2 : S.units === 'met' && o.unit === 'in' ? o.step * 25 : o.unit === 'pct' ? o.step * 100 : o.step;
    range.min = o.min * f; range.max = o.max * f; range.step = step; range.value = o.get() * f;
    if (document.activeElement !== num) num.value = show();
    unit.textContent = name;
  };
  range.addEventListener('input', () => { o.set(range.value / uf(o.unit)[0]); num.value = show(); update(); });
  num.addEventListener('change', () => { o.set(clamp((+num.value || 0) / uf(o.unit)[0], o.min, o.max)); update(true); });
  refreshers[group].push(refresh); refresh();
}
const prop = (obj, key) => ({ get: () => obj[key], set: x => { obj[key] = x; } });
function refreshAll() { Object.values(refreshers).forEach(g => g.forEach(f => f())); }

function buildVehicle() {
  const box = $('veh'); box.textContent = ''; refreshers.veh = [];
  const sel = el('select'); sel.setAttribute('aria-label', 'Tow vehicle');
  VEHICLES.forEach(v => sel.append(new Option(v.name, v.id, false, v.id === S.veh.id)));
  sel.addEventListener('change', () => { setVehicle(sel.value); buildVehicle(); buildTrailer(); buildCargo(); update(); });
  box.append(sel);
  const v = S.veh, L = S.load, g = el('div', 'grid2');
  const c = (p, o, k, label, unit, min, max, step) => ctl(p, 'veh', { label, unit, min, max, step, ...prop(o, k) });
  c(box, v, 'curb', 'Vehicle weight (empty, curb)', 'lb', 2000, 12000, 50);
  box.append(g);
  c(g, L, 'front', 'Front occupants', 'lb', 0, 600, 10);
  c(g, L, 'rear', 'Rear passengers', 'lb', 0, 900, 10);
  c(g, L, 'cargo', v.body === 'pickup' ? 'Bed cargo' : 'Cargo', 'lb', 0, Math.max(1000, v.gvwr - v.curb), 10);
  c(g, L, 'cargoPos', 'Cargo position (front → rear)', 'pct', 0, 1, 0.01);
  const d = el('details'), dg = el('div', 'grid2'); d.append(el('summary', null, 'Vehicle specs and ratings'), dg); box.append(d);
  c(dg, v, 'ff', 'Curb weight on front axle', 'pct', 0.4, 0.7, 0.01);
  c(dg, v, 'wb', 'Wheelbase', 'in', 90, 200, 1);
  c(dg, v, 'ballOH', 'Rear axle to hitch ball', 'in', 30, 80, 1);
  c(dg, v, 'gvwr', 'GVWR', 'lb', 3000, 16000, 50);
  c(dg, v, 'gcwr', 'GCWR', 'lb', 4000, 45000, 100);
  c(dg, v, 'gawrF', 'Front axle rating (GAWR)', 'lb', 1500, 8000, 50);
  c(dg, v, 'gawrR', 'Rear axle rating (GAWR)', 'lb', 1500, 12000, 50);
  c(dg, v, 'tow', 'Tow rating', 'lb', 0, 25000, 100);
  c(dg, v, 'tongueMax', 'Hitch tongue rating', 'lb', 0, 3000, 10);
  if (v.tow5) c(dg, v, 'tow5', 'Fifth-wheel / gooseneck rating', 'lb', 0, 40000, 100);
}

function buildTrailer() {
  const box = $('trl'); box.textContent = ''; refreshers.trl = [];
  const t = S.trl, canBed = S.veh.tow5 > 0;
  const sel = el('select'); sel.setAttribute('aria-label', 'Trailer type');
  TRAILERS.forEach(x => { const o = new Option(x.name + (x.coupler !== 'ball' && !canBed ? ' (needs a full-size pickup)' : ''), x.id, false, x.id === t.id); o.disabled = x.coupler !== 'ball' && !canBed; sel.append(o); });
  sel.addEventListener('change', () => { setTrailer(sel.value); buildTrailer(); buildCargo(); update(); });
  const hs = el('select'); hs.setAttribute('aria-label', 'Hitch type'); hs.style.marginTop = '8px';
  (t.coupler === 'ball' ? ['receiver', 'wdh', 'pintle'] : [t.coupler]).forEach(h => hs.append(new Option(HITCHES[h].name, h, false, h === S.hitch)));
  hs.addEventListener('change', () => { S.hitch = hs.value; buildTrailer(); update(); });
  box.append(sel, hs);
  const c = (p, o, k, label, unit, min, max, step) => ctl(p, 'trl', { label, unit, min, max, step, ...prop(o, k) });
  c(box, t, 'empty', 'Trailer weight (empty)', 'lb', 200, 16000, 50);
  if (S.hitch === 'wdh') c(box, S, 'wdRestore', 'Front axle load restored by the hitch', 'pct', 0, 1, 0.05);
  c(box, t, 'axlePct', 'Axle position (60% back is the 60/40 rule)', 'pct', 0.3, 0.9, 0.01);
  const d = el('details'), dg = el('div', 'grid2'); d.append(el('summary', null, 'Trailer specs and ratings'), dg); box.append(d);
  c(dg, t, 'cgPct', 'Empty CG (front → rear of bed)', 'pct', 0.3, 0.7, 0.01);
  c(dg, t, 'bed', 'Bed length', 'in', 60, 480, 2);
  if (t.coupler !== 'fifth') c(dg, t, 'tongue', t.coupler === 'ball' ? 'Tongue length' : 'Neck length', 'in', 24, 120, 1);
  c(dg, t, 'axles', 'Axles', 'n', 1, 3, 1);
  c(dg, t, 'gvwr', 'Trailer GVWR', 'lb', 1000, 30000, 50);
  c(dg, t, 'gawr', 'Axle rating (all axles)', 'lb', 1000, 30000, 50);
}

function buildCargo() {
  const box = $('cargo'); box.textContent = ''; refreshers.cargo = [];
  S.cargo.forEach((k, i) => {
    const it = el('div', 'item'), head = el('div', 'item-head'), name = el('input'), rm = el('button', null, '✕');
    name.type = 'text'; name.value = k.name; name.setAttribute('aria-label', 'Cargo name');
    name.addEventListener('input', () => { k.name = name.value; update(); });
    rm.title = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + k.name);
    rm.addEventListener('click', () => { S.cargo.splice(i, 1); buildCargo(); update(); });
    head.append(name, rm); it.append(head);
    const g = el('div', 'grid2'); it.append(g);
    ctl(g, 'cargo', { label: 'Weight', unit: 'lb', min: 0, max: Math.max(2000, S.trl.gvwr - S.trl.empty, k.w), step: 10, ...prop(k, 'w') });
    ctl(g, 'cargo', { label: 'Position (front → rear)', unit: 'pct', min: 0.03, max: 0.97, step: 0.01, ...prop(k, 'pos') });
    box.append(it);
  });
  const add = el('button', null, '+ Add cargo');
  add.addEventListener('click', () => { S.cargo.push({ name: 'Cargo ' + (S.cargo.length + 1), w: 300, pos: 0.5 }); buildCargo(); update(); });
  box.append(add);
}

function setVehicle(id) {
  S.veh = { ...VEHICLES.find(v => v.id === id) };
  if (S.trl && S.trl.coupler !== 'ball' && !S.veh.tow5) setTrailer('cargo14');
}
function setTrailer(id) {
  const p = TRAILERS.find(t => t.id === id);
  S.trl = { ...p }; S.cargo = p.cargo.map(c => ({ ...c }));
  S.hitch = p.coupler === 'ball' ? (HITCHES[S.hitch] && !['gooseneck', 'fifth'].includes(S.hitch) ? S.hitch : 'receiver') : p.coupler;
}

// ---------- readouts ----------
function update(sync) {
  R = compute(S);
  if (sync) refreshAll();

  const top = R.issues[0], hl = $('headline');
  hl.textContent = top ? top.msg : 'Load is balanced and within every rating.';
  hl.className = 'headline ' + (top ? top.status : 'ok');

  const [lo, hi] = R.range, pc = x => clamp(x / 0.30, 0, 1) * 100 + '%';
  $('tw-name').textContent = R.inBed ? 'Pin weight' : 'Tongue weight';
  $('tw-val').textContent = fW(R.TW) + ' · ' + (R.tonguePct * 100).toFixed(1) + '%';
  $('tw-val').className = R.tongueStatus;
  $('tw-band').style.left = pc(lo); $('tw-band').style.width = (hi - lo) / 0.30 * 100 + '%';
  $('tw-mark').style.left = pc(R.tonguePct); $('tw-mark').style.background = STATUS[R.tongueStatus];
  $('tw-target').textContent = 'target ' + lo * 100 + '–' + hi * 100 + '%';
  $('k-wt').textContent = fW(R.Wt); $('k-gvw').textContent = fW(R.GVW); $('k-gcw').textContent = fW(R.GCW);
  $('k-sway').textContent = R.sway.vcrit > 99 ? 'above ' + fV(99) : '≈ ' + fV(R.sway.vcrit);
  $('k-sway').style.color = S.speed > R.sway.vcrit ? STATUS.bad : S.speed > R.sway.vcrit * 0.85 ? STATUS.warn : '';

  const iss = $('issues'); iss.textContent = '';
  if (!R.issues.length) iss.append(el('li', 'ok', 'No problems found.'));
  R.issues.forEach(i => iss.append(el('li', i.status, i.msg)));
  const ch = $('checks'); ch.textContent = '';
  R.checks.forEach(k => {
    const d = el('div', 'check'), t = el('div', 'check-top'), bar = el('div', 'bar'), fill = el('i', k.status);
    t.append(el('span', null, k.label), el('span', null, fW(k.value) + ' / ' + fW(k.limit)));
    fill.style.width = clamp(k.pct, 0, 1) * 100 + '%'; bar.append(fill); d.append(t, bar);
    if (k.payload) d.append(el('small', null, 'Payload used: ' + fW(R.GVW - S.veh.curb) + ' of ' + fW(S.veh.gvwr - S.veh.curb)));
    ch.append(d);
  });
  renderMath();
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderMath() {
  const v = S.veh, wu = uf('lb')[1], lu = uf('in')[1];
  const rows = (items) => items.map(i => `<tr><td>${esc(i.name)}</td><td>${fW(i.w)}</td><td>${fL(i.d)}</td><td>${fM(i.w * i.d)}</td></tr>`).join('');
  const head = `<tr><th>Item</th><th>W</th><th>D from RDL</th><th>Moment (${wu}·${lu})</th></tr>`;
  const cbL = roundCB(R.cb * uf('in')[0]).toLocaleString('en-US') + ' ' + lu;
  const rigM = R.rigAxles.reduce((s, a) => s + a.w * a.d, 0);
  let h = `
  <h3>1. Trailer centre of balance <small class="hint">(RDL = coupler)</small></h3>
  <table>${head}${rows(R.tItems)}<tr class="total"><td>Total</td><td>${fW(R.Wt)}</td><td></td><td>${fM(R.Mt)}</td></tr></table>
  <div class="eq">CB = Σ(D × W) ÷ gross = ${fM(R.Mt)} ÷ ${fW(R.Wt)} = <b>${cbL}</b> behind the coupler</div>
  <h3>2. ${R.inBed ? 'Pin' : 'Tongue'} weight and axle load</h3>
  <div class="eq">axle centre A = ${fL(R.A)} behind the coupler</div>
  <div class="eq">axle load = W × CB ÷ A = ${fW(R.Wt)} × ${fL(R.cb)} ÷ ${fL(R.A)} = <b>${fW(R.Wt - R.TW)}</b></div>
  <div class="eq">${R.inBed ? 'pin' : 'tongue'} = W − axle load = <b>${fW(R.TW)}</b> = <b>${(R.tonguePct * 100).toFixed(1)}%</b> of trailer weight</div>
  <div class="eq">check: (D1 × W1 + D2 × W2) ÷ gross = (0 × ${fW(R.TW)} + ${fL(R.A)} × ${fW(R.Wt - R.TW)}) ÷ ${fW(R.Wt)} = ${fL(R.cb)}</div>`;
  if (S.hitch === 'wdh') h += `
  <h3>Weight distribution hitch</h3>
  <div class="eq">hitch moment M = ${fM(R.M)} ${wu}·${lu} (restores ${Math.round(R.restore * 100)}% of front axle load)</div>
  <div class="eq">shifted to trailer axles = M ÷ A = <b>${fW(R.M / R.A)}</b> → ball load ${fW(R.V)}, trailer axles ${fW(R.tAxle)}</div>`;
  h += `
  <h3>3. Tow vehicle axle loads</h3>
  <div class="eq">before hitching: front ${fW(R.F0)}, rear ${fW(R.R0)} (wheelbase ${fL(v.wb)}, hitch ${fL(Math.abs(R.OH))} ${R.OH < 0 ? 'ahead of' : 'behind'} rear axle)</div>
  <div class="eq">front = ${fW(R.F0)} − ${fW(R.V)} × ${fL(R.OH)} ÷ ${fL(v.wb)}${R.M ? ' + M ÷ ' + fL(v.wb) : ''} = <b>${fW(R.F)}</b></div>
  <div class="eq">rear = ${fW(R.R0)} + ${fW(R.V)} × ${fL(v.wb + R.OH)} ÷ ${fL(v.wb)}${R.M ? ' − M ÷ ' + fL(v.wb) : ''} = <b>${fW(R.R)}</b></div>
  <h3>4. Whole-rig centre of balance <small class="hint">(RDL = front bumper)</small></h3>
  <table>${head}${rows(R.rigAxles)}<tr class="total"><td>Total</td><td>${fW(R.GCW)}</td><td></td><td>${fM(rigM)}</td></tr></table>
  <div class="eq">CB = ${fM(rigM)} ÷ ${fW(R.GCW)} = <b>${roundCB(R.rigCB * uf('in')[0]).toLocaleString('en-US')} ${lu}</b> from the RDL</div>`;
  $('math').innerHTML = h;
}

// ---------- axle-scale worksheet (the page's formula, standalone) ----------
const EXAMPLES = [
  [[20, 2870], [150, 2550]],
  [[15, 250], [102, 2250]],
  [[70, 12500], [222, 12900], [276, 12700]],
];
let sheet = EXAMPLES[0].map(r => r.slice());
function buildSheet() {
  const box = $('sheet'); box.textContent = '';
  const hd = el('div', 'sheet-row'); ['Axle', 'D (distance)', 'W (weight)', 'Moment', ''].forEach(t => hd.append(el('span', null, t))); box.append(hd);
  const out = el('div', 'eq');
  const calc = () => {
    const gross = sheet.reduce((s, r) => s + r[1], 0), mom = sheet.reduce((s, r) => s + r[0] * r[1], 0);
    box.querySelectorAll('.mom').forEach((m, i) => { m.textContent = (sheet[i][0] * sheet[i][1]).toLocaleString('en-US'); });
    out.innerHTML = gross > 0 ? `CB = ${mom.toLocaleString('en-US')} ÷ ${gross.toLocaleString('en-US')} = ${(mom / gross).toFixed(2)} → <b>${roundCB(mom / gross)}</b> from the RDL` : 'Enter axle weights.';
  };
  sheet.forEach((r, i) => {
    const row = el('div', 'sheet-row'); row.append(el('span', null, '#' + (i + 1)));
    [0, 1].forEach(j => { const inp = el('input'); inp.type = 'number'; inp.value = r[j]; inp.setAttribute('aria-label', (j ? 'Weight' : 'Distance') + ' for axle ' + (i + 1)); inp.addEventListener('input', () => { r[j] = +inp.value || 0; calc(); }); row.append(inp); });
    row.append(el('span', 'mom'));
    const rm = el('button', null, '✕'); rm.style.padding = '2px 6px'; rm.setAttribute('aria-label', 'Remove axle ' + (i + 1)); rm.disabled = sheet.length < 2;
    rm.addEventListener('click', () => { sheet.splice(i, 1); buildSheet(); });
    row.append(rm); box.append(row);
  });
  const btns = el('div', 'sheet-btns'), add = el('button', null, '+ Axle');
  add.addEventListener('click', () => { sheet.push([0, 0]); buildSheet(); }); btns.append(add);
  EXAMPLES.forEach((ex, n) => { const b = el('button', null, 'Example ' + (n + 1)); b.addEventListener('click', () => { sheet = ex.map(r => r.slice()); buildSheet(); }); btns.append(b); });
  box.append(btns, out); calc();
}

// ---------- wiring ----------
function setUnits(u) { S.units = u; $('u-imp').classList.toggle('on', u === 'imp'); $('u-met').classList.toggle('on', u === 'met'); update(true); }
$('u-imp').addEventListener('click', () => setUnits('imp'));
$('u-met').addEventListener('click', () => setUnits('met'));
const lane = n => { setLane(n); $('lane-l').classList.toggle('on', n === 1); $('lane-r').classList.toggle('on', n === 0); };
$('lane-l').addEventListener('click', () => lane(1));
$('lane-r').addEventListener('click', () => lane(0));
$('gust').addEventListener('click', gust);
$('pause').addEventListener('click', () => { sim.paused = !sim.paused; $('pause').textContent = sim.paused ? 'Resume' : 'Pause'; });
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
  if (e.key === 'ArrowUp') lane(1); else if (e.key === 'ArrowDown') lane(0);
  else if (e.key === 'ArrowRight') S.speed = Math.min(90, S.speed + 5); else if (e.key === 'ArrowLeft') S.speed = Math.max(0, S.speed - 5);
  else return;
  e.preventDefault(); update(true);
});

setVehicle('halfton'); setTrailer('travel');
R = compute(S);
ctl($('speed-ctl'), 'drive', { label: 'Speed', unit: 'mph', min: 0, max: 90, step: 1, ...prop(S, 'speed') });
buildVehicle(); buildTrailer(); buildCargo(); buildSheet();
lane(0); update();
startSim($('top'), $('side'));
