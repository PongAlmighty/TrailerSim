'use strict';
// Weight & balance model. Base units: pounds, inches, mph.
// Method follows the Engineers Edge trailer weight & balance page:
//   CB from RDL = sum(distance x weight) / gross weight

// Representative figures for each vehicle class, not manufacturer specs. Every value is editable in the UI.
// Distances seatF/seatR/cargoMin/cargoMax/bedStart are inches behind the front axle.
const VEHICLES = [
  { id: 'sedan', name: 'Mid-size sedan', body: 'sedan', color: '#5b8def', curb: 3400, ff: 0.60, wb: 111, fOH: 37, rOH: 44, ballOH: 48, width: 73, height: 57, tire: 26,
    gvwr: 4500, gawrF: 2450, gawrR: 2250, tow: 1500, tow5: 0, tongueMax: 150, gcwr: 6000, seatF: 58, seatR: 92, cargoMin: 118, cargoMax: 145 },
  { id: 'crossover', name: 'Compact crossover', body: 'suv', color: '#c0504d', curb: 3650, ff: 0.58, wb: 106, fOH: 36, rOH: 40, ballOH: 44, width: 73, height: 66, tire: 28,
    gvwr: 4800, gawrF: 2600, gawrR: 2500, tow: 2500, tow5: 0, tongueMax: 250, gcwr: 7300, seatF: 55, seatR: 88, cargoMin: 105, cargoMax: 138 },
  { id: 'minivan', name: 'Minivan', body: 'van', color: '#8a94a6', curb: 4500, ff: 0.56, wb: 121, fOH: 39, rOH: 43, ballOH: 47, width: 79, height: 69, tire: 28,
    gvwr: 6050, gawrF: 3000, gawrR: 3250, tow: 3500, tow5: 0, tongueMax: 350, gcwr: 8800, seatF: 52, seatR: 95, cargoMin: 125, cargoMax: 155 },
  { id: 'midsuv', name: 'Mid-size SUV', body: 'suv', color: '#3d8f7a', curb: 4500, ff: 0.54, wb: 119, fOH: 37, rOH: 43, ballOH: 47, width: 78, height: 70, tire: 31,
    gvwr: 6100, gawrF: 3100, gawrR: 3400, tow: 5000, tow5: 0, tongueMax: 500, gcwr: 10500, seatF: 60, seatR: 96, cargoMin: 118, cargoMax: 152 },
  { id: 'fullsuv', name: 'Full-size SUV', body: 'suv', color: '#2f3640', curb: 5700, ff: 0.52, wb: 121, fOH: 39, rOH: 50, ballOH: 54, width: 81, height: 76, tire: 33,
    gvwr: 7500, gawrF: 3600, gawrR: 4300, tow: 8200, tow5: 0, tongueMax: 820, gcwr: 14500, seatF: 62, seatR: 100, cargoMin: 122, cargoMax: 160 },
  // Curb, GVWR, GCWR and tow rating supplied by the owner (Hybrid AWD with 4K tow package). GCWR 8,315, 4,000 lb trailer and
  // 400 lb tongue load match Ford's 2025 towing guide; axle ratings and weight split are estimates.
  { id: 'maverick', name: 'Ford Maverick Hybrid (4K tow)', body: 'pickup', color: '#3f6fa8', curb: 3800, ff: 0.58, wb: 121, fOH: 36, rOH: 43, ballOH: 47, width: 73, height: 69, tire: 28,
    gvwr: 5320, gawrF: 2850, gawrR: 2700, tow: 4000, tow5: 0, tongueMax: 400, gcwr: 8315, seatF: 58, seatR: 92, cargoMin: 114, cargoMax: 158, bedStart: 108 },
  { id: 'midpickup', name: 'Mid-size pickup', body: 'pickup', color: '#d9822b', curb: 4500, ff: 0.56, wb: 128, fOH: 37, rOH: 47, ballOH: 52, width: 75, height: 71, tire: 31,
    gvwr: 6100, gawrF: 3300, gawrR: 3500, tow: 6500, tow5: 0, tongueMax: 650, gcwr: 12000, seatF: 62, seatR: 92, cargoMin: 114, cargoMax: 165, bedStart: 106 },
  { id: 'halfton', name: 'Half-ton pickup', body: 'pickup', color: '#b7c0cc', curb: 5200, ff: 0.57, wb: 145, fOH: 38, rOH: 49, ballOH: 54, width: 80, height: 77, tire: 33,
    gvwr: 7200, gawrF: 3750, gawrR: 3900, tow: 11000, tow5: 11000, tongueMax: 1100, gcwr: 17000, seatF: 64, seatR: 100, cargoMin: 126, cargoMax: 184, bedStart: 118 },
  { id: 'hd', name: '3/4-ton HD pickup', body: 'pickup', color: '#7a2e2e', curb: 7200, ff: 0.59, wb: 159, fOH: 39, rOH: 51, ballOH: 57, width: 80, height: 80, tire: 34,
    gvwr: 10800, gawrF: 5600, gawrR: 6500, tow: 15000, tow5: 19000, tongueMax: 1500, gcwr: 28000, seatF: 66, seatR: 104, cargoMin: 132, cargoMax: 200, bedStart: 124 },
  { id: 'dually', name: 'One-ton dually pickup', body: 'pickup', color: '#e9ecef', curb: 8400, ff: 0.57, wb: 176, fOH: 39, rOH: 53, ballOH: 59, width: 96, height: 80, tire: 34, dually: true,
    gvwr: 14000, gawrF: 6000, gawrR: 9750, tow: 20000, tow5: 32000, tongueMax: 2000, gcwr: 40000, seatF: 66, seatR: 104, cargoMin: 136, cargoMax: 220, bedStart: 128 },
];

