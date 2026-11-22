import React, { useState, useRef, useEffect, useContext } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Animated, Modal, BackHandler, StatusBar, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as MI } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ============================================================
   உன் விவரங்களை இங்கே மட்டும் மாத்து
   ============================================================ */
const APP_NAME = 'Mimi Calculator';
const COMPANY = 'இங்கே கம்பெனி பேர் போடு';
const APP_VERSION = '1.0.0';

/* ============================================================
   >>> AdMob BANNER AD UNIT ID — இங்கே உன் Banner Ad Unit ID-ஐ பேஸ்ட் பண்ணு <<<
   (இது Ad UNIT ID: ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx — "/" இருக்கும்.
    App ID (~ இருக்கும்) app.json-ல போடணும், இங்க இல்ல.)
   Google test Banner ID (test-க்கு மட்டும்): ca-app-pub-3940256099942544/6300978111
   ============================================================ */
const BANNER_AD_UNIT_ID = 'PASTE_YOUR_BANNER_AD_UNIT_ID_HERE';

/* AdMob library: Expo Go-ல இருக்காது. இல்லன்னா app உடையாம placeholder காட்டும் */
let Ads = null;
try { Ads = require('react-native-google-mobile-ads'); } catch (e) { Ads = null; }

/* ===== icons (assets/icons) ===== */
const IC = {
  history: require('./assets/icons/history.png'),
  about: require('./assets/icons/about.png'),
  sun: require('./assets/icons/sun.png'),
  moon: require('./assets/icons/moon.png'),
  themes: require('./assets/icons/themes.png'),
};
function SIcon({ src, color, size = 24 }) {
  return <Image source={src} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" />;
}

/* ===== themes ===== */
const DARK = { bg: '#000', key: '#202022', tx: '#ececec', gr: '#8a8a90', ln: '#2a2a2e', card: '#1c1c1e', chip: '#2a2a2e', or: '#f0821a' };
const LIGHT = { bg: '#fff', key: '#ececef', tx: '#111', gr: '#6b6b72', ln: '#e2e2e6', card: '#f3f3f6', chip: '#e6e6ea', or: '#f0821a' };
const Th = React.createContext(DARK);

/* ===== helpers ===== */
const $n = x => { const v = parseFloat(x); return isNaN(v) ? 0 : v; };
const commas = s => {
  const m = String(s).match(/^([-−]?)(\d*)(\.\d*)?$/);
  return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '') : s;
};
const fmt = x => {
  if (!isFinite(x)) return 'Error';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-9) return x.toExponential(6).replace(/\.?0+e/, 'e');
  let s = parseFloat(x.toPrecision(12)).toString();
  if (/e/.test(s)) s = x.toFixed(14).replace(/\.?0+$/, '');
  return s;
};
const money = x => fmt(Math.round(x * 100) / 100);
const pretty = s => s.replace(/\d+(\.\d*)?|\.\d+/g, m => commas(m)).replace(/asin/g, 'sin⁻¹').replace(/acos/g, 'cos⁻¹').replace(/atan/g, 'tan⁻¹');

