// ──────────────────────────────────────────────
//  AirSense IoT — Application Logic (app.js)
// ──────────────────────────────────────────────

'use strict';

// ─── State ───────────────────────────────────
const MAX_HISTORY = 30;
let history = {
  labels: [], co2: [], pm25: [], no2: [],
  o3: [], co: [], pm10: [], aqi: []
};
let readingCount = 0;
let chartLive, chartCO2, chartPM25, chartNO2, chartAQIDistrib, chartRadar, aqiGauge;
let aqiGoodCount = 0, aqiModCount = 0, aqiUnhCount = 0, aqiHazCount = 0;

// ─── AQI Config ──────────────────────────────
const AQI_LEVELS = [
  { max: 50,  label: 'Good',                 color: '#4ade80', desc: 'Air quality is satisfactory and poses little or no risk.', cls: 'good' },
  { max: 100, label: 'Moderate',             color: '#fbbf24', desc: 'Acceptable quality; minor concern for sensitive individuals.', cls: 'moderate' },
  { max: 150, label: 'Unhealthy for Groups', color: '#fb923c', desc: 'Sensitive groups may experience health effects.', cls: 'moderate' },
  { max: 200, label: 'Unhealthy',            color: '#f87171', desc: 'Everyone may begin to experience adverse health effects.', cls: 'unhealthy' },
  { max: 300, label: 'Very Unhealthy',       color: '#c084fc', desc: 'Health alert: serious effects on entire population.', cls: 'unhealthy' },
  { max: 500, label: 'Hazardous',            color: '#e11d48', desc: 'Emergency conditions. Entire population likely affected.', cls: 'hazardous' }
];

function getAqiLevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

// ─── Sensor Simulation ───────────────────────
const SensorBase = {
  co2:  { val: 650, drift: 80, min: 380, max: 1900 },
  pm25: { val: 14,  drift: 15, min: 2,   max: 90   },
  no2:  { val: 30,  drift: 18, min: 5,   max: 110  },
  o3:   { val: 28,  drift: 12, min: 5,   max: 80   },
  co:   { val: 3.5, drift: 3,  min: 0.5, max: 12   },
  pm10: { val: 28,  drift: 20, min: 5,   max: 100  },
  temp: { val: 27,  drift: 3,  min: 18,  max: 38   },
  hum:  { val: 58,  drift: 8,  min: 30,  max: 85   }
};

function simSensor(key) {
  const s = SensorBase[key];
  // Random walk with mean reversion
  s.val += (Math.random() - 0.5) * s.drift;
  s.val = Math.max(s.min, Math.min(s.max, s.val));
  // Occasional spikes to make it interesting
  if (Math.random() < 0.05) s.val += (Math.random() - 0.3) * s.drift * 2;
  return +s.val.toFixed(1);
}

function calcAQI(co2, pm25, no2) {
  // Simplified AQI formula based on primary pollutants
  const aqiCO2  = Math.min(500, Math.max(0, ((co2 - 400) / 1500) * 500));
  const aqiPM25 = calcPM25AQI(pm25);
  const aqiNO2  = Math.min(500, Math.max(0, (no2 / 200) * 300));
  return Math.round(Math.max(aqiCO2, aqiPM25, aqiNO2));
}

function calcPM25AQI(pm) {
  // EPA standard breakpoints for PM2.5
  const bp = [
    [0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],
    [55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,350.4,301,400],[350.5,500.4,401,500]
  ];
  const b = bp.find(b => pm >= b[0] && pm <= b[1]);
  if (!b) return 500;
  return Math.round(((b[3]-b[2])/(b[1]-b[0]))*(pm-b[0])+b[2]);
}

