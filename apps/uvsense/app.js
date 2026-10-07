{ // UV Sense viewer
  const S = require("Storage");
  let msg = "";
  const col = u => u >= 8 ? "#f00" : u >= 6 ? "#f80" : u >= 3 ? "#ff0" : "#0f0";
  const draw = () => {
    const st = S.readJSON("uvsense.json", 1), R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0);
    if (!Bangle.http) { g.setFont("6x8").drawString("Needs Bangle.js Gadgetbridge\nwith Internet Access", cx, R.y + R.h / 2); return; }
    if (!st) { g.setFont("6x8").drawString(msg || "No data yet\ntap to refresh", cx, R.y + R.h / 2); return; }
    g.setFont("6x8").drawString("UV index  Aktobe", cx, R.y + 8);
    g.setColor(col(st.cur)).setFont("Vector", 48).drawString(st.cur.toFixed(1), cx, R.y + 40);
    g.setColor(g.theme.fg).setFont("6x8").drawString("today max " + st.max.toFixed(1) + "   " + require("locale").time(new Date(st.t), 1), cx, R.y + 70);
    const gx = R.x + 6, gw = R.w - 12, gy = R.y2 - 14, gh = R.y2 - R.y - 100, bw = gw / 24, m = Math.max(st.max, 3);
    st.hours.forEach((u, i) => { if (u > 0) g.setColor(col(u)).fillRect(gx + i * bw, gy - u / m * gh, gx + (i + 1) * bw - 1, gy); });
    g.setColor(g.theme.fg).drawLine(gx, gy, gx + gw, gy).setFontAlign(0, -1);
    [0, 6, 12, 18].forEach(h => g.drawString(h, gx + h * bw, gy + 2));
    const h = new Date().getHours(); g.setColor("#00f").drawLine(gx + (h + .5) * bw, gy - gh, gx + (h + .5) * bw, gy);
    if (msg) g.setColor(g.theme.fg).setFontAlign(0, 0).drawString(msg, cx, R.y + 82);
  };
  const refresh = () => {
    if (!global.uvsenseFetch) { msg = "restart watch once"; draw(); return; }
    msg = "updating..."; draw();
    global.uvsenseFetch((st, e) => { msg = st ? "" : "error: " + e; draw(); });
  };
  Bangle.setUI({ mode: "custom", touch: refresh, back: () => load() });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
}