/* ===== calculator engine ===== */
const RE = /asin|acos|atan|sin|cos|tan|lg|ln|\d+\.?\d*|\.\d+|[πe√+−×÷^()%!]/g;
function evalEx(s, rad) {
  const D = rad ? 1 : Math.PI / 180;
  const fix = x => (Math.abs(x) < 1e-12 ? 0 : x);
  const FUN = {
    sin: v => fix(Math.sin(v * D)),
    cos: v => fix(Math.cos(v * D)),
    tan: v => { if (Math.abs(Math.cos(v * D)) < 1e-12) throw 'e'; return fix(Math.tan(v * D)); },
    asin: v => Math.asin(v) / D,
    acos: v => Math.acos(v) / D,
    atan: v => Math.atan(v) / D,
    lg: v => Math.log10(v),
    ln: v => Math.log(v),
  };
  const raw = s.match(RE) || [];
  const t = [];
  let open = 0;
  const val = v => v !== undefined && (/^[\d.]/.test(v) || 'πe)%!'.includes(v));
  const beg = v => /^[\d.]/.test(v) || 'πe(√'.includes(v) || /^[a-z]{2,}$/.test(v);
  for (const x of raw) {
    if (val(t[t.length - 1]) && beg(x)) t.push('×');
    if (x === '(') open++;
    if (x === ')') { if (open < 1) throw 'e'; open--; }
    t.push(x);
  }
  for (;;) {
    const l = t[t.length - 1];
    if (l === '(') { open--; t.pop(); }
    else if (l !== undefined && ('+−×÷^√'.includes(l) || /^[a-z]{2,}$/.test(l))) t.pop();
    else break;
  }
  if (!t.length) throw 'e';
  for (; open > 0; open--) t.push(')');
  let i = 0;
  let pct = false;
  const peek = () => t[i];
  const nx = () => t[i++];
  const E = () => {
    let l = T();
    while (peek() === '+' || peek() === '−') {
      const o = nx();
      let r = T();
      if (pct) r = l * r;
      l = o === '+' ? l + r : l - r;
    }
    return l;
  };
  const T = () => {
    pct = false;
    let l = U();
    while (peek() === '×' || peek() === '÷') {
      const o = nx();
      pct = false;
      const r = U();
      if (o === '×') l *= r;
      else { if (r === 0) throw 'div0'; l /= r; }
    }
    return l;
  };
  const U = () => {
    if (peek() === '−') { nx(); return -U(); }
    if (peek() === '+') { nx(); return U(); }
    return P();
  };
  const P = () => {
    const b = Q();
    if (peek() === '^') { nx(); return Math.pow(b, U()); }
    return b;
  };
  const Q = () => {
    let v = A();
    for (;;) {
      if (peek() === '%') { nx(); v /= 100; pct = true; }
      else if (peek() === '!') {
        nx();
        if (v < 0 || v > 170 || Math.floor(v) !== v) throw 'e';
        let r = 1;
        for (let k = 2; k <= v; k++) r *= k;
        v = r;
      } else break;
    }
    return v;
  };
  const A = () => {
    const x = nx();
    if (x === undefined) throw 'e';
    if (/^[\d.]/.test(x)) return parseFloat(x);
    if (x === 'π') return Math.PI;
    if (x === 'e') return Math.E;
    if (x === '(') { const v = E(); if (nx() !== ')') throw 'e'; return v; }
    if (x === '√' || FUN[x]) {
      if (nx() !== '(') throw 'e';
      const v = E();
      nx();
      return x === '√' ? Math.sqrt(v) : FUN[x](v);
    }
    throw 'e';
  };
  const r = E();
  if (i < t.length || !isFinite(r)) throw 'e';
  return r;
}
function step(c, k) {
  let { ex, ov, fresh, sci, second, rad } = c;
  let add = null;
  if (k === 'M') return { ...c, sci: !sci };
  if (k === '2nd') return { ...c, second: !second };
  if (k === 'rad') return { ...c, rad: !rad };
  ov = '';
  const L = ex.slice(-1);
  const isOp = x => '+−×÷^'.includes(x);
  const startNew = () => { if (fresh) { ex = ''; fresh = false; } };
  const seg = () => (ex.match(/\d*\.?\d*$/) || [''])[0];
  const FN = {
    sin: second ? 'asin(' : 'sin(', cos: second ? 'acos(' : 'cos(', tan: second ? 'atan(' : 'tan(',
    lg: second ? '10^(' : 'lg(', ln: second ? 'e^(' : 'ln(', '√x': second ? '^2' : '√(',
  };
  if (k === 'C' || k === 'AC') { ex = ''; fresh = false; }
  else if (k === '⌫') {
    if (fresh) { ex = ''; fresh = false; }
    else ex = ex.replace(/(asin|acos|atan|sin|cos|tan|lg|ln)\($|.$/, '');
  }
  else if (/^\d$/.test(k)) { startNew(); if (seg() === '0') ex = ex.slice(0, -1); ex += k; }
  else if (k === '.') { startNew(); if (seg().includes('.')) return c; ex += seg() ? '.' : '0.'; }
  else if (k === 'xʸ' || ('+−×÷'.includes(k) && k.length === 1)) {
    const o = k === 'xʸ' ? '^' : k;
    if (ex === '') { if (o === '−') ex = '−'; }
    else if (ex === '−') { /* nothing */ }
    else {
      fresh = false;
      if (isOp(L)) { if (ex.slice(-2, -1) !== '(' && ex.length > 1) ex = ex.slice(0, -1) + o; }
      else if (L === '(') { if (o === '−') ex += o; }
      else ex += o;
    }
  }
  else if (k === '(') { startNew(); ex += '('; }
  else if (k === ')') {
    const op = (ex.match(/\(/g) || []).length - (ex.match(/\)/g) || []).length;
    if (op > 0 && !isOp(L) && L !== '(') ex += ')';
  }
  else if (FN[k]) {
    const f = FN[k];
    if (f === '^2') { if (ex && !isOp(L) && L !== '(') { ex += f; fresh = false; } }
    else { startNew(); ex += f; }
  }
  else if (k === 'π' || k === 'e') { startNew(); ex += k; }
  else if (k === 'x!' || k === '%') {
    if (/[\d.πe)%!]$/.test(ex)) { ex += k === 'x!' ? '!' : '%'; fresh = false; }
  }
  else if (k === '1/x') { if (ex) { ex = '1÷(' + ex + ')'; fresh = false; } }
  else if (k === '=') {
    if (!ex) return c;
    try {
      const r = fmt(evalEx(ex, rad)).replace('-', '−');
      add = { e: ex, r, t: Date.now() };
      if (/e/.test(r)) { ov = r; ex = ''; } else ex = r;
      fresh = true;
    } catch (e) {
      ov = e === 'div0' ? "Can't divide by 0" : 'Error';
      ex = '';
      fresh = false;
    }
  }
  return { ex, ov, fresh, sci, second, rad, add };
}

/* ===== converter data ===== */
const P = s => s.split(';').map(x => { const a = x.split('|'); return { n: a[0], s: a[1], f: +a[2] }; });
const UN = {
  length: { t: 'Length', d: [0, 1], u: P('Meter|m|1;Kilometer|km|1000;Centimeter|cm|0.01;Millimeter|mm|0.001;Mile|mi|1609.344;Yard|yd|0.9144;Foot|ft|0.3048;Inch|in|0.0254;Nautical mile|nmi|1852') },
  mass: { t: 'Mass', d: [0, 1], u: P('Kilogram|kg|1;Gram|g|0.001;Milligram|mg|0.000001;Tonne|t|1000;Quintal|q|100;Pound|lb|0.45359237;Ounce|oz|0.028349523125;Stone|st|6.35029318') },
  area: { t: 'Area', d: [0, 1], u: P('Square meter|m²|1;Square kilometer|km²|1000000;Hectare|ha|10000;Acre|ac|4046.8564224;Square foot|ft²|0.09290304;Square yard|yd²|0.83612736;Square inch|in²|0.00064516;Cent|cent|40.468564224;Ground|ground|222.967296') },
  time: { t: 'Time', d: [3, 2], u: P('Second|s|1;Millisecond|ms|0.001;Minute|min|60;Hour|h|3600;Day|d|86400;Week|wk|604800;Month|mo|2629800;Year|yr|31557600') },
  data: { t: 'Data', d: [3, 2], u: P('Bit|bit|0.125;Byte|B|1;Kilobyte|KB|1024;Megabyte|MB|1048576;Gigabyte|GB|1073741824;Terabyte|TB|1099511627776;Petabyte|PB|1125899906842624') },
  volume: { t: 'Volume', d: [0, 1], u: P('Cubic meter|m³|1;Cubic centimeter|cm³|0.000001;Liter|L|0.001;Milliliter|mL|0.000001;US gallon|gal|0.003785411784;US quart|qt|0.000946352946;US pint|pt|0.000473176473;US cup|cup|0.0002365882365;Fluid ounce|fl oz|0.0000295735295625;Tablespoon|tbsp|0.0000147867647813;Teaspoon|tsp|0.00000492892159375') },
  speed: { t: 'Speed', d: [1, 5], u: P('Meter/second|m/s|1;Kilometer/hour|km/h|0.2777777777777778;Mile/hour|mph|0.44704;Knot|kn|0.5144444444444445;Foot/second|ft/s|0.3048;Kilometer/second|km/s|1000;Mach|Ma|340.29') },
  energy: { t: 'Science & Energy', d: [0, 1], u: P('Joule|J|1;Kilojoule|kJ|1000;Calorie|cal|4.184;Kilocalorie|kcal|4184;Watt hour|Wh|3600;Kilowatt hour|kWh|3600000;BTU|BTU|1055.056;Electronvolt|eV|1.602176634e-19') },
};
const tC = (u, x) => (u === 0 ? x : u === 1 ? (x - 32) * 5 / 9 : x - 273.15);
const fC = (u, c) => (u === 0 ? c : u === 1 ? c * 9 / 5 + 32 : c + 273.15);
const CUR = 'INR|Indian rupee|93.9;USD|US dollar|1;EUR|Euro|0.8975;GBP|British pound|0.76;JPY|Japanese yen|158.5;AUD|Australian dollar|1.5;CAD|Canadian dollar|1.38;CNY|Chinese yuan|7.2;AED|UAE dirham|3.6725;SGD|Singapore dollar|1.3;SAR|Saudi riyal|3.75;CHF|Swiss franc|0.8;HKD|Hong Kong dollar|7.84;KRW|South Korean won|1400;MYR|Malaysian ringgit|4.2;LKR|Sri Lankan rupee|300;THB|Thai baht|33;IDR|Indonesian rupiah|16500;NZD|New Zealand dollar|1.65;ZAR|South African rand|18;RUB|Russian ruble|90;TRY|Turkish lira|40;BRL|Brazilian real|5.5;MXN|Mexican peso|19;PKR|Pakistani rupee|280;BDT|Bangladeshi taka|120;NPR|Nepalese rupee|150;QAR|Qatari riyal|3.64;KWD|Kuwaiti dinar|0.307;OMR|Omani rial|0.385;BHD|Bahraini dinar|0.376;SEK|Swedish krona|10;NOK|Norwegian krone|10.5;DKK|Danish krone|6.7;PHP|Philippine peso|57;VND|Vietnamese dong|25500'
  .split(';')
  .map(x => { const a = x.split('|'); return { n: a[1], s: a[0], f: 1 / +a[2] }; });
