{ // HUD Clock — original HUD/sci-fi style clock for Bangle.js 2
  const W = g.getWidth(), H = g.getHeight();
  const ACC = "#f00";  // accent for lines and text (pure red, crisp on the 3-bit display)
  const FILL = "#f80"; // orange for solid shapes (dithered red+yellow reads as orange)
  const WHITE = "#fff";
  let drawTimeout;

  // Angular stroke font on a 4x6 grid. Each digit = list of polylines.
  const GLYPHS = {
    0: [[[0,1],[1,0],[4,0],[4,5],[3,6],[0,6],[0,1]]],
    1: [[[0.6,1.6],[2.2,0],[2.2,6]]],
    2: [[[0,0],[4,0],[4,2],[0,6],[4,6]]],
    3: [[[0,0],[4,0],[1.8,2.8],[4,2.8],[4,6],[0,6]]],
    4: [[[3,6],[3,0],[0,4],[4,4]]],
    5: [[[4,0],[0,0],[0,2.8],[3,2.8],[4,3.8],[4,6],[0,6]]],
    6: [[[3.4,0],[1,0],[0,1],[0,6],[4,6],[4,3],[0,3]]],
    7: [[[0,1.4],[0,0],[4,0],[1.4,6]]],
    8: [[[0,0],[4,0],[4,6],[0,6],[0,0]],[[0,3],[4,3]]],
    9: [[[4,3],[0,3],[0,0],[4,0],[4,5],[3,6],[0.6,6]]]
  };

  // Draw one digit inside box (x,y,w,h) with stroke thickness t
  const drawDigit = (d, x, y, w, h, t) => {
    const sx = (w - t) / 4, sy = (h - t) / 6, o = t / 2;
    GLYPHS[d].forEach(path => {
      for (let i = 0; i < path.length; i++) {
        const ax = x + o + path[i][0] * sx, ay = y + o + path[i][1] * sy;
        if (t > 2) g.fillRect(ax - o, ay - o, ax + o - 1, ay + o - 1); // square joint
        if (i == 0) continue;
        const bx = x + o + path[i-1][0] * sx, by = y + o + path[i-1][1] * sy;
        if (t <= 2) { g.drawLine(bx, by, ax, ay); if (t == 2) g.drawLine(bx + 1, by, ax + 1, ay); continue; }
        let dx = ax - bx, dy = ay - by;
        const l = Math.sqrt(dx*dx + dy*dy) || 1;
        dx = dx / l * o; dy = dy / l * o;
        g.fillPoly([bx - dy, by + dx, ax - dy, ay + dx, ax + dy, ay - dx, bx + dy, by - dx]);
      }
    });
  };

  // Faint dotted grid line (simulates a dim grey line on the 8-colour screen)
  const dotH = (y) => { for (let x = 0; x < W; x += 3) g.setPixel(x, y); };
  const dotV = (x, y1, y2) => { for (let y = y1; y < y2; y += 3) g.setPixel(x, y); };

  // Optional personal font: digit bitmaps uploaded separately as hudclk.font.json
  const FNT = (() => {
    const f = require("Storage").readJSON("hudclk.font.json", 1);
    if (!f) return undefined;
    const mk = s => ({ c: s.c, h: s.h, img: s.d.map((b, i) => ({ width: s.w[i], height: s.h, bpp: 1, transparent: 0, buffer: E.toArrayBuffer(atob(b)) })) });
    return { b: mk(f.b), s: mk(f.s) };
  })();
  // draw a number with a fixed cell per digit; falls back to the built-in angular font
  const drawNum = (str, x, y, big) => {
    const F = FNT && (big ? FNT.b : FNT.s);
    for (let i = 0; i < str.length; i++) {
      const n = +str[i];
      if (F) {
        const im = F.img[n];
        g.drawImage(im, x + i * (F.c + 2) + ((F.c - im.width) >> 1), y);
      } else if (big) drawDigit(n, x + i * 62 + 10, y - 2, 40, 36, 6);
      else drawDigit(n, x + i * 30 + 6, y - 4, 16, 22, 2);
    }
  };

  const draw = () => {
    const d = new Date();
    const hh = d.getHours(), mm = d.getMinutes();
    const pad = n => (n < 10 ? "0" : "") + n;
    const bat = E.getBattery();
    let steps = 0, bpm = 0, goal = 10000;
    try { steps = Bangle.getHealthStatus("day").steps; } catch (e) {}
    try { bpm = Bangle.getHealthStatus("last").bpm; } catch (e) {}
    const hs = require("Storage").readJSON("health.json", 1) || {};
    if (hs.stepGoal) goal = hs.stepGoal;
    const conn = NRF.getSecurityStatus().connected;

    g.reset().setBgColor(0).clearRect(0, 0, W - 1, H - 1);

    // grid
    g.setColor(WHITE);
    dotH(86); dotH(128);
    dotV(132, 0, 86); dotV(88, 128, 176);

    // big time: hours over minutes
    g.setColor(WHITE);
    drawNum(pad(hh), 4, 8, true);
    drawNum(pad(mm), 4, 48, true);
    g.setColor(FILL).fillRect(0, 48, 1, 79);

    // right column: battery, heart rate, link + charge orb
    g.setFont("4x6").setFontAlign(-1, -1);
    g.setColor(ACC).drawString("BAT", 136, 6);
    g.setColor(WHITE).setFont("6x8").drawString(bat + "%", 136, 13);
    g.setColor(ACC).setFont("4x6").drawString("HR", 136, 28);
    g.setColor(WHITE).setFont("6x8").drawString(bpm ? bpm : "--", 136, 35);
    g.setColor(ACC).setFont("4x6").drawString("LNK", 136, 50);
    g.drawCircle(142, 66, 6);
    if (!conn) g.drawLine(137, 71, 147, 61);
    g.setColor(FILL).fillCircle(162, 66, Bangle.isCharging() ? 9 : 6);

    // date row
    const day = d.getDate();
    g.setColor(ACC);
    drawNum(pad(day), 4, 94, false);
    const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
    g.setFont("4x6").setFontAlign(-1, -1);
    g.drawString(DOW[d.getDay()] + " " + MON[d.getMonth()], 6, 114);
    g.setColor(WHITE).drawString("" + d.getFullYear(), 42, 114);

    // orbit: dot position follows minutes
    g.setColor(ACC).drawEllipse(78, 99, 170, 115);
    const a = mm / 60 * 2 * Math.PI - Math.PI / 2;
    const ox = 124 + 46 * Math.cos(a), oy = 107 + 8 * Math.sin(a);
    g.setBgColor(0).clearRect(ox - 5, oy - 5, ox + 5, oy + 5);
    g.drawCircle(ox, oy, 4).fillCircle(ox, oy, 2);

    // steps ring
    const p = Math.min(steps / goal, 1);
    g.setColor(ACC).drawCircle(30, 152, 20);
    g.setColor(WHITE);
    for (let i = 0; i <= 60 * p; i++) {
      const ang = i / 60 * 2 * Math.PI - Math.PI / 2;
      g.fillCircle(30 + 15 * Math.cos(ang), 152 + 15 * Math.sin(ang), 1);
    }
    g.setColor(ACC);
    if (p >= 1) g.drawLine(16, 166, 44, 138);
    g.setFont("4x6").setFontAlign(-1, -1).drawString("STEPS", 94, 134);
    g.setColor(WHITE).setFont("6x8:2").drawString("" + steps, 94, 142);
    g.setColor(ACC).setFont("4x6").drawString("GOAL " + goal, 94, 160);
    for (let i = 0; i < 4; i++) g.drawLine(56 + i * 7, 172, 61 + i * 7, 165);
    g.setFontAlign(1, -1).drawString("SYS-01", 172, 134);

    // schedule next redraw at the top of the next minute
    if (drawTimeout) clearTimeout(drawTimeout);
    drawTimeout = setTimeout(() => { drawTimeout = undefined; draw(); }, 60000 - (Date.now() % 60000));
  };

  const onLock = locked => { if (!locked) draw(); };
  Bangle.on("lock", onLock);

  Bangle.setUI({
    mode: "clock",
    remove: () => {
      if (drawTimeout) clearTimeout(drawTimeout);
      drawTimeout = undefined;
      Bangle.removeListener("lock", onLock);
      require("widget_utils").show();
    }
  });

  Bangle.loadWidgets();
  require("widget_utils").swipeOn(); // widgets hidden, swipe down to see them
  draw();
}
