{ // Tremor Analyzer: 100 Hz accelerometer capture + FFT -> peak frequency and amplitude
  const N = 1024;                // samples (~10.2 s at 100 Hz)
  const BAND = [3, 15];          // tremor band, Hz
  const S = require("Storage");
  let ax, ay, az, n = 0, t0 = 0, t1 = 0, state = "idle", mode = "", res, spec, cd;

  const fastAccel = () => {
    Bangle.setOptions({ powerSave: false });
    Bangle.accelWr(0x18, 0b01101100);      // standby, +-4g (keeps default scaling)
    Bangle.accelWr(0x1B, 0x03 | 0x40);     // 100 Hz output data rate
    Bangle.accelWr(0x18, 0b11101100);      // operate, +-4g
    Bangle.setPollInterval(10);            // poll at 100 Hz
  };
  const normalAccel = () => {
    Bangle.setPollInterval(80);
    Bangle.accelWr(0x18, 0b01101100);
    Bangle.accelWr(0x1B, 0x00);            // default 12.5 Hz
    Bangle.accelWr(0x18, 0b11101100);
    Bangle.setOptions({ powerSave: true });
  };

  const onAccel = a => {
    if (n >= N) return;
    if (!n) t0 = getTime();
    ax[n] = a.x; ay[n] = a.y; az[n] = a.z; n++;
    if (n == N) {
      t1 = getTime();
      Bangle.removeListener("accel", onAccel);
      normalAccel();
      Bangle.buzz(200);
      state = "saving"; draw();
      setTimeout(analyse, 50);
    }
  };

  const saveRaw = () => { // raw capture of the last measurement, overwritten each time
    S.erase("tremor.raw.csv");
    const f = S.open("tremor.raw.csv", "w");
    f.write("i,x,y,z\n");
    let chunk = "";
    for (let i = 0; i < N; i++) {
      chunk += i + "," + ax[i].toFixed(4) + "," + ay[i].toFixed(4) + "," + az[i].toFixed(4) + "\n";
      if ((i & 63) == 63) { f.write(chunk); chunk = ""; }
    }
    if (chunk) f.write(chunk);
  };

  const analyse = () => {
    const fs = (N - 1) / (t1 - t0), df = fs / N;
    saveRaw();
    spec = new Float32Array(N / 2);
    [ax, ay, az].forEach(a => {
      let m = 0;
      for (let i = 0; i < N; i++) m += a[i];
      m /= N;
      for (let i = 0; i < N; i++) a[i] = (a[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); // remove gravity + Hann window
      E.FFT(a); // single array -> magnitude written back
      for (let k = 0; k < N / 2; k++) spec[k] += a[k] * a[k];
    });
    const k0 = Math.ceil(BAND[0] / df), k1 = Math.floor(BAND[1] / df);
    let kp = k0, sum = 0;
    for (let k = k0; k <= k1; k++) { sum += spec[k]; if (spec[k] > spec[kp]) kp = k; }
    // parabolic interpolation of the peak
    const a = spec[kp - 1], b = spec[kp], c = spec[kp + 1];
    const off = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
    const f = (kp + off) * df;
    const rmsG = Math.sqrt(2 * sum / (N * N * 0.375));        // band RMS acceleration, g (Hann power correction)
    const dispMm = rmsG * 9.81 / Math.pow(2 * Math.PI * f, 2) * 1000; // equivalent RMS displacement at peak freq
    res = { fs: fs, f: f, mg: rmsG * 1000, mm: dispMm, df: df };
    const d = new Date();
    S.open("tremor.csv", "a").write(d.toISOString() + "," + mode + "," + fs.toFixed(1) + "," + f.toFixed(2) + "," + res.mg.toFixed(2) + "," + dispMm.toFixed(3) + "\n");
    ax = ay = az = undefined;
    state = "result"; draw();
  };

  const start = m => {
    mode = m; state = "count"; let c = 3; draw(c);
    cd = setInterval(() => {
      c--;
      if (c > 0) { draw(c); return; }
      clearInterval(cd);
      ax = new Float32Array(N); ay = new Float32Array(N); az = new Float32Array(N); n = 0;
      state = "rec"; Bangle.buzz(80);
      fastAccel();
      Bangle.on("accel", onAccel);
      draw();
    }, 1000);
  };

  const draw = (c) => {
    const R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0);
    if (state == "idle") {
      g.setColor("#00f").fillRect(R.x + 4, R.y + 4, R.x2 - 4, R.y + R.h / 2 - 2);
      g.setColor("#0a0").fillRect(R.x + 4, R.y + R.h / 2 + 2, R.x2 - 4, R.y2 - 4);
      g.setColor("#fff").setFont("Vector", 20);
      g.drawString("POSTURAL", cx, R.y + R.h / 4 - 6).setFont("6x8").drawString("arm outstretched", cx, R.y + R.h / 4 + 14);
      g.setFont("Vector", 20).drawString("REST", cx, R.y + 3 * R.h / 4 - 6).setFont("6x8").drawString("hand relaxed on knee", cx, R.y + 3 * R.h / 4 + 14);
    } else if (state == "count") {
      g.setFont("Vector", 60).drawString(c, cx, R.y + R.h / 2 - 10);
      g.setFont("6x8").drawString(mode + ": hold still", cx, R.y2 - 20);
    } else if (state == "rec" || state == "saving") {
      g.setFont("Vector", 22).drawString(state == "rec" ? "Recording" : "Analysing", cx, R.y + 40);
      g.drawRect(R.x + 10, R.y + 80, R.x2 - 10, R.y + 96);
      g.fillRect(R.x + 10, R.y + 80, R.x + 10 + (R.w - 20) * n / N, R.y + 96);
      g.setFont("6x8").drawString(mode, cx, R.y + 112);
    } else if (state == "result") {
      g.setFont("6x8").drawString(mode + "  fs " + res.fs.toFixed(0) + " Hz" + (res.fs < 80 ? " LOW!" : ""), cx, R.y + 6);
      g.setFont("Vector", 30).drawString(res.f.toFixed(1) + " Hz", cx, R.y + 30);
      g.setFont("6x8").drawString(res.mg.toFixed(1) + " mg RMS   " + res.mm.toFixed(2) + " mm", cx, R.y + 54);
      // spectrum 1..20 Hz
      const x0 = R.x + 6, x1 = R.x2 - 6, yb = R.y2 - 14, h = R.y2 - R.y - 90;
      const k1 = Math.floor(20 / res.df), k0 = Math.ceil(1 / res.df);
      let mx = 0; for (let k = k0; k <= k1; k++) if (spec[k] > mx) mx = spec[k];
      const X = fr => x0 + (fr - 1) / 19 * (x1 - x0);
      g.setColor("#ff0").fillRect(X(BAND[0]), yb - h, X(BAND[1]), yb - h + 2);
      g.setColor(g.theme.fg);
      for (let k = k0; k <= k1; k++) { const x = X(k * res.df); g.drawLine(x, yb, x, yb - Math.sqrt(spec[k] / mx) * h); }
      g.setColor("#f00").drawLine(X(res.f), yb - h, X(res.f), yb);
      g.setColor(g.theme.fg).setFont("4x6").setFontAlign(0, -1);
      [1, 5, 10, 15, 20].forEach(fr => g.drawString(fr, X(fr), yb + 3));
    }
  };

  Bangle.setUI({
    mode: "custom",
    touch: (btn, xy) => {
      if (state == "idle") start(xy.y < Bangle.appRect.y + Bangle.appRect.h / 2 ? "POSTURAL" : "REST");
      else if (state == "result") { state = "idle"; spec = undefined; draw(); }
    },
    back: () => load(),
    remove: () => { if (cd) clearInterval(cd); Bangle.removeListener("accel", onAccel); if (state == "rec") normalAccel(); }
  });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
}