let rateNote = 'Exchange rates are approximate (offline). They update when online.';

/* ===== converter screens (keypad based) ===== */
const form = (id, title, ins, outs, fn, def = []) => ({
  id, title, kind: 'form', act: 0, ni: ins.length, fn,
  rows: [...ins.map((l, i) => ({ l, in: 1, s: def[i] || '' })), ...outs.map(l => ({ l }))],
});
function build(id) {
  const mk = (title, units, d, tmp) => ({ id, title, kind: 'unit', units, tmp: !!tmp, neg: !!tmp, act: 0, rows: d.map(u => ({ in: 1, u, s: '' })) });
  let S;
  if (id === 'currency') S = mk('Currency', CUR, [0, 1, 2]);
  else if (id === 'temperature') S = mk('Temperature', [{ n: 'Celsius', s: '°C' }, { n: 'Fahrenheit', s: '°F' }, { n: 'Kelvin', s: 'K' }], [0, 1, 2], 1);
  else if (UN[id]) S = mk(UN[id].t, UN[id].u, UN[id].d);
  else if (id === 'numeral') {
    S = { id, title: 'Numeral system', kind: 'num', bases: [2, 8, 10, 16], act: 2, rows: ['Binary', 'Octal', 'Decimal', 'Hexadecimal'].map(l => ({ l, in: 1, s: '' })) };
    S.rows[2].s = '1';
  }
  else if (id === 'discount') {
    S = form(id, 'Discount', ['Original price', 'Discount (%)'], ['You save', 'Final price'],
      ([p, d]) => (d > 100 ? null : [money(p * d / 100), money(p - p * d / 100)]));
  }
  else if (id === 'gst') {
    S = form(id, 'GST', ['Original price'], ['GST amount', 'Final price'], ([p], s) => {
      const r = s.rate;
      const base = s.rm ? p / (1 + r / 100) : p;
      const g = s.rm ? p - base : p * r / 100;
      s.rows[0].l = s.rm ? 'Price (incl. GST)' : 'Original price';
      s.rows[1].l = 'GST amount';
      s.rows[2].l = s.rm ? 'Price without GST' : 'Final price';
      return [money(g), money(s.rm ? base : p + g)];
    }, ['100']);
    S.rate = 3;
    S.rm = false;
  }
  else if (id === 'emi') {
    S = form(id, 'EMI', ['Loan amount', 'Interest (% per year)', 'Duration (months)'], ['Monthly EMI', 'Total interest', 'Total payment'], ([Pr, R, N]) => {
      if (N <= 0 || Pr <= 0) return null;
      const r = R / 1200;
      const e = r ? Pr * r * Math.pow(1 + r, N) / (Math.pow(1 + r, N) - 1) : Pr / N;
      return [money(e), money(e * N - Pr), money(e * N)];
    });
  }
  else if (id === 'interest') {
    S = form(id, 'Interest', ['Principal', 'Rate (% per year)', 'Time (years)'], ['Simple interest', 'Simple total', 'Compound interest', 'Compound total'], ([p, r, t]) => {
      const c = p * Math.pow(1 + r / 100, t);
      return [money(p * r * t / 100), money(p + p * r * t / 100), money(c - p), money(c)];
    });
  }
  else if (id === 'fuel') {
    S = form(id, 'Fuel / Mileage', ['Distance (km)', 'Fuel used (L)', 'Price per litre'], ['Mileage (km/L)', 'Total cost', 'Cost per km'],
      ([d, f, p]) => (f <= 0 || d <= 0 ? null : [money(d / f), money(f * p), money(f * p / d)]));
  }
  else if (id === 'water') {
    S = form(id, 'Water Intake', ['Weight (kg)', 'Exercise (min/day)'], ['Water per day (L)', 'Glasses (250 ml)'], ([w, e]) => {
      const l = (w * 35 + e * 12) / 1000;
      return [money(l), String(Math.ceil(l * 4))];
    });
  }
  if (S.kind === 'unit') S.rows[0].s = '1';
  return S;
}
function recalc(S) {
  const a = S.rows[S.act];
  if (S.kind === 'unit') {
    const x = $n(a.s);
    const base = S.tmp ? tC(a.u, x) : x * S.units[a.u].f;
    S.rows.forEach((r, i) => { r.v = i === S.act ? a.s : fmt(S.tmp ? fC(r.u, base) : base / S.units[r.u].f); });
  } else if (S.kind === 'num') {
    const n = parseInt(a.s || '0', S.bases[S.act]) || 0;
    S.rows.forEach((r, i) => { r.v = i === S.act ? a.s : n.toString(S.bases[i]).toUpperCase(); });
  } else {
    const ins = S.rows.slice(0, S.ni).map(r => $n(r.s));
    let o;
    if (ins.every(x => !x)) o = S.rows.slice(S.ni).map(() => '0');
    else { try { o = S.fn(ins, S); } catch (e) { o = null; } }
    S.rows.forEach((r, i) => { r.v = i < S.ni ? r.s : (o ? o[i - S.ni] : 'Invalid'); });
  }
}
function editKey(S, k) {
  const r = S.rows[S.act];
  if (!r || !r.in) return false;
  let s = r.s || '';
  if (k === 'C') s = '';
  else if (k === '⌫') s = s.slice(0, -1);
  else if (k === '.') {
    if (S.kind === 'num' || s.includes('.')) return false;
    s = ((s === '' || s === '-') ? s + '0' : s) + '.';
  }
  else if (k === '−') { if (!S.neg) return false; s = s[0] === '-' ? s.slice(1) : '-' + s; }
  else if (/^(00|[0-9A-F])$/.test(k)) {
    if (S.kind === 'num') {
      const b = S.bases[S.act];
      if (k === '00' || parseInt(k, 16) >= b) return false;
      const t = (s + k).replace(/^0+(?=.)/, '');
      if (!Number.isSafeInteger(parseInt(t, b))) return false;
      s = t;
    } else {
      if (/^[A-F]$/.test(k) || s.replace(/[-.]/g, '').length >= 14) return false;
      if (k === '00') { if (['', '0', '-', '-0'].includes(s)) return false; s += '00'; }
      else s = (s === '0' || s === '-0') ? s.slice(0, -1) + k : s + k;
    }
  } else return false;
  r.s = s;
  return true;
}

