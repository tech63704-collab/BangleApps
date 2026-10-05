{ // Mag Sense: magnetic anomaly detector with haptic feedback (sensory augmentation channel)
  const S = require("Storage"), CFG = "magsense.json";
  const EARTH_UT = 55;           // approx. local geomagnetic total intensity (Aktobe ~55 uT), used only for a rough uT scale
  let cfg = Object.assign({ off: null, base: 0, thr: 10, mode: "GEIGER" }, S.readJSON(CFG, 1) || {});
  let state = cfg.off ? "run" : "calib";
  let cal = null, cur = 0, ema = 0, hist = [], above = false, lastEvt = 0, gTmr, dTmr;

  const save = () => S.writeJSON(CFG, cfg);
  const mag3 = (m, o) => Math.sqrt(Math.pow(m.x - o[0], 2) + Math.pow(m.y - o[1], 2) + Math.pow(m.z - o[2], 2));
  const dev = () => cfg.base ? (ema - cfg.base) / cfg.base * 100 : 0; // % of Earth field

  const startCalib = () => {
    state = "calib";
    cal = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9], t: Date.now() };
    Bangle.buzz(100);
  };

  const onMag = m => {
    if (state == "calib") {
      if (!cal) startCalib();
      ["x", "y", "z"].forEach((k, i) => { cal.mn[i] = Math.min(cal.mn[i], m[k]); cal.mx[i] = Math.max(cal.mx[i], m[k]); });
      if (Date.now() - cal.t > 15000) {
        // hard-iron offset = centre of the min/max box; base = mean radius
        cfg.off = [0, 1, 2].map(i => (cal.mx[i] + cal.mn[i]) / 2);
        cfg.base = [0, 1, 2].reduce((s, i) => s + (cal.mx[i] - cal.mn[i]) / 2, 0) / 3;
        save(); cal = null; ema = cfg.base; state = "run";
        Bangle.buzz(80).then(() => setTimeout(() => Bangle.buzz(80), 120));
      }
      return;
    }
    cur = mag3(m, cfg.off);
    ema = ema ? ema * 0.7 + cur * 0.3 : cur;
    // event mode: double tick on rising edge, hysteresis 70 %, refractory 3 s
    const d = Math.abs(dev());
    if (cfg.mode == "EVENT") {
      if (!above && d > cfg.thr && Date.now() - lastEvt > 3000) {
        above = true; lastEvt = Date.now();
        Bangle.buzz(50).then(() => setTimeout(() => Bangle.buzz(50), 120));
      } else if (above && d < cfg.thr * 0.7) above = false;
    }
  };

  // geiger mode: click rate grows with the excess over threshold
  const geiger = () => {
    let next = 200;
    if (state == "run" && cfg.mode == "GEIGER") {
      const ex = Math.abs(dev()) - cfg.thr;
      // 40 ms pulse: long enough for the vibration motor to spin up; log scale keeps huge fields distinguishable
      if (ex > 0) { Bangle.buzz(40); next = Math.max(140, 900 / (1 + Math.log(1 + ex / cfg.thr))); }
    }
    gTmr = setTimeout(geiger, next);
  };

  const draw = () => {
    const R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0);
    if (state == "calib") {
      const left = cal ? Math.max(0, 15 - Math.round((Date.now() - cal.t) / 1000)) : 15;
      g.setFont("Vector", 20).drawString("CALIBRATION", cx, R.y + 30);
      g.setFont("6x8").drawString("Rotate the watch slowly", cx, R.y + 60).drawString("in a figure-8, all directions", cx, R.y + 72);
      g.drawString("away from metal and magnets", cx, R.y + 84);
      g.setFont("Vector", 40).drawString(left, cx, R.y + 120);
      return;
    }
    const d = dev(), ad = Math.abs(d), hot = ad > cfg.thr;
    g.setFont("6x8").drawString(cfg.mode + "   thr " + cfg.thr + "%", cx, R.y + 6);
    g.setColor(hot ? "#f00" : g.theme.fg).setFont("Vector", 40).drawString((d >= 0 ? "+" : "") + d.toFixed(0) + "%", cx, R.y + 36);
    g.setColor(g.theme.fg).setFont("6x8").drawString("~" + (d / 100 * EARTH_UT).toFixed(1) + " uT vs Earth field", cx, R.y + 62);
    // 10 s history graph, threshold lines
    const gx = R.x + 6, gw = R.w - 12, gy = R.y + 76, gh = R.y2 - gy - 6, mid = gy + gh / 2;
    const sc = gh / 2 / Math.max(cfg.thr * 2, 20);
    g.setColor("#888").drawRect(gx, gy, gx + gw, gy + gh).drawLine(gx, mid, gx + gw, mid);
    g.setColor("#ff0").drawLine(gx, mid - cfg.thr * sc, gx + gw, mid - cfg.thr * sc).drawLine(gx, mid + cfg.thr * sc, gx + gw, mid + cfg.thr * sc);
    g.setColor("#f00");
    for (let i = 1; i < hist.length; i++)
      g.drawLine(gx + (i - 1) * gw / 49, E.clip(mid - hist[i - 1] * sc, gy, gy + gh), gx + i * gw / 49, E.clip(mid - hist[i] * sc, gy, gy + gh));
  };

  dTmr = setInterval(() => {
    if (state == "run") { hist.push(dev()); if (hist.length > 50) hist.shift(); }
    draw();
  }, 200);

  Bangle.setUI({
    mode: "custom",
    touch: () => { if (state == "run") { cfg.mode = cfg.mode == "GEIGER" ? "EVENT" : "GEIGER"; save(); Bangle.buzz(40); draw(); } },
    swipe: (lr, ud) => {
      if (state != "run") return;
      if (lr) { cfg.thr = E.clip(cfg.thr + lr * 5, 5, 100); save(); draw(); }
      else if (ud > 0) startCalib(); // swipe down = recalibrate
    },
    back: () => load(),
    remove: () => { clearTimeout(gTmr); clearInterval(dTmr); Bangle.removeListener("mag", onMag); Bangle.setCompassPower(0, "magsense"); }
  });

  Bangle.setCompassPower(1, "magsense");
  Bangle.on("mag", onMag);
  if (state == "calib") startCalib();
  Bangle.loadWidgets(); Bangle.drawWidgets();
  geiger(); draw();
}