// tongue = coupler to front of bed; axlePct / cgPct / cargo pos = fraction of bed length back from the bed front.
const TRAILERS = [
  { id: 'utility', name: 'Utility trailer 5×8', coupler: 'ball', style: 'open', empty: 700, bed: 96, tongue: 38, axles: 1, axlePct: 0.60, cgPct: 0.48, width: 62, deckH: 20, boxH: 14, tire: 25,
    gvwr: 2990, gawr: 3500, cargo: [{ name: 'Riding mower', w: 600, pos: 0.45 }] },
  // Empty weight and GVWR are U-Haul's figures as recalled (850 / 2,500 lb); axle rating, axle position and tongue length are estimates.
  { id: 'uhaul48', name: 'U-Haul 4×8 enclosed cargo', coupler: 'ball', style: 'box', empty: 850, bed: 96, tongue: 42, axles: 1, axlePct: 0.60, cgPct: 0.48, width: 54, deckH: 16, boxH: 54, tire: 22,
    gvwr: 2500, gawr: 2500, cargo: [{ name: 'Boxes', w: 600, pos: 0.45 }] },
  { id: 'cargo14', name: 'Enclosed cargo 7×14', coupler: 'ball', style: 'box', empty: 2400, bed: 168, tongue: 48, axles: 2, axlePct: 0.60, cgPct: 0.48, width: 84, deckH: 20, boxH: 80, tire: 27,
    gvwr: 7000, gawr: 7000, cargo: [{ name: 'Tool chests', w: 1200, pos: 0.35 }, { name: 'Motorcycle', w: 600, pos: 0.62 }] },
  { id: 'travel', name: 'Travel trailer 24 ft', coupler: 'ball', style: 'camper', empty: 4900, bed: 270, tongue: 44, axles: 2, axlePct: 0.57, cgPct: 0.48, width: 96, deckH: 24, boxH: 96, tire: 28,
    gvwr: 7500, gawr: 7000, cargo: [{ name: 'Fresh water', w: 330, pos: 0.30 }, { name: 'Camping gear', w: 500, pos: 0.55 }] },
  { id: 'hauler', name: 'Car hauler 18 ft', coupler: 'ball', style: 'hauler', empty: 2100, bed: 216, tongue: 50, axles: 2, axlePct: 0.60, cgPct: 0.48, width: 82, deckH: 22, boxH: 0, tire: 27,
    gvwr: 9990, gawr: 10400, cargo: [{ name: 'Car', w: 3400, pos: 0.50, len: 170 }] },
  { id: 'goose', name: 'Gooseneck flatbed 25 ft', coupler: 'gooseneck', style: 'flat', empty: 6800, bed: 300, tongue: 92, axles: 2, axlePct: 0.72, cgPct: 0.50, width: 102, deckH: 36, boxH: 0, tire: 30,
    gvwr: 22000, gawr: 20000, cargo: [{ name: 'Skid steer', w: 8000, pos: 0.50, len: 130 }] },
  { id: 'fifth', name: 'Fifth-wheel camper 30 ft', coupler: 'fifth', style: 'fifth', empty: 9800, bed: 360, tongue: -20, axles: 2, axlePct: 0.62, cgPct: 0.50, width: 96, deckH: 28, boxH: 120, tire: 30,
    gvwr: 14000, gawr: 12000, cargo: [{ name: 'Fresh water', w: 500, pos: 0.55 }, { name: 'Gear', w: 800, pos: 0.40 }] },
];

