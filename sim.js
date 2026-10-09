'use strict';
// Driving animation: top and side views of the rig on an endless road.
// World x is inches ahead of the hitch point (trailer is negative); lateral y is inches left of the road centre.

const LANE = 144, SQUAT_GAIN = 1, MPH = 17.6; // lane width (in); squat drawn to scale; in/s per mph
const sim = {
  y: -LANE / 2, vy: 0, ay: 0, yFrom: -LANE / 2, yTo: -LANE / 2, tau: 1, lane: 0,
  psi: 0, phi: 0, sig: 0, sigd: 0, env: 0, dist: 0, v: 55, paused: false, sc: 1, hitchX: 0, hits: [],
  zoom: false, sideSc: 1, sideX: 0, // side view framing; zoom fills it with the tow vehicle
};

function setLane(n) {
  if (n === sim.lane) return;
  sim.lane = n; sim.yFrom = sim.y; sim.yTo = n ? LANE / 2 : -LANE / 2; sim.tau = 0;
}
function gust() { sim.sigd += 0.22; }

function stepSim(dt) {
  sim.v += clamp(S.speed - sim.v, -12 * dt, 8 * dt);
  const mph = sim.v, v = mph * MPH, sw = R.sway;

  // lane change: quintic ease, then a stiff follower to get smooth velocity and acceleration
  if (sim.tau < 1) sim.tau = Math.min(1, sim.tau + dt / 3.5 * Math.min(1, mph / 15));
  const q = sim.tau, yCmd = sim.yFrom + (sim.yTo - sim.yFrom) * q * q * q * (10 - 15 * q + 6 * q * q);
  sim.ay = 64 * (yCmd - sim.y) - 16 * sim.vy;
  sim.vy += sim.ay * dt; sim.y += sim.vy * dt;
  sim.psi = Math.atan2(sim.vy, Math.max(v, 200));
  if (!S.trl) { sim.sig = sim.sigd = sim.env = 0; sim.phi = sim.psi; sim.dist += v * dt; return; }

  // sway: a damped oscillator whose damping goes negative above the onset speed,
  // with amplitude-dependent damping so it settles into a limit cycle instead of diverging
  const ratio = mph / sw.vcrit;
  const zeta = clamp(0.3 * (1 - ratio * ratio), -0.25, 0.3) + 0.5 * (sim.sig / 0.3) ** 2;
  const om = sw.omega * (0.6 + 0.4 * Math.min(1, mph / 50));
  const noise = (Math.random() - 0.5) * 0.5 * (mph / 60) ** 2;
  const live = Math.min(1, mph / 10);
  sim.sigd += (-2 * zeta * om * sim.sigd - om * om * sim.sig + (0.5 * sim.ay / R.A + noise) * live) * dt;
  sim.sig += sim.sigd * dt;
  sim.env = Math.max(Math.abs(sim.sig), sim.env * Math.exp(-dt / 1.5));

  const psiT = carHeading();
  sim.phi += (v / R.A) * Math.sin(psiT - sim.phi) * dt;
  sim.dist += v * dt;
}
// the swaying trailer steers the tow vehicle the other way
function carHeading() { return sim.psi - sim.sig * 0.15 * Math.min(1.5, R.sway.massRatio); }

function fit(cv) {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
  return [c, r.width, r.height];
}
const hash = i => { const s = Math.sin(i * 127.1 + 3.7) * 43758.5453; return s - Math.floor(s); };
const STATUS = { ok: '#4cc38a', warn: '#f5b83d', bad: '#f2555a' };

function layout(W, Htop) {
  const v = S.veh, t = S.trl;
  const front = R.OH + v.wb + v.fOH, back = t ? t.tongue + t.bed : v.rOH - R.OH;
  sim.sc = Math.min(W * 0.86 / (front + back), Htop / (2 * LANE + 56));
  sim.hitchX = W / 2 + (back - front) / 2 * sim.sc;
}

