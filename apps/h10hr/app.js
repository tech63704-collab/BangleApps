{ // H10 Broadcast HR: reads heart rate from Polar H10 advertising packets (no connection, no pairing)
  const ID = "24:ac:ac:13:23:7a public"; // your H10 address
  let hr = 0, last = 0, mn = 999, mx = 0, hist = [], tmr;

  const draw = () => {
    const R = Bangle.appRect, age = last ? Math.round((Date.now() - last) / 1000) : -1;
    g.reset().clearRect(R);
    g.setFontAlign(0, 0).setFont("Vector", 56);
    g.setColor(age >= 0 && age < 10 ? "#f00" : "#888");
    g.drawString(age >= 0 && age < 10 ? hr : "--", R.x + R.w / 2, R.y + 40);
    g.setColor(g.theme.fg).setFont("6x8").drawString(age < 0 ? "searching H10..." : "H10  " + age + "s ago", R.x + R.w / 2, R.y + 78);
    if (mx) g.drawString("min " + mn + "  max " + mx, R.x + R.w / 2, R.y + 90);
    // last 2 minutes graph
    const gx = R.x + 4, gy = R.y2 - 4, gh = 50, gw = R.w - 8;
    g.setColor("#888").drawRect(gx, gy - gh, gx + gw, gy);
    if (hist.length > 1) {
      const lo = Math.min.apply(null, hist) - 5, hi = Math.max.apply(null, hist) + 5;
      g.setColor("#f00");
      for (let i = 1; i < hist.length; i++) {
        const x1 = gx + (i - 1) * gw / 119, x2 = gx + i * gw / 119;
        const y1 = gy - (hist[i-1] - lo) / (hi - lo) * gh, y2 = gy - (hist[i] - lo) / (hi - lo) * gh;
        g.drawLine(x1, y1, x2, y2);
      }
    }
  };

  NRF.setScan(d => {
    if (d.id != ID || d.manufacturer != 107 || !d.manufacturerData) return;
    const m = new Uint8Array(d.manufacturerData);
    const v = m[m.length - 1];
    if (v < 30 || v > 230) return;
    hr = v; last = Date.now();
    if (v < mn) mn = v; if (v > mx) mx = v;
  });

  // one sample per second into the graph + redraw
  tmr = setInterval(() => {
    if (last && Date.now() - last < 10000) { hist.push(hr); if (hist.length > 120) hist.shift(); }
    draw();
  }, 1000);

  Bangle.setUI({ mode: "custom", back: () => load(), remove: () => { NRF.setScan(); clearInterval(tmr); } });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
}
