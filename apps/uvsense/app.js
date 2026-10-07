{ // UV Sense v0.04: no network requests; reads UV pushed by Gadgetbridge weather (weather.json)
  const S = require("Storage"), F = "uvsense.json";
  const lvl = u => u >= 11 ? 4 : u >= 8 ? 3 : u >= 6 ? 2 : u >= 3 ? 1 : 0;
  const col = u => u >= 8 ? "#f00" : u >= 6 ? "#f80" : u >= 3 ? "#ff0" : "#0f0";
  let tmr;

  const read = () => {
    const w = (S.readJSON("weather.json", 1) || {}).weather;
    if (!w || w.uv === undefined) return null;
    const d = new Date(), day = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
    let st = S.readJSON(F, 1) || {};
    if (st.day !== day) st = { day: day, hours: [] };
    for (let i = 0; i < 24; i++) if (st.hours[i] === undefined) st.hours[i] = 0;
    const h = d.getHours(), old = st.cur;
    st.cur = w.uv; st.t = w.time || Date.now();
    st.hours[h] = Math.max(st.hours[h], w.uv);
    S.writeJSON(F, st);
    if (old !== undefined && lvl(old) !== lvl(w.uv)) Bangle.buzz(150 + lvl(w.uv) * 150);
    return st;
  };

  const draw = () => {
    const st = read(), R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0).setFont("6x8");
    if (!st) { g.drawString("No UV data from phone.\nNeed: Weather app +\nweather provider in\nGadgetbridge", cx, R.y + R.h / 2); return; }
    g.drawString("UV index", cx, R.y + 8);
    g.setColor(col(st.cur)).setFont("Vector", 48).drawString((+st.cur).toFixed(1), cx, R.y + 40);
    const max = Math.max.apply(null, st.hours);
    g.setColor(g.theme.fg).setFont("6x8").drawString("today max " + max.toFixed(1) + "  upd " + require("locale").time(new Date(st.t), 1), cx, R.y + 72);
    const gx = R.x + 6, gw = R.w - 12, gy = R.y2 - 14, gh = R.y2 - R.y - 100, bw = gw / 24, m = Math.max(max, 3);
    st.hours.forEach((u, i) => { if (u > 0) g.setColor(col(u)).fillRect(gx + i * bw, gy - u / m * gh, gx + (i + 1) * bw - 1, gy); });
    g.setColor(g.theme.fg).drawLine(gx, gy, gx + gw, gy).setFontAlign(0, -1);
    [0, 6, 12, 18].forEach(h => g.drawString(h, gx + h * bw, gy + 2));
    const h = new Date().getHours(); g.setColor("#00f").drawLine(gx + (h + .5) * bw, gy - gh, gx + (h + .5) * bw, gy);
  };

  Bangle.setUI({ mode: "custom", back: () => load(), touch: draw, remove: () => clearInterval(tmr) });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
  tmr = setInterval(draw, 60000);
}