// side view: the same framing as the top view, or zoomed to fit the tow vehicle
function sideLayout(W, gY) {
  sim.sideSc = sim.sc; sim.sideX = sim.hitchX;
  if (!sim.zoom) return;
  const v = S.veh, len = v.fOH + v.wb + v.rOH, mid = R.OH + (v.wb + v.fOH - v.rOH) / 2; // bumper to bumper, centre ahead of the hitch
  sim.sideSc = Math.min(W * 0.8 / len, (gY - 50) / (v.height + 14));
  sim.sideX = W / 2 - mid * sim.sideSc;
}

function carShape(v) {
  const wb = v.wb, end = wb + v.rOH, z0 = v.tire * 0.36, h = v.height, zb = z0 + (h - z0) * 0.56;
  let cowl, rs, re, rg, deck = zb;
  if (v.body === 'sedan') { cowl = wb * 0.2; rs = cowl + 30; re = wb * 0.82; rg = wb + v.rOH * 0.42; deck = zb + 1; }
  else if (v.body === 'van') { cowl = -2; rs = cowl + 34; re = end - 10; rg = end - 2; }
  else if (v.body === 'suv') { cowl = wb * 0.2; rs = cowl + 24; re = end - 12; rg = end - 3; }
  else { cowl = wb * 0.19; rs = cowl + 22; re = v.bedStart - 8; rg = v.bedStart - 3; deck = zb + 3; }
  return { z0, zb, h, cowl, rs, re, rg, deck, end };
}
function cargoSize(c, bed) {
  const len = c.len || clamp(16 + Math.cbrt(c.w) * 4.2, 18, bed * 0.5);
  return [len, Math.min(len * 0.7, 46)];
}
const ENCLOSED = { box: 1, camper: 1, fifth: 1 };

