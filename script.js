'use strict';

// ─── DOM ──────────────────────────────────────────────────────────────────────

const appEl       = document.getElementById('app');
const canvas      = document.getElementById('c');
const ctx         = canvas.getContext('2d');
const cityNameEl  = document.getElementById('city-name');
const cityCoordEl = document.getElementById('city-coords');
const aqiTextEl   = document.getElementById('aqi-text');
const sunEl       = document.getElementById('sun');
const moonEl      = document.getElementById('moon');

// ─── Day / night mode ─────────────────────────────────────────────────────────

let dark = true;

function isDaytime(lat, lon) {
  const now  = new Date();
  const JD   = now.getTime() / 86400000 + 2440587.5;
  const n    = JD - 2451545.0 + 0.0008;
  const Js   = n - lon / 360;
  const M    = ((357.5291 + 0.98560028 * Js) % 360 + 360) % 360;
  const Mr   = M * Math.PI / 180;
  const C    = 1.9148 * Math.sin(Mr) + 0.0200 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lam  = ((M + C + 282.9372) % 360 + 360) % 360;
  const lr   = lam * Math.PI / 180;
  const Jt   = 2451545.0 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lr);
  const sinD = Math.sin(lr) * Math.sin(23.4397 * Math.PI / 180);
  const cosD = Math.cos(Math.asin(sinD));
  const latr = lat * Math.PI / 180;
  const cosHA = (Math.sin(-0.8333 * Math.PI / 180) - Math.sin(latr) * sinD)
              / (Math.cos(latr) * cosD);
  if (cosHA <= -1) return true;
  if (cosHA >= 1)  return false;
  const w0    = Math.acos(cosHA) * 180 / Math.PI;
  const rise  = (Jt - w0 / 360 - 2440587.5) * 86400000;
  const set   = (Jt + w0 / 360 - 2440587.5) * 86400000;
  return now.getTime() >= rise && now.getTime() <= set;
}

function applyMode() {
  const cls = dark ? 'dark' : 'light';
  document.body.className = cls;
  appEl.className = cls;
  sunEl.classList.toggle('on', !dark);
  moonEl.classList.toggle('on',  dark);
}

function setMode(lightMode) {
  dark = !lightMode;
  applyMode();
}

function toggleMode() {
  dark = !dark;
  applyMode();
}

// ─── AQI categories ───────────────────────────────────────────────────────────

const CAT_DEFS = [
  { maxAqi:  50,      color: '#6699cc', label: 'good',           baseP:  22, hFrac: 0.26, turb: 0.01, maxVx: 0.20, speed: 0.22 },
  { maxAqi: 100,      color: '#44aa55', label: 'moderate',       baseP:  65, hFrac: 0.48, turb: 0.05, maxVx: 0.50, speed: 0.40 },
  { maxAqi: 250,      color: '#ffaa22', label: 'unhealthy',      baseP: 135, hFrac: 0.68, turb: 0.13, maxVx: 1.00, speed: 0.65 },
  { maxAqi: Infinity, color: '#dd3322', label: 'very unhealthy', baseP: 230, hFrac: 0.86, turb: 0.22, maxVx: 1.50, speed: 1.00 },
];

const VY   = 1.5;
let   CATS = [];

function updateCats() {
  const hScale = collarTopY / 648;
  CATS = CAT_DEFS.map(d => ({
    ...d,
    life: Math.round(collarTopY * d.hFrac / (d.speed * VY)),
    maxP: Math.round(d.baseP * Math.sqrt(hScale)),
  }));
}

