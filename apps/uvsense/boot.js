// UV Sense background: fetch UV index (Open-Meteo, Aktobe) via Gadgetbridge every 30 min, buzz on level change
(function () {
  if (!Bangle.http) return; // needs Bangle.js Gadgetbridge with internet access
  const S = require("Storage"), F = "uvsense.json";
  const URL = "https://api.open-meteo.com/v1/forecast?latitude=50.28&longitude=57.21&hourly=uv_index&timezone=auto&forecast_days=1";
  const lvl = u => u >= 11 ? 4 : u >= 8 ? 3 : u >= 6 ? 2 : u >= 3 ? 1 : 0;
  global.uvsenseFetch = function (cb) {
    Bangle.http(URL).then(d => {
      const j = JSON.parse(d.resp), h = new Date().getHours();
      const arr = j.hourly.uv_index.map(v => v || 0);
      const cur = arr[h], old = S.readJSON(F, 1) || {};
      const st = { t: Date.now(), cur: cur, max: Math.max.apply(null, arr), hours: arr };
      S.writeJSON(F, st);
      const L = lvl(cur), OL = old.cur === undefined ? 0 : lvl(old.cur);
      if (L > OL) { // rising: L long pulses
        let i = 0; const p = () => { if (i++ < L) Bangle.buzz(300).then(() => setTimeout(p, 250)); }; p();
      } else if (L < OL) Bangle.buzz(80); // falling: one short tick
      if (cb) cb(st);
    }).catch(e => { if (cb) cb(null, e); });
  };
  setTimeout(global.uvsenseFetch, 15000);
  setInterval(global.uvsenseFetch, 30 * 60000);
})();
