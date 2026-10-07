{ // UV Sense v0.03: foreground only, hard timeout, one request at a time
  const S = require("Storage"), F = "uvsense.json";
  const URL = "https://api.open-meteo.com/v1/forecast?latitude=50.28&longitude=57.21&hourly=uv_index&timezone=auto&forecast_days=1";
  const lvl = u => u >= 11 ? 4 : u >= 8 ? 3 : u >= 6 ? 2 : u >= 3 ? 1 : 0;
  const col = u => u >= 8 ? "#f00" : u >= 6 ? "#f80" : u >= 3 ? "#ff0" : "#0f0";
  let msg = "", busy = false, tmr;

  const draw = () => {
    const st = S.readJSON(F, 1), R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0).setFont("6x8");
    if (!Bangle.http) { g.drawString("Needs Bangle.js Gadgetbridge\n+ Android Integration", cx, R.y + R.h / 2); return; }
    if (!st) { g.drawString(msg || "No data yet\ntap to refresh", cx, R.y + R.h / 2); return; }
    g.drawString("UV index  Aktobe", cx, R.y + 8);
    g.setColor(col(st.cur)).setFont("Vector", 48).drawString(st.cur.toFixed(1), cx, R.y + 40);
    g.setColor(g.theme.fg).setFont("6x8").drawString("max " + st.max.toFixed(1) + "  upd " + require("locale").time(new Date(st.t), 1), cx, R.y + 70);
    if (msg) g.drawString(msg, cx, R.y + 82);
    const gx = R.x + 6, gw = R.w - 12, gy = R.y2 - 14, gh = R.y2 - R.y - 100, bw = gw / 24, m = Math.max(st.max, 3);
    st.hours.forEach((u, i) => { if (u > 0) g.setColor(col(u)).fillRect(gx + i * bw, gy - u / m * gh, gx + (i + 1) * bw - 1, gy); });
    g.setColor(g.theme.fg).drawLine(gx, gy, gx + gw, gy).setFontAlign(0, -1);
    [0, 6, 12, 18].forEach(h => g.drawString(h, gx + h * bw, gy + 2));
    const h = new Date().getHours(); g.setColor("#00f").drawLine(gx + (h + .5) * bw, gy - gh, gx + (h + .5) * bw, gy);
  };

  const fetchUV = () => {
    if (busy || !Bangle.http) return;
    if (!NRF.getSecurityStatus().connected) { msg = "phone not connected"; draw(); return; }
    busy = true; msg = "updating..."; draw();
    let done = false;
    const wd = setTimeout(() => { if (!done) { done = true; busy = false; msg = "no answer (20s)"; draw(); } }, 20000);
    Bangle.http(URL, { timeout: 15000 }).then(d => {
      if (done) return;
      const j = JSON.parse(d.resp), arr = j.hourly.uv_index.map(v => v || 0), cur = arr[new Date().getHours()];
      const old = S.readJSON(F, 1) || {};
      S.writeJSON(F, { t: Date.now(), cur: cur, max: Math.max.apply(null, arr), hours: arr });
      const L = lvl(cur), OL = old.cur === undefined ? -1 : lvl(old.cur);
      if (L !== OL) Bangle.buzz(150 + L * 150);   // longer buzz = higher level
      msg = "";
    }).catch(e => { if (!done) msg = "error: " + e; }).then(() => { if (done) return; done = true; clearTimeout(wd); busy = false; draw(); });
  };

  const btn = setWatch(() => load(), BTN1, { edge: "falling", repeat: true });
  Bangle.setUI({ mode: "custom", touch: fetchUV, remove: () => { clearInterval(tmr); clearWatch(btn); } });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
  setTimeout(fetchUV, 500);
  tmr = setInterval(fetchUV, 30 * 60000);
}