function getSensorStatus(key, val) {
  const thresholds = {
    co2:  [[400,'Good'],[800,'Moderate'],[1000,'Unhealthy'],[9999,'Hazardous']],
    pm25: [[12,'Good'],[35,'Moderate'],[55,'Unhealthy'],[9999,'Hazardous']],
    no2:  [[53,'Good'],[100,'Moderate'],[200,'Unhealthy'],[9999,'Hazardous']],
    o3:   [[54,'Good'],[70,'Moderate'],[86,'Unhealthy'],[9999,'Hazardous']],
    co:   [[4,'Good'],[9,'Moderate'],[15,'Unhealthy'],[9999,'Hazardous']],
    pm10: [[54,'Good'],[154,'Moderate'],[254,'Unhealthy'],[9999,'Hazardous']]
  };
  const t = thresholds[key] || thresholds.co2;
  return t.find(([max]) => val <= max)?.[1] || 'Hazardous';
}

function statusClass(status) {
  return { Good:'status-good', Moderate:'status-moderate', Unhealthy:'status-unhealthy', Hazardous:'status-hazardous' }[status] || '';
}

// ─── DOM Helpers ─────────────────────────────
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setClass(el, cls) {
  el.classList.remove('status-good','status-moderate','status-unhealthy','status-hazardous');
  el.classList.add(cls);
}

// ─── Sensor Card Update ───────────────────────
function updateCard(key, val) {
  const status = getSensorStatus(key, val);
  const card   = document.getElementById(`card-${key}`);
  const valEl  = document.getElementById(`val-${key}`);
  const barEl  = document.getElementById(`bar-${key}`);
  const stEl   = document.getElementById(`status-${key}`);
  if (!card) return;

  const ranges = { co2:[380,1900], pm25:[0,90], no2:[0,110], o3:[0,80], co:[0,12], pm10:[0,100] };
  const [rmin, rmax] = ranges[key] || [0,100];
  const pct = Math.round(((val - rmin) / (rmax - rmin)) * 100);

  valEl.textContent = val;
  barEl.style.width = `${Math.min(100, pct)}%`;
  stEl.textContent  = status;
  ['co2','pm25','no2','o3','co','pm10'].forEach(k => setClass(card, ''));
  setClass(card, statusClass(status));
}

// ─── AQI Hero ────────────────────────────────
function updateHero(aqi, temp, hum) {
  const level = getAqiLevel(aqi);
  setText('aqi-value', aqi);
  setText('aqi-status', level.label);
  setText('aqi-desc', level.desc);
  setText('hero-time', new Date().toLocaleTimeString());
  setText('hero-temp', temp.toFixed(1));
  setText('hero-hum', hum.toFixed(0));
  setText('last-update', new Date().toLocaleTimeString());

  // Update AQI value color
  const aqiEl = document.getElementById('aqi-value');
  const stEl  = document.getElementById('aqi-status');
  if (aqiEl) { aqiEl.style.color = level.color; stEl.style.color = level.color; }

  drawGauge(aqi, level.color);
}