// ---------- top view ----------
function drawTop(cv) {
  const [c, W, H] = fit(cv);
  layout(W, H);
  const sc = sim.sc, v = S.veh, t = S.trl, y0 = H / 2;
  const wx0 = sim.dist - sim.hitchX / sc; // world x at the left edge

  c.fillStyle = '#3f6f45'; c.fillRect(0, 0, W, H);
  for (let i = Math.floor(wx0 / 170) - 1; i < (wx0 + W / sc) / 170 + 1; i++) { // roadside bushes
    const x = (i * 170 + hash(i) * 120 - wx0) * sc, side = hash(i + 0.5) > 0.5 ? 1 : -1;
    const y = y0 + side * (LANE + 22 + hash(i * 3) * 60) * sc, r = (14 + hash(i * 7) * 16) * sc;
    c.fillStyle = hash(i * 5) > 0.5 ? '#2f5a37' : '#356540';
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  c.fillStyle = '#585d64'; c.fillRect(0, y0 - (LANE + 10) * sc, W, (2 * LANE + 20) * sc); // shoulders
  c.fillStyle = '#41464d'; c.fillRect(0, y0 - LANE * sc, W, 2 * LANE * sc);
  c.fillStyle = '#e9c545'; c.fillRect(0, y0 - LANE * sc - 1, W, Math.max(2, 4 * sc));
  c.fillStyle = '#e8e8e8'; c.fillRect(0, y0 + LANE * sc - 1, W, Math.max(2, 4 * sc));
  for (let wx = Math.floor(wx0 / 480) * 480; wx < wx0 + W / sc; wx += 480) c.fillRect((wx - wx0) * sc, y0 - 1, 120 * sc, Math.max(2, 4 * sc));

  const psi = carHeading(), th = sim.phi + sim.sig;
  const ax = sim.hitchX + R.OH * sc, ay = y0 - sim.y * sc; // rear axle
  const hx = ax - R.OH * sc * Math.cos(psi), hy = ay + R.OH * sc * Math.sin(psi);
  const drawCar = () => { c.save(); c.translate(ax, ay); c.rotate(-psi); c.scale(sc, sc); topCar(c, v); c.restore(); };
  const drawTrl = () => { c.save(); c.translate(hx, hy); c.rotate(-th); c.scale(sc, sc); topTrailer(c, t); c.restore(); };
  if (!t) drawCar(); else if (R.inBed) { drawCar(); drawTrl(); } else { drawTrl(); drawCar(); }

  if (sim.env > 0.05) {
    c.fillStyle = STATUS.bad; c.beginPath(); c.roundRect(W - 128, 8, 120, 22, 11); c.fill();
    c.fillStyle = '#fff'; c.font = '700 12px system-ui'; c.textAlign = 'center'; c.fillText('TRAILER SWAY', W - 68, 23);
  }
}

function topCar(c, v) {
  const sh = carShape(v), hw = v.width / 2, X = u => v.wb - u; // local x forward of rear axle
  c.fillStyle = '#16181b';
  const wheel = (x, y) => c.fillRect(x - v.tire / 2, y - 5, v.tire, 10);
  wheel(v.wb, -hw + 5); wheel(v.wb, hw - 5);
  wheel(0, -hw + 5); wheel(0, hw - 5);
  if (v.dually) { wheel(0, -hw + 16); wheel(0, hw - 16); }
  const bw = v.dually ? hw - 9 : hw - 2; // body half-width
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = v.color; c.beginPath(); c.roundRect(X(sh.end), -bw, sh.end + v.fOH, 2 * bw, [10, 16, 16, 10]); c.fill();
  c.shadowColor = 'transparent';
  if (v.dually) { c.beginPath(); c.roundRect(-v.tire / 2 - 6, -hw, v.tire + 12, 2 * hw, 5); c.fill(); }
  c.fillStyle = 'rgba(15,22,32,.82)'; // glass
  const trap = (u1, u2, in1, in2) => { c.beginPath(); c.moveTo(X(u1), -bw + in1); c.lineTo(X(u2), -bw + in2); c.lineTo(X(u2), bw - in2); c.lineTo(X(u1), bw - in1); c.fill(); };
  trap(sh.cowl + 3, sh.rs, 4, 8);
  if (v.body === 'pickup') {
    trap(sh.re + 2, sh.rg, 8, 6);
    if (S.load.topper > 0) { // topper roof over the bed
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(sh.end) + 3, -bw + 5, sh.end - v.bedStart - 4, 2 * bw - 10);
      c.fillStyle = 'rgba(15,22,32,.82)'; c.fillRect(X(sh.end) + 3, -bw + 9, 4, 2 * bw - 18);
    } else { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(X(sh.end) + 3, -bw + 5, sh.end - v.bedStart - 6, 2 * bw - 10); }
  } else trap(sh.re, sh.rg - 2, 8, 5);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(sh.re), -bw + 7, sh.re - sh.rs, 2 * bw - 14); // roof highlight
  c.fillStyle = v.color; c.fillRect(X(sh.rs) - 6, -bw - 5, 5, 5); c.fillRect(X(sh.rs) - 6, bw, 5, 5); // mirrors
  // vehicle cargo
  if (S.load.cargo > 0) {
    const u = v.cargoMin + S.load.cargoPos * (v.cargoMax - v.cargoMin), [len] = cargoSize({ w: S.load.cargo }, 80);
    const l = Math.min(len, 40);
    cargoBox(c, X(u) - l / 2, -l * 0.45, l, l * 0.9, v.body !== 'pickup' || S.load.topper > 0, S.load.cargo);
  }
}

// heavier cargo is drawn redder: amber at 0 lb, red from HEAVY lb up
const HEAVY = 2000;
const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',');
function cargoBox(c, x, y, w, h, xray, lb) {
  const k = Math.sqrt(clamp(lb / HEAVY, 0, 1));
  c.fillStyle = xray ? 'rgba(' + mix([245, 184, 61], [242, 72, 72], k) + ',.35)' : 'rgb(' + mix([201, 138, 43], [196, 48, 43], k) + ')';
  c.strokeStyle = xray ? 'rgb(' + mix([245, 184, 61], [242, 72, 72], k) + ')' : 'rgb(' + mix([110, 74, 18], [104, 18, 16], k) + ')'; c.lineWidth = 1.5;
  c.setLineDash(xray ? [5, 4] : []);
  c.beginPath(); c.rect(x, y, w, h); c.fill(); c.stroke(); c.setLineDash([]);
}