/* ===== native-input screens ===== */
const ZN = { India: 330, UTC: 0, London: 0, Dubai: 240, Singapore: 480, Tokyo: 540, Sydney: 600, 'New York': -300, 'Los Angeles': -480, Paris: 60 };
const SZ = [[5, 6, 38, 24], [6, 7, 39, 25], [7, 8, 41, 26], [8, 9, 42, 27], [9, 10, 43, 28], [10, 11, 44.5, 29], [11, 12, 46, 30], [12, 13, 47, 31]];
const NF = {
  bmi: {
    t: 'BMI',
    f: [{ k: 'a', l: 'Age', t: 'num' }, { k: 'g', l: 'Gender', t: 'chips', o: ['Male', 'Female'], d: 'Male' }, { k: 'h', l: 'Height (cm)', t: 'num' }, { k: 'w', l: 'Weight (kg)', t: 'num' }],
    about: "Body mass index (BMI) is a person's weight in kilograms divided by the square of height in meters. It is an easy screening method for weight category.",
    calc: v => {
      const a = $n(v.a), h = $n(v.h), w = $n(v.w);
      if (!(a >= 2 && a <= 120)) return 'Enter a valid age';
      if (!(h >= 50 && h <= 272) || !(w >= 2 && w <= 650)) return 'Enter valid height and weight';
      const b = w / ((h / 100) ** 2);
      const r = [['BMI', b.toFixed(1)], ['Category', b < 18.5 ? 'Underweight' : b < 25 ? 'Normal' : b < 30 ? 'Overweight' : 'Obese']];
      if (a < 18) r.push(['Note', 'Under 18: ask a doctor']);
      return r;
    },
  },
  calorie: {
    t: 'Calorie & BMR',
    f: [{ k: 'a', l: 'Age', t: 'num' }, { k: 'g', l: 'Gender', t: 'chips', o: ['Male', 'Female'], d: 'Male' }, { k: 'h', l: 'Height (cm)', t: 'num' }, { k: 'w', l: 'Weight (kg)', t: 'num' }, { k: 'x', l: 'Activity', t: 'chips', o: ['Sedentary', 'Light', 'Moderate', 'Active'], d: 'Sedentary' }],
    about: 'Uses the Mifflin-St Jeor formula. Values are estimates, not medical advice.',
    calc: v => {
      const a = $n(v.a), h = $n(v.h), w = $n(v.w);
      if (!(a >= 2 && a <= 120 && h >= 50 && h <= 272 && w >= 2 && w <= 650)) return 'Enter valid age, height and weight';
      const bmr = 10 * w + 6.25 * h - 5 * a + (v.g === 'Male' ? 5 : -161);
      const m = bmr * { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725 }[v.x];
      return [['BMR (kcal/day)', String(Math.round(bmr))], ['Maintain weight', String(Math.round(m))], ['Lose weight (−500)', String(Math.round(m - 500))], ['Gain weight (+500)', String(Math.round(m + 500))]];
    },
  },
  age: {
    t: 'Age',
    f: [{ k: 'dob', l: 'Date of birth (DD/MM/YYYY)', t: 'text' }],
    calc: v => {
      const [d, m, y] = (v.dob || '').split('/').map(Number);
      const b = new Date(y, m - 1, d);
      const n = new Date();
      const td = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      if (!y || !m || !d || y < 1900 || b.getMonth() !== m - 1 || b > td) return 'Enter a valid date (DD/MM/YYYY)';
      let Y = n.getFullYear() - y, M = n.getMonth() - (m - 1), D = n.getDate() - d;
      if (D < 0) { M--; D += new Date(n.getFullYear(), n.getMonth(), 0).getDate(); }
      if (M < 0) { Y--; M += 12; }
      let nb = new Date(n.getFullYear(), m - 1, d);
      if (nb < td) nb = new Date(n.getFullYear() + 1, m - 1, d);
      return [['Age', Y + ' years'], ['Months & days', M + ' months, ' + D + ' days'], ['Next birthday', 'in ' + Math.round((nb - td) / 864e5) + ' days']];
    },
  },
  tz: {
    t: 'Time Zone',
    f: [{ k: 't', l: 'Time (HH:MM, 24-hour)', t: 'text', d: '09:00' }, { k: 'a', l: 'From', t: 'chips', o: Object.keys(ZN), d: 'India' }, { k: 'b', l: 'To', t: 'chips', o: Object.keys(ZN), d: 'London' }],
    about: 'Daylight saving time is not included.',
    calc: v => {
      const [h, m] = (v.t || '').split(':').map(Number);
      if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return 'Enter time as HH:MM';
      let t = h * 60 + m - ZN[v.a] + ZN[v.b];
      const day = Math.floor(t / 1440);
      t = ((t % 1440) + 1440) % 1440;
      const p = n => String(n).padStart(2, '0');
      return [[v.b, p(Math.floor(t / 60)) + ':' + p(t % 60)], ['Day', day === 0 ? 'Same day' : day > 0 ? 'Next day' : 'Previous day']];
    },
  },
  size: {
    t: 'Size Converter',
    f: [{ k: 's', l: 'Shoe size system (men)', t: 'chips', o: ['UK', 'US', 'EU', 'CM'], d: 'UK' }, { k: 'n', l: 'Size', t: 'num' }],
    about: "Approximate men's shoe sizes (UK 5 to 12).",
    calc: v => {
      const i = ['UK', 'US', 'EU', 'CM'].indexOf(v.s);
      const n = $n(v.n);
      const r = SZ.reduce((a, b) => (Math.abs(b[i] - n) < Math.abs(a[i] - n) ? b : a));
      if (!n || Math.abs(r[i] - n) > 1.5) return 'Size out of range';
      return [['UK', String(r[0])], ['US', String(r[1])], ['EU', String(r[2])], ['CM', String(r[3])]];
    },
  },
};