// range = recommended share of trailer weight carried at the coupler; h = nominal coupler height (in).
const HITCHES = {
  receiver: { name: 'Receiver hitch (bumper pull)', range: [0.10, 0.15], h: 18, stab: 1.0 },
  wdh: { name: 'Weight distribution hitch', range: [0.10, 0.15], h: 18, stab: 1.1 },
  pintle: { name: 'Pintle hook & lunette ring', range: [0.10, 0.15], h: 18, stab: 0.95 },
  gooseneck: { name: 'Gooseneck hitch', range: [0.15, 0.25], h: 38, stab: 1.25 },
  fifth: { name: 'Fifth-wheel hitch', range: [0.15, 0.25], h: 50, stab: 1.25 },
};
const BED_HITCH_FWD = 2; // in-bed hitches sit just ahead of the rear axle

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function compute(S) {
  const v = S.veh, t = S.trl, hd = HITCHES[S.hitch];
  const inBed = S.hitch === 'gooseneck' || S.hitch === 'fifth';
  const OH = inBed ? -BED_HITCH_FWD : v.ballOH; // rear axle back to hitch point
  const A = t.tongue + t.axlePct * t.bed;       // coupler back to axle-group centre

  // Trailer centre of balance, RDL at the coupler
  const tItems = [{ name: 'Empty trailer', w: t.empty, d: t.tongue + t.cgPct * t.bed }];
  S.cargo.forEach((c, i) => tItems.push({ name: c.name || 'Cargo ' + (i + 1), w: c.w, d: t.tongue + c.pos * t.bed }));
  const Wt = tItems.reduce((s, i) => s + i.w, 0);
  const Mt = tItems.reduce((s, i) => s + i.w * i.d, 0);
  const cb = Mt / Wt;
  const TW = Wt * (A - cb) / A; // static tongue / pin weight
  const tonguePct = TW / Wt;

  // Weight distribution hitch: a moment M across the coupling restores a fraction of the
  // load the tongue weight took off the front axle, and shifts some load to the trailer axles.
  const restore = S.hitch === 'wdh' ? S.wdRestore : 0;
  const M = restore * TW * OH / (1 + OH / A);
  const V = TW - M / A;        // vertical load at the ball
  const tAxle = Wt - V;

  // Tow vehicle, distances measured back from the front axle
  const vItems = [
    { name: 'Curb weight, front axle', w: v.curb * v.ff, d: 0 },
    { name: 'Curb weight, rear axle', w: v.curb * (1 - v.ff), d: v.wb },
    { name: 'Front occupants', w: S.load.front, d: v.seatF },
    { name: 'Rear passengers', w: S.load.rear, d: v.seatR },
    { name: 'Cargo', w: S.load.cargo, d: v.cargoMin + S.load.cargoPos * (v.cargoMax - v.cargoMin) },
  ];
  const Wv = vItems.reduce((s, i) => s + i.w, 0);
  const R0 = vItems.reduce((s, i) => s + i.w * i.d, 0) / v.wb;
  const F0 = Wv - R0;
  const F = F0 - V * OH / v.wb + M / v.wb;
  const R = R0 + V * (v.wb + OH) / v.wb - M / v.wb;
  const GVW = F + R, GCW = Wv + Wt;

  // Whole-rig CB by the page's axle-scale formula, RDL at the front bumper
  const rigAxles = [
    { name: 'Front axle', w: F, d: v.fOH },
    { name: 'Rear axle', w: R, d: v.fOH + v.wb },
    { name: 'Trailer axles', w: tAxle, d: v.fOH + v.wb + OH + A },
  ];
  const rigCB = rigAxles.reduce((s, a) => s + a.w * a.d, 0) / GCW;

  // Suspension deflection relative to curb height (in)
  const squatF = (F - v.curb * v.ff) / (v.gawrF / 5);
  const squatR = (R - v.curb * (1 - v.ff)) / (v.gawrR / 5);

  const sway = swayModel(S, { Wt, Wv, A, cb, tonguePct, tItems });

  // Checks
  const checks = [], issues = [];
  const add = (label, value, limit, over, payload) => {
    const pct = value / limit;
    const status = pct > 1 ? 'bad' : pct > 0.9 ? 'warn' : 'ok';
    checks.push({ label, value, limit, pct, status, payload });
    if (status !== 'ok') issues.push({ status, msg: status === 'bad' ? over : label.split(' vs. ')[0] + ' is within 10% of its limit.' });
  };
  const flag = (status, msg) => { if (status !== 'ok') issues.push({ status, msg }); };

  const [lo, hi] = hd.range;
  const tw = inBed ? 'Pin weight' : 'Tongue weight';
  let ts = 'ok', tmsg = '';
  if (tonguePct < 0) { ts = 'bad'; tmsg = tw + ' is negative: the trailer is lifting the hitch. Move weight forward.'; }
  else if (tonguePct < lo - 0.02) { ts = 'bad'; tmsg = tw + ' is far too light, so sway is likely. Move weight forward of the axles.'; }
  else if (tonguePct < lo) { ts = 'warn'; tmsg = tw + ' is a little light. Move some weight forward.'; }
  else if (tonguePct > hi + 0.03) { ts = 'bad'; tmsg = tw + ' is far too heavy. Move weight back toward the axles.'; }
  else if (tonguePct > hi) { ts = 'warn'; tmsg = tw + ' is a little heavy. Move some weight back.'; }
  flag(ts, tmsg);

  const towLimit = inBed ? v.tow5 : v.tow;
  add('Trailer weight vs. tow rating', Wt, towLimit, 'Trailer weighs more than the vehicle is rated to tow.');
  if (!inBed) add('Tongue weight vs. hitch rating', Math.max(TW, 0), v.tongueMax, 'Tongue weight exceeds the hitch rating.');
  add('Vehicle gross weight vs. GVWR', GVW, v.gvwr, 'Tow vehicle is over its GVWR (payload exceeded).', true);
  add('Front axle vs. GAWR', F, v.gawrF, 'Front axle is over its rating.');
  add('Rear axle vs. GAWR', R, v.gawrR, 'Rear axle is over its rating.');
  add('Combined weight vs. GCWR', GCW, v.gcwr, 'Combined weight exceeds the GCWR.');
  add('Trailer gross vs. trailer GVWR', Wt, t.gvwr, 'Trailer is loaded beyond its GVWR.');
  add('Trailer axles vs. axle rating', tAxle, t.gawr, 'Trailer axles are over their rating.');

  const frontLoss = (F0 - F) / F0; // share of front axle load removed by the trailer
  if (frontLoss > 0.2) issues.push({ status: 'bad', msg: 'The trailer lifts ' + Math.round(frontLoss * 100) + '% of the load off the front axle, so steering and braking suffer.' });
  else if (frontLoss > 0.1) issues.push({ status: 'warn', msg: 'Front axle is ' + Math.round(frontLoss * 100) + '% lighter with the trailer attached.' });
  if (S.hitch === 'receiver' && (Wt > 5000 || TW > 500)) issues.push({ status: 'warn', msg: 'A weight distribution hitch is usually required at this trailer weight.' });
  if (S.speed > sway.vcrit) issues.push({ status: 'bad', msg: 'Current speed is above the estimated sway onset speed.' });
  issues.sort((a, b) => (a.status === 'bad' ? 0 : 1) - (b.status === 'bad' ? 0 : 1));

  return { inBed, OH, A, tItems, Wt, Mt, cb, TW, tonguePct, tongueStatus: ts, range: hd.range, restore, M, V, tAxle,
    vItems, Wv, F0, R0, F, R, GVW, GCW, rigAxles, rigCB, squatF, squatR, frontLoss, sway, checks, issues, hitchH: hd.h };
}