function topTrailer(c, t) {
  const hw = t.width / 2, x0 = -t.tongue, L = t.bed, st = t.style, open = !ENCLOSED[st];
  const n = t.axles, sp = 34;
  c.fillStyle = '#16181b';
  for (let i = 0; i < n; i++) { // wheels (outboard on open decks)
    const x = -R.A + (i - (n - 1) / 2) * sp, o = open ? hw + 9 : hw + 1;
    c.fillRect(x - t.tire / 2, -o - 4, t.tire, 8); c.fillRect(x - t.tire / 2, o - 4, t.tire, 8);
  }
  c.strokeStyle = '#2b2f35'; c.lineWidth = 5; c.lineCap = 'round';
  if (t.coupler === 'ball') { c.beginPath(); c.moveTo(x0, -hw * 0.55); c.lineTo(-2, 0); c.lineTo(x0, hw * 0.55); c.stroke(); }
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = { open: '#8a6a45', hauler: '#4b5058', flat: '#7c6040', box: '#e3e6ea', camper: '#efe9dc', fifth: '#efe9dc' }[st];
  c.beginPath(); c.roundRect(x0 - L, -hw, L, 2 * hw, open ? 2 : [4, 14, 14, 4]); c.fill();
  c.shadowColor = 'transparent';
  if (open) { // deck planks and rails
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    for (let y = -hw + 8; y < hw; y += 8) { c.beginPath(); c.moveTo(x0 - L, y); c.lineTo(x0, y); c.stroke(); }
    if (st === 'open') { c.strokeStyle = '#2b2f35'; c.lineWidth = 3; c.strokeRect(x0 - L, -hw, L, 2 * hw); }
  } else {
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x0 - L * 0.55, -14, 26, 28); // roof vent / AC
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5; c.strokeRect(x0 - L + 4, -hw + 4, L - 8, 2 * hw - 8);
  }
  if (t.coupler === 'gooseneck') { c.fillStyle = '#2b2f35'; c.fillRect(x0, -8, t.tongue + 6, 16); }
  S.cargo.forEach(k => {
    const [len] = cargoSize(k, L), w = Math.min(len * 0.6, hw * 1.5);
    cargoBox(c, x0 - k.pos * L - len / 2, -w / 2, len, w, !open, k.w);
  });
  // centre of balance marker
  cgMark(c, -R.cb, 0, 7);
}
function cgMark(c, x, y, r) {
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, 0, Math.PI / 2); c.fill();
  c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, Math.PI, Math.PI * 1.5); c.fill();
  c.strokeStyle = '#111'; c.lineWidth = r / 5; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
}