/* ===== UI pieces ===== */
const PADS = {
  std: [['C', '⌫', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['M', '0', '.', '=']],
  sci: [['2nd', 'rad', 'sin', 'cos', 'tan'], ['xʸ', 'lg', 'ln', '(', ')'], ['√x', 'C', '⌫', '%', '÷'], ['x!', '7', '8', '9', '×'], ['1/x', '4', '5', '6', '−'], ['π', '1', '2', '3', '+'], ['M', 'e', '0', '.', '=']],
  cv: [['C', '⌫', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['00', '0', '.', '=']],
};
const F2 = { sin: 'sin⁻¹', cos: 'cos⁻¹', tan: 'tan⁻¹', lg: '10ˣ', ln: 'eˣ', '√x': 'x²' };

function Key({ label, icon, color, bg, fs, h, r, dis, onPress }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = v => Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 60, bounciness: v === 1 ? 14 : 0 }).start();
  return (
    <Animated.View style={{ flex: 1, margin: 4, opacity: dis ? 0.32 : 1, transform: [{ scale: s }] }}>
      <Pressable disabled={dis} onPressIn={() => to(0.88)} onPressOut={() => to(1)} onPress={onPress}
        style={{ height: h, borderRadius: r, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        {icon ? <MI name={icon} size={fs + 2} color={color} /> : <Text style={{ color, fontSize: fs, fontWeight: '600' }}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}
function Pad({ kind, onPress, c = {}, neg }) {
  const T = useContext(Th);
  const { height: H } = useWindowDimensions();
  const rows = PADS[kind];
  const sci = kind === 'sci';
  const kh = Math.min(sci ? 56 : 70, Math.max(38, (H * 0.44) / rows.length - 8));
  return (
    <View style={{ paddingHorizontal: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          {row.map(k => {
            let color = T.tx, bg = T.key, fs = sci ? 21 : 26, label = k, icon, dis = false;
            if (k === '=') { bg = T.or; color = '#fff'; dis = kind === 'cv'; }
            else if (k === 'M') { icon = c.sci ? 'fullscreen' : 'sync'; color = T.or; }
            else if (k === '⌫') { icon = 'backspace-outline'; color = T.or; }
            else if ('C%÷×−+'.includes(k)) {
              color = T.or;
              if (k === 'C') label = kind !== 'cv' && !c.ex ? 'AC' : 'C';
              if (kind === 'cv' && (k === '%' || k === '÷' || k === '×' || k === '+' || (k === '−' && !neg))) dis = true;
            }
            else if (!/^([0-9.]|00)$/.test(k)) {
              color = k === '2nd' && c.second ? T.or : T.gr;
              fs = 17;
              label = k === 'rad' ? (c.rad ? 'rad' : 'deg') : (c.second && F2[k]) || k;
            }
            return <Key key={k} label={label} icon={icon} color={color} bg={bg} fs={fs} h={kh} r={sci ? 22 : kh / 2} dis={dis} onPress={() => onPress(k)} />;
          })}
        </View>
      ))}
    </View>
  );
}
function Slide({ k, dir, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [k]);
  return (
    <Animated.View style={{ flex: 1, opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [dir * 26, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}
function Tile({ m, onPress }) {
  const T = useContext(Th);
  const s = useRef(new Animated.Value(0)).current;
  const to = v => Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
  return (
    <Pressable onPressIn={() => to(1)} onPressOut={() => to(0)} onPress={onPress} style={{ width: '33.33%', alignItems: 'center', paddingVertical: 16 }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: s.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }, { scale: s.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
        <MI name={m[2]} size={38} color={T.tx} />
        <Text style={{ color: T.tx, fontSize: 15, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>{m[1]}</Text>
      </Animated.View>
    </Pressable>
  );
}
const MENU = [
  ['currency', 'Currency', 'currency-inr'], ['length', 'Length', 'ruler'], ['mass', 'Mass', 'weight'],
  ['area', 'Area', 'vector-square'], ['time', 'Time', 'clock-outline'], ['data', 'Data', 'database'],
  ['discount', 'Discount', 'tag'], ['volume', 'Volume', 'cube-outline'], ['numeral', 'Numeral system', 'numeric'],
  ['speed', 'Speed', 'speedometer'], ['temperature', 'Temperature', 'thermometer'], ['bmi', 'BMI', 'scale-bathroom'],
  ['gst', 'GST', 'receipt'], ['emi', 'EMI', 'cash-multiple'], ['interest', 'Interest', 'percent'],
  ['fuel', 'Fuel / Mileage', 'gas-station'], ['calorie', 'Calorie & BMR', 'fire'], ['water', 'Water Intake', 'cup-water'],
  ['tz', 'Time Zone', 'earth'], ['age', 'Age', 'cake-variant'], ['energy', 'Science & Energy', 'flask-outline'],
  ['size', 'Size Converter', 'shoe-formal'],
];
function Chip({ on, label, onPress, flex }) {
  const T = useContext(Th);
  return (
    <Pressable onPress={onPress} style={{ flex: flex ? 1 : 0, backgroundColor: on ? T.or : T.chip, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, margin: 3, alignItems: 'center' }}>
      <Text style={{ color: on ? '#fff' : T.tx, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/* ===== screens ===== */
function CalcScreen({ c, onKey, hist }) {
  const T = useContext(Th);
  const t = c.ov || pretty(c.ex) || '0';
  let live = '';
  if (!c.fresh && !c.ov && /[+−×÷^%!(]|sin|cos|tan|ln|lg|√/.test(c.ex.slice(c.ex[0] === '−' ? 1 : 0))) {
    try { live = '= ' + commas(fmt(evalEx(c.ex, c.rad)).replace('-', '−')); } catch (e) { live = ''; }
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 22, paddingBottom: 8 }}>
        {hist.slice(-3).map((x, i) => (
          <Text key={i} style={{ color: T.gr, fontSize: 17, fontWeight: '600', textAlign: 'right', lineHeight: 30 }}>{pretty(x.e)}= {commas(x.r)}</Text>
        ))}
        <Text style={{ color: T.tx, fontWeight: '700', fontSize: Math.max(26, Math.min(52, 500 / Math.max(t.length, 9))), textAlign: 'right', marginTop: 14 }}>{t}</Text>
        <Text style={{ color: T.gr, fontSize: 19, textAlign: 'right', minHeight: 30 }}>{live}</Text>
      </View>
      <Pad kind={c.sci ? 'sci' : 'std'} c={c} onPress={onKey} />
    </View>
  );
}
function MenuScreen({ onOpen }) {
  return (
    <ScrollView bounces alwaysBounceVertical overScrollMode="always" contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingBottom: 30 }}>
      {MENU.map(m => <Tile key={m[0]} m={m} onPress={() => onOpen(m[0])} />)}
    </ScrollView>
  );
}
function RowsScreen({ id }) {
  const T = useContext(Th);
  const S = useRef(null);
  if (!S.current) S.current = build(id);
  const s = S.current;
  const [, f] = useState(0);
  const [sheet, setSheet] = useState(-1);
  const [q, setQ] = useState('');
  const rf = () => { recalc(s); f(n => n + 1); };
  useEffect(() => { rf(); }, []);
  const press = k => { if (editKey(s, k)) rf(); };
  const small = s.rows.length > 4;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView bounces alwaysBounceVertical overScrollMode="always" style={{ flex: 1 }}>
        {s.rows.map((r, i) => {
          const act = i === s.act && r.in;
          const v = (r.v === undefined || r.v === '') ? '0' : r.v;
          return (
            <Pressable key={i} onPress={() => {
              if (!r.in || i === s.act) return;
              r.s = ['0', 'Error', 'Invalid'].includes(r.v) ? '' : String(r.v);
              s.act = i;
              rf();
            }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, minHeight: small ? 58 : 76 }}>
              <Pressable disabled={!s.units} onPress={() => { setQ(''); setSheet(i); }} style={{ maxWidth: '46%', paddingVertical: 8 }}>
                <Text style={{ color: T.tx, fontSize: 15, fontWeight: '700' }}>
                  {s.units ? s.units[r.u].n : r.l}
                  {s.units ? <Text style={{ color: T.gr }}> {s.units[r.u].s} ⌄</Text> : null}
                </Text>
              </Pressable>
              <Text style={{ color: act ? T.or : T.tx, fontSize: small ? 22 : 26, fontWeight: '700', maxWidth: '54%', textAlign: 'right' }}>
                {s.kind === 'num' ? v : commas(v)}
              </Text>
            </Pressable>
          );
        })}
        <View style={{ paddingHorizontal: 17, paddingTop: 4 }}>
          {id === 'numeral' && (
            <View style={{ flexDirection: 'row' }}>
              {'ABCDEF'.split('').map(h => <Chip key={h} flex label={h} onPress={() => press(h)} />)}
            </View>
          )}
          {id === 'gst' && (
            <>
              <View style={{ flexDirection: 'row' }}>
                {[3, 5, 12, 18, 28].map(r => <Chip key={r} flex on={s.rate === r} label={r + '%'} onPress={() => { s.rate = r; rf(); }} />)}
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Chip flex on={!s.rm} label="Add GST" onPress={() => { s.rm = false; rf(); }} />
                <Chip flex on={s.rm} label="Remove GST" onPress={() => { s.rm = true; rf(); }} />
              </View>
              <Text style={{ color: T.gr, fontSize: 13, margin: 6 }}>CGST {s.rate / 2}% + SGST {s.rate / 2}%</Text>
            </>
          )}
          {id === 'currency' && <Text style={{ color: T.gr, fontSize: 12, margin: 6 }}>{rateNote}</Text>}
        </View>
      </ScrollView>
      <Pad kind="cv" neg={s.neg} onPress={press} />
      <Modal visible={sheet >= 0} transparent animationType="slide" onRequestClose={() => setSheet(-1)}>
        <Pressable style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }} onPress={() => setSheet(-1)}>
          <Pressable style={{ backgroundColor: T.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '70%', padding: 14 }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={T.gr}
              style={{ backgroundColor: T.chip, color: T.tx, borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 6 }} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {(s.units || []).map((u, i) => ({ u, i }))
                .filter(o => !q || (o.u.n + ' ' + o.u.s).toLowerCase().includes(q.toLowerCase()))
                .map(o => (
                  <Pressable key={o.i} onPress={() => { s.rows[sheet].u = o.i; setSheet(-1); rf(); }}
                    style={{ paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: T.ln }}>
                    <Text style={{ color: T.tx, fontSize: 16 }}>{o.u.n} <Text style={{ color: T.gr }}>{o.u.s}</Text></Text>
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
function NativeForm({ id }) {
  const T = useContext(Th);
  const cfg = NF[id];
  const [v, setV] = useState(() => Object.fromEntries(cfg.f.map(x => [x.k, x.d || ''])));
  const [res, setRes] = useState(null);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" bounces alwaysBounceVertical overScrollMode="always" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {cfg.f.map(x => (
        <View key={x.k} style={{ marginTop: 16 }}>
          <Text style={{ color: T.gr, fontSize: 13 }}>{x.l}</Text>
          {x.t === 'chips' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginLeft: -3 }}>
              {x.o.map(o => <Chip key={o} on={v[x.k] === o} label={o} onPress={() => setV({ ...v, [x.k]: o })} />)}
            </View>
          ) : (
            <TextInput value={v[x.k]} onChangeText={t => setV({ ...v, [x.k]: t })}
              keyboardType={x.t === 'num' ? 'decimal-pad' : 'numbers-and-punctuation'}
              placeholder={'Enter ' + x.l.split(' (')[0].toLowerCase()} placeholderTextColor={T.gr}
              style={{ color: T.tx, fontSize: 18, borderBottomWidth: 1, borderColor: T.ln, paddingVertical: 8 }} />
          )}
        </View>
      ))}
      <Pressable onPress={() => setRes(cfg.calc(v))} style={{ marginTop: 28, backgroundColor: T.or, borderRadius: 28, height: 52, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Calculate</Text>
      </Pressable>
      {res && (typeof res === 'string' ? (
        <Text style={{ color: T.gr, textAlign: 'center', marginTop: 24, fontSize: 15 }}>{res}</Text>
      ) : (
        <View style={{ marginTop: 24 }}>
          {res.map(([l, val], i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: T.ln }}>
              <Text style={{ color: T.gr, fontSize: 15 }}>{l}</Text>
              <Text style={{ color: i === 0 ? T.or : T.tx, fontSize: i === 0 ? 24 : 17, fontWeight: '700' }}>{val}</Text>
            </View>
          ))}
        </View>
      ))}
      {cfg.about ? <Text style={{ color: T.gr, fontSize: 13, lineHeight: 20, marginTop: 28 }}>{cfg.about}</Text> : null}
    </ScrollView>
  );
}
function HistScreen({ hist, onPick }) {
  const T = useContext(Th);
  if (!hist.length) return <Text style={{ color: T.gr, textAlign: 'center', marginTop: 200 }}>No history yet</Text>;
  const g = {};
  [...hist].reverse().forEach(x => {
    const d = new Date(x.t);
    const p = n => String(n).padStart(2, '0');
    const key = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    if (!g[key]) g[key] = [];
    g[key].push(x);
  });
  return (
    <ScrollView bounces alwaysBounceVertical overScrollMode="always">
      {Object.entries(g).map(([k, a]) => (
        <View key={k} style={{ borderBottomWidth: 1, borderColor: T.ln, paddingBottom: 10 }}>
          <Text style={{ color: T.gr, fontSize: 13, textAlign: 'right', padding: 22, paddingBottom: 6 }}>{k}</Text>
          {a.map((x, i) => (
            <Pressable key={i} onPress={() => onPick(x)} style={{ paddingVertical: 12, paddingHorizontal: 22 }}>
              <Text style={{ textAlign: 'right', fontSize: 19, color: T.gr }}>{pretty(x.e)}= <Text style={{ color: T.tx, fontWeight: '600' }}>{commas(x.r)}</Text></Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
function Settings({ visible, onClose, onHist, tn, setTn }) {
  const T = useContext(Th);
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const [v, setV] = useState('main');
  useEffect(() => { if (visible) setV('main'); }, [visible]);
  const Row = ({ icon, label, onPress, right }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
      <SIcon src={icon} color={T.or} size={24} />
      <Text style={{ color: T.tx, fontSize: 16, marginLeft: 14, flex: 1 }}>{label}</Text>
      {right}
    </Pressable>
  );
  const head = t => <Text style={{ color: T.gr, fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 8 }}>{t}</Text>;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => (v === 'main' ? onClose() : setV('main'))}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Pressable style={{ position: 'absolute', top: insets.top + 52, right: 12, width: v === 'about' ? 300 : 240, maxHeight: H * 0.7, backgroundColor: T.card, borderRadius: 18, elevation: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, paddingVertical: 8 }}>
          {v === 'main' && (
            <>
              {head('Settings')}
              <Row icon={IC.themes} label="Themes" onPress={() => setV('themes')} />
              <Row icon={IC.history} label="History" onPress={() => { onClose(); onHist(); }} />
              <Row icon={IC.about} label="About app" onPress={() => setV('about')} />
            </>
          )}
          {v === 'themes' && (
            <>
              {head('Themes')}
              <Row icon={IC.sun} label="Light mode" onPress={() => { setTn('light'); onClose(); }}
                right={<MI name={tn === 'light' ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={T.or} />} />
              <Row icon={IC.moon} label="Dark mode" onPress={() => { setTn('dark'); onClose(); }}
                right={<MI name={tn === 'dark' ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={T.or} />} />
            </>
          )}
          {v === 'about' && (
            <ScrollView style={{ paddingHorizontal: 18 }}>
              {head('About app')}
              <Text style={{ color: T.tx, fontSize: 20, fontWeight: '700' }}>{APP_NAME}</Text>
              <Text style={{ color: T.gr, marginTop: 4 }}>Version {APP_VERSION}</Text>
              <Text style={{ color: T.gr, marginTop: 2 }}>{COMPANY}</Text>
              <Text style={{ color: T.tx, fontSize: 14, lineHeight: 21, marginTop: 14 }}>
                A simple and fast calculator with a standard and scientific mode, history, and many converters like currency, length, mass, EMI, GST, BMI and more. Works offline. Currency rates update when you are online.
              </Text>
              <Text style={{ color: T.gr, fontSize: 12, fontWeight: '700', marginTop: 16 }}>Disclaimer</Text>
              <Text style={{ color: T.gr, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                Results are for general information only. Currency rates are indicative. Health related results (BMI, calories, water) are estimates and not medical advice. Financial results (EMI, interest, GST) may differ from your bank or tax records. Please verify before making important decisions. This app may show ads. This app is not affiliated with any other calculator brand.
              </Text>
              <Text style={{ color: T.gr, fontSize: 12, marginVertical: 14 }}>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</Text>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function AdBanner() {
  const T = useContext(Th);
  const insets = useSafeAreaInsets();
  const real = !!Ads && !BANNER_AD_UNIT_ID.startsWith('PASTE');
  useEffect(() => {
    if (real) { try { Ads.default().initialize(); } catch (e) { /* ignore */ } }
  }, [real]);
  return (
    <View style={{ minHeight: 56, marginHorizontal: 8, marginTop: 4, marginBottom: insets.bottom + 4, alignItems: 'center', justifyContent: 'center' }}>
      {real ? (
        <Ads.BannerAd unitId={BANNER_AD_UNIT_ID} size={Ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      ) : (
        <View style={{ height: 52, alignSelf: 'stretch', borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.ln, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: T.gr, fontSize: 12 }}>Ad Banner</Text>
        </View>
      )}
    </View>
  );
}
/* full-screen splash image (Android 12+ system splash can't show a full-screen image) */
function Splash({ onDone }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => Animated.timing(o, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onDone()), 1400);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: o, zIndex: 99 }]}>
      <Image source={require('./assets/splash.png')} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

/* ===== App ===== */
function Root() {
  const insets = useSafeAreaInsets();
  const [tn, setTn] = useState('dark');
  const T = tn === 'dark' ? DARK : LIGHT;
  const [scr, setScr] = useState({ n: 'calc' });
  const [c, setC] = useState({ ex: '', ov: '', fresh: false, sci: false, second: false, rad: true });
  const [hist, setHist] = useState([]);
  const [set, setSet] = useState(false);
  const [armed, setArmed] = useState(false);
  const [splash, setSplash] = useState(true);
  const dir = useRef(1);

  useEffect(() => {
    AsyncStorage.multiGet(['mc_theme', 'mc_hist', 'mc_rates']).then(r => {
      if (r[0][1]) setTn(r[0][1]);
      if (r[1][1]) setHist(JSON.parse(r[1][1]));
      if (r[2][1]) {
        const j = JSON.parse(r[2][1]);
        CUR.forEach(u => { if (j.r[u.s]) u.f = 1 / j.r[u.s]; });
        rateNote = 'Exchange rates updated: ' + j.d;
      }
    }).catch(() => { });
    fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).then(j => {
      if (!j || !j.rates) return;
      CUR.forEach(u => { if (j.rates[u.s]) u.f = 1 / j.rates[u.s]; });
      const d = new Date().toLocaleDateString('en-GB');
      rateNote = 'Exchange rates updated: ' + d;
      AsyncStorage.setItem('mc_rates', JSON.stringify({ d, r: j.rates })).catch(() => { });
    }).catch(() => { });
  }, []);

  const changeTheme = k => { setTn(k); AsyncStorage.setItem('mc_theme', k).catch(() => { }); };
  const onKey = k => {
    const n = step(c, k);
    const { add, ...rest } = n;
    setC(rest);
    if (add) {
      const h = [...hist, add].slice(-500);
      setHist(h);
      AsyncStorage.setItem('mc_hist', JSON.stringify(h)).catch(() => { });
    }
  };
  const go = (n, id) => setScr({ n, id });
  const back = () => {
    if (scr.n === 'hist') go(scr.from || 'calc');
    else if (scr.n === 'conv') go('menu');
  };
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scr.n === 'hist' || scr.n === 'conv') { back(); return true; }
      return false;
    });
    return () => h.remove();
  }, [scr]);
  const clearHist = () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); }
    else { setArmed(false); setHist([]); AsyncStorage.setItem('mc_hist', '[]').catch(() => { }); }
  };
  const tab = scr.n === 'calc' || scr.n === 'menu';
  const title = scr.n === 'hist' ? (armed ? 'Tap 🗑 again to clear' : 'History') : scr.n === 'conv' ? (NF[scr.id] ? NF[scr.id].t : build(scr.id).title) : '';
  const barBtn = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' };
  return (
    <Th.Provider value={T}>
      <StatusBar barStyle={tn === 'dark' ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        {tab ? (
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
            <View style={barBtn} />
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={() => { dir.current = -1; go('calc'); }}>
                <Text style={{ color: scr.n === 'calc' ? T.tx : T.gr, fontSize: 18, fontWeight: '700', marginRight: 22 }}>Calculator</Text>
              </Pressable>
              <Pressable onPress={() => { dir.current = 1; go('menu'); }}>
                <Text style={{ color: scr.n === 'menu' ? T.tx : T.gr, fontSize: 18, fontWeight: '700' }}>Converter</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setSet(true)} style={barBtn}><MI name="dots-vertical" size={24} color={T.tx} /></Pressable>
          </View>
        ) : (
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
            <Pressable onPress={back} style={barBtn}><MI name="arrow-left" size={26} color={T.tx} /></Pressable>
            <Text style={{ color: T.tx, fontSize: 19, fontWeight: '700' }}>{title}</Text>
            <Pressable onPress={scr.n === 'hist' ? clearHist : undefined} style={barBtn}>
              {scr.n === 'hist' ? <MI name="trash-can-outline" size={24} color={T.tx} /> : null}
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Slide k={scr.n + (scr.id || '')} dir={dir.current}>
            {scr.n === 'calc' && <CalcScreen c={c} onKey={onKey} hist={hist} />}
            {scr.n === 'menu' && <MenuScreen onOpen={id => { dir.current = 1; go('conv', id); }} />}
            {scr.n === 'hist' && <HistScreen hist={hist} onPick={x => { if (!/e/.test(x.r)) setC({ ...c, ex: x.r, fresh: true, ov: '' }); go('calc'); }} />}
            {scr.n === 'conv' && (NF[scr.id] ? <NativeForm key={scr.id} id={scr.id} /> : <RowsScreen key={scr.id} id={scr.id} />)}
          </Slide>
        </View>
        <AdBanner />
      </View>
      <Settings visible={set} onClose={() => setSet(false)} onHist={() => setScr({ n: 'hist', from: scr.n })} tn={tn} setTn={changeTheme} />
      {splash && <Splash onDone={() => setSplash(false)} />}
    </Th.Provider>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
