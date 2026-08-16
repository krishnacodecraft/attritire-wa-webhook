// Solar Energy Forecast API — deployable as a Vercel serverless function
// Usage:
//   GET /api/solar?lat=19.07&lon=72.88&kw=5
//   GET /api/solar?city=Mumbai&kw=5&angle=19
// Returns clean JSON for your webapp frontend.

const https = require('https');
const http = require('http');

// ---- Helpers ----
function getJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'solar-api/1.0' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Bad JSON: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout')));
  });
}

// City -> lat/lon (Open-Meteo free geocoding)
async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
  const d = await getJson(url);
  if (!d.results || !d.results.length) throw new Error('City not found');
  const r = d.results[0];
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country || ''}` };
}

// PVGIS solar calc
async function solar(lat, lon, kw, angle, loss) {
  const params = new URLSearchParams({
    lat: String(lat), lon: String(lon),
    peakpower: String(kw), loss: String(loss),
    aspect: '0', outputformat: 'json',
    usehorizon: '1', raddatabase: 'PVGIS-ERA5',
  });
  if (angle != null) params.set('angle', String(angle));
  else params.set('optimalangles', '1');

  return getJson('https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?' + params.toString());
}

// ---- Request handler (works in Vercel + Express) ----
module.exports = async function handler(req, res) {
  // CORS for your webapp
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const q = req.query || {};
    const kw = parseFloat(q.kw || '5');
    const loss = parseFloat(q.loss || '14');
    const angle = q.angle ? parseFloat(q.angle) : null;

    let lat = parseFloat(q.lat), lon = parseFloat(q.lon), loc = '';
    if (q.city) { ({ lat, lon, name: loc } = await geocode(q.city)); }
    else if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Provide ?city= or ?lat=&lon=' });
    }

    const d = await solar(lat, lon, kw, angle, loss);
    const t = d.outputs.totals.fixed;
    const monthly = d.outputs.monthly.fixed;

    res.status(200).json({
      location: loc || `${lat}, ${lon}`,
      lat, lon,
      system_kw: kw,
      tilt_deg: d.inputs.mounting_system.fixed.slope.value,
      losses_pct: loss,
      forecast: {
        daily_kwh: round(t.E_d),
        monthly_kwh: round(t.E_m),
        yearly_kwh: round(t.E_y),
        irradiance_kwh_m2_yr: round(t['H(i)_y']),
        yearly_variance_kwh: round(t.SD_y),
      },
      monthly: monthly.map((m) => ({
        month: m.month, kwh: round(m.E_m), kwh_per_day: round(m.E_d, 2),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function round(n, p = 1) { const f = Math.pow(10, p); return Math.round(n * f) / f; }