function getCat(aqi) {
  return CATS.find(c => (aqi ?? 0) <= c.maxAqi) ?? CATS[CATS.length - 1];
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

let CELL, PIX, pipeW, collarW, collarH, pipeX, collarTopY;

function updateGeo() {
  const W = canvas.width, H = canvas.height;
  CELL       = Math.max(12, Math.min(22, Math.round(Math.min(W, H) / 28)));
  PIX        = CELL - 3;
  pipeW      = Math.min(90,  Math.round(W * 0.13));
  collarW    = Math.min(120, Math.round(W * 0.17));
  collarH    = Math.round(CELL * 1.5);
  pipeX      = Math.round(W / 2);
  collarTopY = Math.round(H * 0.82);
  updateCats();
}

function resize() {
  canvas.width  = appEl.clientWidth;
  canvas.height = appEl.clientHeight;
  updateGeo();
}
resize();
window.addEventListener('resize', resize);

// ─── Particles ────────────────────────────────────────────────────────────────

let particles = [];
let activeCat = CATS[0] ?? CAT_DEFS[0];
let emitAccum = 0;

class Particle {
  constructor() {
    this.x       = pipeX + (Math.random() - 0.5) * pipeW * 0.72;
    this.y       = collarTopY - 2;
    this.vx      = (Math.random() - 0.5) * 0.3;
    this.vy      = -(activeCat.speed * VY * (0.90 + Math.random() * 0.20));
    this.life    = 0;
    this.maxLife = activeCat.life * (0.82 + Math.random() * 0.36);
    this.color   = activeCat.color;
    this.turb    = activeCat.turb;
    this.maxVx   = activeCat.maxVx;
  }
  update() {
    this.life++;
    this.vx += (Math.random() - 0.5) * this.turb;
    this.vx  = Math.max(-this.maxVx, Math.min(this.maxVx, this.vx));
    this.x  += this.vx;
    this.y  += this.vy;
  }
  get alive() { return this.life < this.maxLife && this.y > -CELL; }
}

function emitStep() {
  if (particles.length < activeCat.maxP) {
    emitAccum += activeCat.maxP / activeCat.life;
    const n = Math.floor(emitAccum);
    emitAccum -= n;
    for (let i = 0; i < n; i++) particles.push(new Particle());
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = dark ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  particles = particles.filter(p => { p.update(); return p.alive; });
  emitStep();

  const occupied = new Set();
  const byColor  = new Map();

  for (const p of particles) {
    const gx  = Math.round(p.x / CELL);
    const gy  = Math.round(p.y / CELL);
    const key = (gx << 16) | (gy & 0xffff);
    if (occupied.has(key)) continue;
    occupied.add(key);
    if (!byColor.has(p.color)) byColor.set(p.color, []);
    byColor.get(p.color).push(gx, gy);
  }

  for (const [color, coords] of byColor) {
    ctx.fillStyle = color;
    for (let i = 0; i < coords.length; i += 2) {
      ctx.fillRect(coords[i] * CELL - PIX * 0.5, coords[i+1] * CELL - PIX * 0.5, PIX, PIX);
    }
  }

  ctx.fillStyle = dark ? '#ffffff' : '#000000';
  ctx.fillRect(pipeX - collarW / 2, collarTopY,          collarW, collarH);
  ctx.fillRect(pipeX - pipeW  / 2, collarTopY + collarH, pipeW,   H - collarTopY - collarH + 4);

  requestAnimationFrame(render);
}

// ─── Cities + data ────────────────────────────────────────────────────────────

const CITIES = [
  { name: 'Delhi',        lat:  28.6139, lon:  77.2090 },
  { name: 'Beijing',      lat:  39.9042, lon: 116.4074 },
  { name: 'Lahore',       lat:  31.5204, lon:  74.3587 },
  { name: 'Dhaka',        lat:  23.8103, lon:  90.4125 },
  { name: 'Jakarta',      lat:  -6.2088, lon: 106.8456 },
  { name: 'Karachi',      lat:  24.8607, lon:  67.0011 },
  { name: 'Mumbai',       lat:  19.0760, lon:  72.8777 },
  { name: 'Cairo',        lat:  30.0444, lon:  31.2357 },
  { name: 'Bangkok',      lat:  13.7563, lon: 100.5018 },
  { name: 'Istanbul',     lat:  41.0082, lon:  28.9784 },
  { name: 'Seoul',        lat:  37.5665, lon: 126.9780 },
  { name: 'Tokyo',        lat:  35.6762, lon: 139.6503 },
  { name: 'São Paulo',    lat: -23.5505, lon: -46.6333 },
  { name: 'Mexico City',  lat:  19.4326, lon: -99.1332 },
  { name: 'Los Angeles',  lat:  34.0522, lon:-118.2437 },
  { name: 'New York',     lat:  40.7128, lon: -74.0060 },
  { name: 'Lagos',        lat:   6.5244, lon:   3.3792 },
  { name: 'Nairobi',      lat:  -1.2921, lon:  36.8219 },
  { name: 'Johannesburg', lat: -26.2041, lon:  28.0473 },
  { name: 'London',       lat:  51.5074, lon:  -0.1278 },
  { name: 'Paris',        lat:  48.8566, lon:   2.3522 },
  { name: 'Berlin',       lat:  52.5200, lon:  13.4050 },
  { name: 'Oslo',         lat:  59.9139, lon:  10.7522 },
  { name: 'Sydney',       lat: -33.8688, lon: 151.2093 },
  { name: 'Singapore',    lat:   1.3521, lon: 103.8198 },
];

let cityIdx  = Math.floor(Math.random() * CITIES.length);
let fetching = false;

function fmtCoords(lat, lon) {
  return `${Math.abs(lat).toFixed(5)} ${lat >= 0 ? 'N' : 'S'},  `
       + `${Math.abs(lon).toFixed(5)} ${lon >= 0 ? 'E' : 'W'}`;
}

async function showCity(city) {
  if (fetching) return;
  fetching = true;
  try {
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=us_aqi,pm2_5,ozone,nitrogen_dioxide,sulphur_dioxide` +
      `&timezone=auto`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const aqi  = json.current?.us_aqi ?? 0;

    activeCat = getCat(aqi);
    setMode(isDaytime(city.lat, city.lon));

    cityNameEl.textContent  = city.name;
    cityCoordEl.textContent = fmtCoords(city.lat, city.lon);
    aqiTextEl.textContent   = `US AQI ${aqi}  ·  ${activeCat.label}`;

    loadingEl.classList.add('hidden');
  } catch (err) {
    console.warn(`${city.name} failed:`, err.message);
  } finally {
    fetching = false;
  }
}

function nextCity() {
  cityIdx = (cityIdx + 1) % CITIES.length;
  showCity(CITIES[cityIdx]);
}

canvas.addEventListener('click', nextCity);
setInterval(nextCity, 12_000);

// ─── Boot ─────────────────────────────────────────────────────────────────────

render();
showCity(CITIES[cityIdx]);