// ---------- side view ----------
function drawSide(cv) {
  const [c, W, H] = fit(cv);
  const gY = H - 64; sideLayout(W, gY);
  const sc = sim.sideSc, v = S.veh, t = S.trl, hX = sim.sideX;
  const sx = x => hX + x * sc, sy = z => gY - z * sc;
  sim.hits = [];

  // scenery
  const g = c.createLinearGradient(0, 0, 0, gY); g.addColorStop(0, '#7fb2dc'); g.addColorStop(1, '#d9ecf7');
  c.fillStyle = g; c.fillRect(0, 0, W, gY);
  c.fillStyle = '#9fc3a8'; c.beginPath(); c.moveTo(0, gY);
  for (let x = 0; x <= W; x += 8) { const w = x + sim.dist * 0.03 * sc; c.lineTo(x, gY - 34 - 16 * Math.sin(w * 0.004) - 9 * Math.sin(w * 0.011 + 2)); }
  c.lineTo(W, gY); c.fill();
  const far = sim.dist * 0.35 - hX / sc;
  for (let i = Math.floor(far / 260) - 1; i < (far + W / sc) / 260 + 1; i++) { // trees
    const x = (i * 260 + hash(i) * 180 - far) * sc, s = (0.7 + hash(i * 3) * 0.6) * Math.max(sc, 0.45);
    c.fillStyle = '#6b5136'; c.fillRect(x - 2 * s, gY - 30 * s, 4 * s, 30 * s);
    c.fillStyle = hash(i * 9) > 0.5 ? '#3f7d4a' : '#4c8a52'; c.beginPath(); c.arc(x, gY - 48 * s, 26 * s, 0, 7); c.fill();
  }
  c.fillStyle = '#6f9a62'; c.fillRect(0, gY - 6, W, 6);
  const near = sim.dist - hX / sc;
  for (let wx = Math.floor(near / 600) * 600; wx < near + W / sc; wx += 600) { // delineator posts
    const x = (wx - near) * sc; c.fillStyle = '#dfe3e8'; c.fillRect(x, gY - 34 * sc, 3, 34 * sc);
    c.fillStyle = '#e9c545'; c.fillRect(x, gY - 34 * sc, 3, 5);
  }
  c.fillStyle = '#41464d'; c.fillRect(0, gY, W, 9);
  c.fillStyle = '#e8e8e8'; for (let wx = Math.floor(near / 480) * 480; wx < near + W / sc; wx += 480) c.fillRect((wx - near) * sc, gY + 6, 120 * sc, 2);
  c.fillStyle = '#1b212a'; c.fillRect(0, gY + 9, W, H - gY - 9);

  // geometry: body sits on the suspension, sheared by the front/rear squat
  const xFA = R.OH + v.wb, dF = R.squatF * SQUAT_GAIN, dR = R.squatR * SQUAT_GAIN;
  const drop = u => dF + (dR - dF) * u / v.wb;
  const cx = u => sx(xFA - u), cz = (u, z) => sy(z - drop(u));
  const hitchZ = R.hitchH - drop(v.wb + R.OH);
  const tz = (s, z) => sy(z + (hitchZ - R.hitchH) * (1 - s / R.A)); // trailer pivots on its axles
  const tx = s => sx(-s);
  const spin = sim.dist;

  const car = () => sideCar(c, v, cx, cz, sx, sy, sc, xFA, spin);
  const trl = () => sideTrailer(c, t, tx, tz, sy, sc, spin);
  if (!t) car(); else if (R.inBed) { car(); trl(); } else { trl(); car(); }

  // centre-of-balance markers
  if (t) cgMark(c, tx(R.cb), tz(R.cb, t.deckH + 16), 6);
  const vcg = R.vItems.reduce((s, i) => s + i.w * i.d, 0) / R.Wv;
  cgMark(c, cx(vcg), cz(vcg, 26), 6);

  // coupler load callout
  c.font = '600 11px system-ui'; c.textAlign = 'center';
  if (t) {
    const col = STATUS[R.tongueStatus], hx = sx(0), topY = 44;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5;
    const tipY = sy(hitchZ) - 6;
    c.beginPath(); c.moveTo(hx, topY + 4); c.lineTo(hx, tipY); c.stroke();
    c.beginPath(); c.moveTo(hx - 4, tipY - 6); c.lineTo(hx + 4, tipY - 6); c.lineTo(hx, tipY); c.fill();
    const lbl = (R.inBed ? 'Pin ' : 'Tongue ') + fW(R.TW) + ' · ' + (R.tonguePct * 100).toFixed(1) + '%';
    const tw = c.measureText(lbl).width + 12;
    c.fillStyle = 'rgba(18,22,28,.82)'; c.beginPath(); c.roundRect(hx - tw / 2, topY - 13, tw, 18, 9); c.fill();
    c.fillStyle = col; c.fillText(lbl, hx, topY);
  }

  // axle loads
  const axle = (x, name, w, lim) => {
    const p = w / lim, k = p > 1 ? 'bad' : p > 0.9 ? 'warn' : 'ok';
    c.fillStyle = '#8b96a5'; c.font = '11px system-ui'; if (sc > 0.5) c.fillText(name, x, gY + 24);
    c.fillStyle = '#e6e9ee'; c.font = '600 12px system-ui'; c.fillText(fW(w), x, gY + 39);
    c.fillStyle = '#2a323d'; c.fillRect(x - 26, gY + 45, 52, 5);
    c.fillStyle = STATUS[k]; c.fillRect(x - 26, gY + 45, 52 * Math.min(1, p), 5);
    c.fillStyle = '#8b96a5'; c.font = '10px system-ui'; c.fillText(Math.round(p * 100) + '% of rating', x, gY + 60);
  };
  axle(clamp(sx(xFA), 40, W - 40), 'Front axle', R.F, v.gawrF);
  axle(sx(R.OH), 'Rear axle', R.R, v.gawrR);
  if (t && (!sim.zoom || sx(-R.A) > 0)) axle(clamp(sx(-R.A), 40, W - 40), t.axles > 1 ? 'Trailer axles' : 'Trailer axle', R.tAxle, t.gawr);
}