// ─── AQI Gauge ───────────────────────────────
function drawGauge(aqi, color) {
  const canvas = document.getElementById('aqi-gauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 100, cy = 110, r = 80, startAngle = Math.PI, endAngle = 2 * Math.PI;
  ctx.clearRect(0, 0, 200, 200);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.stroke();

  // Value arc
  const progress = Math.min(1, aqi / 300);
  const valueEnd = startAngle + progress * Math.PI;
  const grad = ctx.createLinearGradient(20, cy, 180, cy);
  grad.addColorStop(0, '#4ade80');
  grad.addColorStop(0.4, '#fbbf24');
  grad.addColorStop(0.7, '#f87171');
  grad.addColorStop(1, '#e11d48');
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, valueEnd);
  ctx.lineWidth = 16;
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center text
  ctx.fillStyle = color;
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(aqi, cx, cy - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('AQI', cx, cy + 10);
}

// ─── Alerts ──────────────────────────────────
const alertList = [];
function checkAlerts(data) {
  const alerts = [];
  if (data.co2 > 1000) alerts.push({ type: 'danger', icon: '🫁', msg: `CO₂ critical: ${data.co2} ppm (max 1000)` });
  else if (data.co2 > 800) alerts.push({ type: 'warn', icon: '⚠️', msg: `CO₂ elevated: ${data.co2} ppm — improve ventilation` });
  if (data.pm25 > 55) alerts.push({ type: 'danger', icon: '💨', msg: `PM2.5 unhealthy: ${data.pm25} μg/m³` });
  else if (data.pm25 > 35) alerts.push({ type: 'warn', icon: '⚠️', msg: `PM2.5 moderate: ${data.pm25} μg/m³` });
  if (data.no2 > 100) alerts.push({ type: 'warn', icon: '🏭', msg: `NO₂ elevated: ${data.no2} ppb` });
  if (data.aqi >= 151) alerts.push({ type: 'danger', icon: '🚨', msg: `AQI Unhealthy (${data.aqi}) — vulnerable groups at risk` });

  const alertDiv = document.getElementById('alert-list');
  if (!alertDiv) return;

  if (alerts.length === 0) {
    alertDiv.innerHTML = '<div class="alert-empty">✅ All readings within safe limits</div>';
    return;
  }

  alertDiv.innerHTML = alerts.slice(0, 4).map(a => `
    <div class="alert-item ${a.type}">
      <span class="alert-icon">${a.icon}</span>
      <div>
        <div class="alert-text">${a.msg}</div>
        <div class="alert-time">${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
  `).join('');
}

// ─── AI Prediction Text ──────────────────────
function updatePrediction(data) {
  const h = history;
  if (h.co2.length < 5) { setText('pred-text', 'Collecting data for analysis…'); return; }

  const trend = (arr) => arr[arr.length-1] - arr[arr.length-5] > 0 ? 'rising' : 'stable/falling';
  const co2T  = trend(h.co2);
  const pm25T = trend(h.pm25);

  let pred = '';
  if (co2T === 'rising' && pm25T === 'rising')
    pred = '⚠️ Both CO₂ and PM2.5 are trending upward. Expect AQI to worsen within 15 minutes. Consider ventilation.';
  else if (co2T === 'rising')
    pred = '📈 CO₂ rising — likely increased occupancy or reduced airflow. Recommend increasing ventilation.';
  else if (pm25T === 'rising')
    pred = '📈 PM2.5 rising — possible nearby combustion or dust activity. Monitor for outdoor sources.';
  else if (data.aqi < 50)
    pred = '✅ Air quality stable and good. All trend lines within safe bounds. No action required.';
  else
    pred = '📊 Moderate quality detected. Trends appear stable. Continue monitoring. Peak hours: 7–9 AM / 5–8 PM.';

  setText('pred-text', pred);
}

// ─── LCD Update ──────────────────────────────
function updateLCD(data) {
  const level = getAqiLevel(data.aqi);
  const pad = (s, n) => String(s).padEnd(n).substring(0, n);
  const padL = (s, n) => String(s).padStart(n).substring(0, n);
  document.getElementById('lcd-r1').textContent = 'AirSense IoT v1.0  ';
  document.getElementById('lcd-r2').textContent = `CO2: ${padL(data.co2,4)} ppm      `;
  document.getElementById('lcd-r3').textContent = `PM2.5:${padL(data.pm25,3)} NO2:${padL(data.no2,3)}ppb`;
  document.getElementById('lcd-r4').textContent = `AQI:${padL(data.aqi,3)} ${pad(level.label,10)} `;
}

// ─── Table Row ───────────────────────────────
function addTableRow(data) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  const level = getAqiLevel(data.aqi);
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${readingCount}</td>
    <td>${new Date().toLocaleTimeString()}</td>
    <td>${data.co2}</td>
    <td>${data.pm25}</td>
    <td>${data.no2}</td>
    <td>${data.o3}</td>
    <td>${data.co}</td>
    <td style="color:${level.color};font-weight:700">${data.aqi}</td>
    <td style="color:${level.color}">${level.label}</td>
  `;
  tbody.prepend(tr);
  // Keep only 20 rows
  while (tbody.children.length > 20) tbody.removeChild(tbody.lastChild);
}

// ─── Chart Helpers ───────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  animation: { duration: 400 },
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } }
  },
  scales: {
    x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
    y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
  }
};

function mkGradient(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, color + '40');
  g.addColorStop(1, color + '00');
  return g;
}

function initCharts() {
  Chart.defaults.color = '#94a3b8';

  // Live feed chart
  const liveCtx = document.getElementById('live-chart');
  if (liveCtx) {
    chartLive = new Chart(liveCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'CO₂ (ppm)', data: [], borderColor: '#4ade80', borderWidth: 2, pointRadius: 0, tension: 0.4, yAxisID: 'y' },
          { label: 'PM2.5 (μg/m³×10)', data: [], borderColor: '#fbbf24', borderWidth: 2, pointRadius: 0, tension: 0.4, yAxisID: 'y' },
          { label: 'NO₂ (ppb)', data: [], borderColor: '#f87171', borderWidth: 2, pointRadius: 0, tension: 0.4, yAxisID: 'y' }
        ]
      },
      options: { ...CHART_DEFAULTS, interaction: { mode: 'index', intersect: false } }
    });
  }

  // CO2 trend
  const co2Ctx = document.getElementById('chart-co2');
  if (co2Ctx) {
    chartCO2 = new Chart(co2Ctx, {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'CO₂ (ppm)', data: [],
        borderColor: '#4ade80', borderWidth: 2,
        backgroundColor: mkGradient(co2Ctx.getContext('2d'), '#4ade80'),
        fill: true, tension: 0.4, pointRadius: 2
      }] },
      options: { ...CHART_DEFAULTS }
    });
  }

  // PM2.5 trend
  const pm25Ctx = document.getElementById('chart-pm25');
  if (pm25Ctx) {
    chartPM25 = new Chart(pm25Ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{
        label: 'PM2.5 (μg/m³)', data: [],
        backgroundColor: '#fbbf2488', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 4
      }] },
      options: { ...CHART_DEFAULTS }
    });
  }

  // NO2 trend
  const no2Ctx = document.getElementById('chart-no2');
  if (no2Ctx) {
    chartNO2 = new Chart(no2Ctx, {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'NO₂ (ppb)', data: [],
        borderColor: '#f87171', borderWidth: 2,
        backgroundColor: mkGradient(no2Ctx.getContext('2d'), '#f87171'),
        fill: true, tension: 0.4, pointRadius: 2
      }] },
      options: { ...CHART_DEFAULTS }
    });
  }

  // AQI distribution (doughnut)
  const aqdCtx = document.getElementById('chart-aqi-dist');
  if (aqdCtx) {
    chartAQIDistrib = new Chart(aqdCtx, {
      type: 'doughnut',
      data: {
        labels: ['Good', 'Moderate', 'Unhealthy', 'Hazardous'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#4ade8066','#fbbf2466','#f8717166','#e11d4866'],
          borderColor: ['#4ade80','#fbbf24','#f87171','#e11d48'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
      }
    });
  }

  // Radar chart
  const radCtx = document.getElementById('chart-radar');
  if (radCtx) {
    chartRadar = new Chart(radCtx, {
      type: 'radar',
      data: {
        labels: ['CO₂', 'PM2.5', 'NO₂', 'O₃', 'CO', 'PM10'],
        datasets: [{
          label: 'Pollution Level (%)', data: [0,0,0,0,0,0],
          backgroundColor: 'rgba(74,222,128,0.15)',
          borderColor: '#4ade80', borderWidth: 2,
          pointBackgroundColor: '#4ade80'
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { color: '#475569', stepSize: 25, font: { size: 9 } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            pointLabels: { color: '#94a3b8', font: { size: 11 } }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function pushToChart(chart, label, ...datasets) {
  if (!chart) return;
  chart.data.labels.push(label);
  datasets.forEach((v, i) => chart.data.datasets[i].data.push(v));
  if (chart.data.labels.length > MAX_HISTORY) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(d => d.data.shift());
  }
  chart.update('none');
}

// ─── Main Update Loop ────────────────────────
function readSensors() {
  const co2  = simSensor('co2');
  const pm25 = simSensor('pm25');
  const no2  = simSensor('no2');
  const o3   = simSensor('o3');
  const co   = simSensor('co');
  const pm10 = simSensor('pm10');
  const temp = simSensor('temp');
  const hum  = simSensor('hum');
  const aqi  = calcAQI(co2, pm25, no2);

  readingCount++;
  setText('stat-readings', readingCount);

  const data = { co2, pm25, no2, o3, co, pm10, temp, hum, aqi };
  const label = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  // Push to history
  history.labels.push(label);
  history.co2.push(co2);
  history.pm25.push(pm25);
  history.no2.push(no2);
  history.o3.push(o3);
  history.co.push(co);
  history.pm10.push(pm10);
  history.aqi.push(aqi);
  Object.keys(history).forEach(k => { if (history[k].length > MAX_HISTORY) history[k].shift(); });

  // AQI distribution tracking
  const level = getAqiLevel(aqi);
  if (aqi <= 50) aqiGoodCount++;
  else if (aqi <= 100) aqiModCount++;
  else if (aqi <= 200) aqiUnhCount++;
  else aqiHazCount++;

  // Update all UI
  updateHero(aqi, temp, hum);
  updateCard('co2',  co2);
  updateCard('pm25', pm25);
  updateCard('no2',  no2);
  updateCard('o3',   o3);
  updateCard('co',   co);
  updateCard('pm10', pm10);
  checkAlerts(data);
  updatePrediction(data);
  updateLCD(data);
  addTableRow(data);

  // Charts
  pushToChart(chartLive,  label, co2, pm25 * 10, no2);
  pushToChart(chartCO2,   label, co2);
  pushToChart(chartPM25,  label, pm25);
  pushToChart(chartNO2,   label, no2);

  // AQI distribution
  if (chartAQIDistrib) {
    chartAQIDistrib.data.datasets[0].data = [aqiGoodCount, aqiModCount, aqiUnhCount, aqiHazCount];
    chartAQIDistrib.update('none');
  }

  // Radar: express each as % of its "unhealthy" threshold
  if (chartRadar) {
    const radarData = [
      Math.min(100, Math.round((co2 / 1000) * 100)),
      Math.min(100, Math.round((pm25 / 55) * 100)),
      Math.min(100, Math.round((no2 / 100) * 100)),
      Math.min(100, Math.round((o3 / 70) * 100)),
      Math.min(100, Math.round((co / 9) * 100)),
      Math.min(100, Math.round((pm10 / 154) * 100))
    ];
    chartRadar.data.datasets[0].data = radarData;
    chartRadar.update('none');
  }
}

// ─── Navigation ──────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const sectionId = `section-${tab.dataset.section}`;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById(sectionId)?.classList.add('active');
      tab.classList.add('active');
    });
  });
}

// ─── CSV Export ──────────────────────────────
function exportCSV() {
  const rows = [['Timestamp','CO2 (ppm)','PM2.5 (ug/m3)','NO2 (ppb)','AQI']];
  const n = history.labels.length;
  for (let i = 0; i < n; i++) {
    rows.push([history.labels[i], history.co2[i], history.pm25[i], history.no2[i], history.aqi[i]]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `airsense_data_${Date.now()}.csv`;
  a.click();
  showToast('📥 CSV exported successfully!');
}

// ─── Code Copy ───────────────────────────────
function copyCode() {
  const code = document.querySelector('#code-snippet code')?.textContent;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => showToast('📋 Code copied to clipboard!'));
}

// ─── Toast ───────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initCharts();
  readSensors();                    // First tick
  setInterval(readSensors, 5000);   // Every 5 seconds
});