// Illustrative stability estimate, not a vehicle-dynamics solver: maps tongue-weight share,
// trailer/vehicle weight ratio, how spread out the load is, and hitch type to a sway onset speed.
function swayModel(S, r) {
  const t = S.trl, p = r.tonguePct;
  let base;
  if (p >= 0.10) base = 95 + (Math.min(p, 0.15) - 0.10) * 400;
  else if (p >= 0.05) base = 60 + (p - 0.05) * 700;
  else if (p >= 0) base = 42 + p * 360;
  else base = Math.max(20, 42 + p * 300);
  const massF = clamp(1.15 - 0.25 * (r.Wt / r.Wv), 0.6, 1.15);
  // radius of gyration about the CB as a fraction of bed length (uniform empty trailer ≈ 0.29)
  let k2 = 0;
  r.tItems.forEach((i, n) => { k2 += i.w * ((i.d - r.cb) ** 2 + (n === 0 ? t.bed * t.bed / 12 : 0)); });
  const spread = Math.sqrt(k2 / r.Wt) / t.bed;
  const spreadF = clamp(1 - 0.8 * (spread - 0.30), 0.75, 1.05);
  const vcrit = base * massF * spreadF * HITCHES[S.hitch].stab;
  const omega = 2 * Math.PI * clamp(0.9 * Math.sqrt(150 / r.A), 0.4, 1.2);
  return { vcrit, omega, massRatio: r.Wt / r.Wv };
}

// Nearest whole unit, .5 rounds up (the page's rule for reporting CB).
const roundCB = x => Math.floor(x + 0.5);