function wheelSide(c, x, y, r, ang) {
  c.fillStyle = '#16181b'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = '#aab2bd'; c.beginPath(); c.arc(x, y, r * 0.6, 0, 7); c.fill();
  c.strokeStyle = 'rgba(40,46,54,' + (sim.v > 40 ? 0.35 : 0.9) + ')'; c.lineWidth = Math.max(1, r * 0.12);
  for (let i = 0; i < 5; i++) { const a = ang + i * Math.PI * 0.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); c.stroke(); }
  c.fillStyle = '#2b2f35'; c.beginPath(); c.arc(x, y, r * 0.16, 0, 7); c.fill();
}

function sideCar(c, v, cx, cz, sx, sy, sc, xFA, spin) {
  const sh = carShape(v), P = (u, z) => c.lineTo(cx(u), cz(u, z)), pk = v.body === 'pickup';
  c.fillStyle = v.color; c.beginPath();
  c.moveTo(cx(-v.fOH), cz(-v.fOH, sh.z0)); P(-v.fOH, sh.zb - 8); P(-v.fOH + 6, sh.zb - 3); P(sh.cowl, sh.zb); P(sh.rs, sh.h); P(sh.re, sh.h);
  if (pk) P(sh.rg, sh.h - 2);
  P(sh.rg, sh.deck); P(sh.end, sh.deck - (pk ? 0 : 2)); P(sh.end, sh.z0); c.fill();
  c.fillStyle = 'rgba(15,22,32,.82)'; c.beginPath();
  c.moveTo(cx(sh.cowl + 5), cz(sh.cowl, sh.zb + 1)); P(sh.rs + 2, sh.h - 3);
  if (pk) { P(sh.rg - 5, sh.h - 3); P(sh.rg - 5, sh.zb + 1); } else { P(sh.re - 1, sh.h - 3); P(sh.rg - 4, sh.zb + 1); }
  c.fill();
  c.strokeStyle = v.color; c.lineWidth = Math.max(2, 4 * sc); // pillars
  const pillar = u => { c.beginPath(); c.moveTo(cx(u), cz(u, sh.zb)); c.lineTo(cx(u), cz(u, sh.h - 2)); c.stroke(); };
  pillar((sh.rs + (pk ? sh.rg : sh.re)) / 2 + 4);
  if (v.body === 'suv' || v.body === 'van') pillar(sh.re - 26);
  const cap = pk && S.load.topper > 0;
  if (cap) { // cab-high topper over the bed
    c.fillStyle = v.color; c.beginPath();
    c.moveTo(cx(sh.rg + 1), cz(sh.rg + 1, sh.deck)); P(sh.rg + 1, sh.h - 2); P(sh.end - 4, sh.h - 4); P(sh.end, sh.h - 9); P(sh.end, sh.deck); c.fill();
    c.fillStyle = 'rgba(15,22,32,.82)'; c.beginPath();
    c.moveTo(cx(sh.rg + 8), cz(sh.rg + 8, sh.deck + 4)); P(sh.rg + 8, sh.h - 6); P(sh.end - 10, sh.h - 7); P(sh.end - 10, sh.deck + 4); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx(sh.rg + 1), cz(sh.rg + 1, sh.deck)); P(sh.rg + 1, sh.h - 2); c.stroke();
  }
  // occupants
  c.fillStyle = '#e6c9a8';
  const head = u => { c.beginPath(); c.arc(cx(u), cz(u, sh.zb + 9), 5 * sc, 0, 7); c.fill(); };
  if (S.load.front > 0) head(v.seatF - 4);
  if (S.load.rear > 0 && v.seatR < (pk ? sh.rg - 8 : sh.re)) head(v.seatR - 4);
  // cargo (draggable)
  if (S.load.cargo > 0) {
    const u = v.cargoMin + S.load.cargoPos * (v.cargoMax - v.cargoMin), [len, h] = cargoSize({ w: S.load.cargo }, 80);
    const l = Math.min(len, 40), hh = Math.min(h, 24), base = sh.z0 + (pk ? 22 : 14);
    const x = cx(u + l / 2), y = cz(u, base + hh);
    cargoBox(c, x, y, l * sc, hh * sc, !pk || cap, S.load.cargo);
    sim.hits.push({ x, y, w: l * sc, h: hh * sc, kind: 'veh' });
  }
  // wheels
  const r = v.tire / 2;
  [0, v.wb].forEach(u => {
    c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(cx(u), cz(u, r + 1), (r + 3) * sc, Math.PI, 0); c.fill();
    wheelSide(c, cx(u), sy(r), r * sc, spin / r);
  });
  if (!R.inBed) { // receiver + ball
    c.strokeStyle = '#2b2f35'; c.lineWidth = Math.max(2, 3 * sc);
    c.beginPath(); c.moveTo(cx(sh.end - 2), cz(sh.end, sh.z0 + 2)); c.lineTo(sx(0), cz(v.wb + R.OH, R.hitchH - 2)); c.stroke();
  }
}

function sideTrailer(c, t, tx, tz, sy, sc, spin) {
  const s0 = t.tongue, s1 = t.tongue + t.bed, st = t.style, top = t.deckH + t.boxH, open = !ENCLOSED[st];
  const P = (s, z) => c.lineTo(tx(s), tz(s, z)), M = (s, z) => c.moveTo(tx(s), tz(s, z));
  const quad = (a, b, zA, zB, fill) => { c.fillStyle = fill; c.beginPath(); M(a, zA); P(b, zA); P(b, zB); P(a, zB); c.fill(); };
  c.strokeStyle = '#2b2f35'; c.lineCap = 'round'; c.lineJoin = 'round';

  if (t.coupler === 'ball') { // A-frame tongue and jack
    c.lineWidth = Math.max(2, 4 * sc); c.beginPath(); M(0, R.hitchH); P(s0, t.deckH - 3); c.stroke();
    c.lineWidth = Math.max(1.5, 2 * sc); c.beginPath(); M(s0 * 0.45, R.hitchH + 14); P(s0 * 0.45, R.hitchH - 8); c.stroke();
  } else if (t.coupler === 'gooseneck') {
    c.lineWidth = Math.max(3, 7 * sc); c.beginPath(); M(s0 + 2, t.deckH - 2); P(s0 - 6, t.deckH + 26); P(6, t.deckH + 26); P(0, t.deckH + 20); P(0, R.hitchH); c.stroke();
  }

  if (st === 'fifth') {
    c.fillStyle = '#efe9dc'; c.beginPath();
    M(s0, 72); P(s0 + 10, top); P(s1, top); P(s1, t.deckH - 4); P(100, t.deckH - 4); P(100, 64); P(s0 + 4, 64); c.fill();
    quad(-6, 10, 64, R.hitchH, '#2b2f35');
    quad(s0 + 14, s1, t.deckH + 34, t.deckH + 40, '#b9703a');
    quad(130, 170, t.deckH + 58, t.deckH + 86, 'rgba(15,22,32,.8)'); quad(230, 290, t.deckH + 58, t.deckH + 86, 'rgba(15,22,32,.8)');
    quad(20, 60, 86, 106, 'rgba(15,22,32,.8)');
  } else if (!open) {
    c.fillStyle = st === 'box' ? '#e3e6ea' : '#efe9dc'; c.beginPath();
    M(s0, t.deckH + 8); P(s0 + (st === 'camper' ? 14 : 4), top); P(s1, top); P(s1, t.deckH - 4); P(s0 + 6, t.deckH - 4); c.fill();
    if (st === 'camper') {
      quad(s0 + 8, s1, t.deckH + 30, t.deckH + 36, '#3d8f7a');
      quad(s0 + 50, s0 + 90, t.deckH + 52, t.deckH + 76, 'rgba(15,22,32,.8)'); quad(s1 - 80, s1 - 30, t.deckH + 52, t.deckH + 76, 'rgba(15,22,32,.8)');
    } else quad(s0 + 6, s1, t.deckH + 4, t.deckH + 8, '#9aa3ad');
  } else {
    quad(s0, s1, t.deckH, t.deckH - 5, st === 'hauler' ? '#4b5058' : '#7c6040');
    if (st === 'open') { c.lineWidth = Math.max(1.5, 2 * sc); c.beginPath(); M(s0, t.deckH); P(s0, top); P(s1, top); P(s1, t.deckH); c.stroke(); }
  }

  // cargo (draggable)
  S.cargo.forEach((k, i) => {
    const s = t.tongue + k.pos * t.bed, [len, h] = cargoSize(k, t.bed);
    const base = st === 'fifth' && s < 100 ? 68 : t.deckH;
    const x = tx(s + len / 2), y = tz(s, base + h);
    cargoBox(c, x, y, len * sc, h * sc, !open, k.w);
    if (len * sc > 44) { c.fillStyle = open ? '#1a1405' : '#5b4410'; c.font = '600 10px system-ui'; c.textAlign = 'center'; c.fillText(fW(k.w), x + len * sc / 2, y + h * sc / 2 + 4); }
    sim.hits.push({ x, y, w: len * sc, h: h * sc, kind: 'trl', i });
  });

  const r = t.tire / 2, n = t.axles;
  for (let i = 0; i < n; i++) {
    const s = R.A + (i - (n - 1) / 2) * 34;
    if (open) { c.strokeStyle = '#2b2f35'; c.lineWidth = Math.max(2, 3 * sc); c.beginPath(); c.arc(tx(s), sy(r), (r + 3) * sc, Math.PI, 0); c.stroke(); }
    wheelSide(c, tx(s), sy(r), r * sc, spin / r);
  }
}

// ---------- loop & input ----------
function startSim(top, side) {
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!sim.paused) { stepSim(dt / 2); stepSim(dt / 2); }
    drawTop(top); if (side.clientWidth) drawSide(side); // the side view is hidden on phones when another tab is open
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // drag cargo along the trailer bed / vehicle cargo area
  let drag = null;
  const pos = e => { const r = side.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = (x, y) => sim.hits.slice().reverse().find(h => x >= h.x - 4 && x <= h.x + h.w + 4 && y >= h.y - 4 && y <= h.y + h.h + 4);
  side.addEventListener('pointerdown', e => {
    const [x, y] = pos(e), h = hit(x, y);
    if (h) { drag = { h, off: x - (h.x + h.w / 2) }; try { side.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ } e.preventDefault(); }
  });
  side.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (!drag) { side.style.cursor = hit(x, y) ? 'grab' : 'default'; return; }
    side.style.cursor = 'grabbing';
    const world = (sim.sideX - (x - drag.off)) / sim.sideSc; // inches behind the hitch
    if (drag.h.kind === 'trl') S.cargo[drag.h.i].pos = clamp((world - S.trl.tongue) / S.trl.bed, 0.03, 0.97);
    else { const v = S.veh, u = world + R.OH + v.wb; S.load.cargoPos = clamp((u - v.cargoMin) / (v.cargoMax - v.cargoMin), 0, 1); }
    update(true);
  });
  const end = () => { drag = null; };
  side.addEventListener('pointerup', end); side.addEventListener('pointercancel', end);
}
