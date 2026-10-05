{ // Daily kcal: BMR by clock + activity from steps and heart rate (Health records), no double counting
  // ---- personal settings ----
  const WEIGHT = 85, HEIGHT = 178, AGE = 28, MALE = true;
  const HR_REST = 60;                          // morning resting HR (adjust when known)
  const HR_MAX = Math.round(208 - 0.7 * AGE);  // Tanaka 2001 estimate (adjust if you know your real max)
  // ---- model ----
  const BMR_DAY = 10 * WEIGHT + 6.25 * HEIGHT - 5 * AGE + (MALE ? 5 : -161);     // Mifflin-St Jeor, kcal/day
  const KCAL_STEP = 0.5 * WEIGHT * (0.415 * HEIGHT / 100) / 1000;               // net walking cost ~0.5 kcal/kg/km x step length
  const VO2MAX = 15.3 * HR_MAX / HR_REST;                                       // Uth 2004 estimate, ml/kg/min
  const HRR_ON = 0.40;                                                          // count HR only above 40 % of HR reserve (ACSM moderate intensity)
  const hrKcalMin = bpm => {                                                    // net kcal/min from %HRR ~ %VO2R (ACSM)
    const f = (bpm - HR_REST) / (HR_MAX - HR_REST);
    return f < HRR_ON ? 0 : f * (VO2MAX - 3.5) * WEIGHT / 1000 * 5;
  };

  let res;
  const calc = () => {
    const now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayFrac = (now - mid) / 86400000;
    let stepK = 0, hrK = 0, recSteps = 0;
    try {
      require("health").readDay(now, h => {
        recSteps += h.steps;
        const s = h.steps * KCAL_STEP, r = h.bpm ? hrKcalMin(h.bpm) * 10 : 0;   // 10-minute record
        if (r > s) hrK += r; else stepK += s;                                    // take the larger, never both
      });
    } catch (e) {}
    let steps = recSteps;
    try { steps = Math.max(recSteps, Bangle.getHealthStatus("day").steps); } catch (e) {}
    stepK += (steps - recSteps) * KCAL_STEP;                                     // current, not yet stored interval
    const bmr = BMR_DAY * dayFrac, act = stepK + hrK;
    res = { bmr: bmr, step: stepK, hr: hrK, act: act, total: bmr + act, proj: BMR_DAY + act, steps: steps };
  };

  const draw = () => {
    calc();
    const R = Bangle.appRect, cx = R.x + R.w / 2;
    g.reset().clearRect(R).setFontAlign(0, 0);
    g.setFont("6x8").drawString("kcal since midnight", cx, R.y + 8);
    g.setFont("Vector", 40).drawString(Math.round(res.total), cx, R.y + 36);
    g.setFont("6x8");
    const row = (y, l, v) => { g.setFontAlign(-1, 0).drawString(l, R.x + 10, y).setFontAlign(1, 0).drawString(v, R.x2 - 10, y); };
    row(R.y + 66, "BMR so far", Math.round(res.bmr));
    row(R.y + 78, "Active: steps", Math.round(res.step));
    row(R.y + 90, "Active: heart rate", Math.round(res.hr));
    row(R.y + 102, "Steps", res.steps);
    g.drawLine(R.x + 10, R.y + 112, R.x2 - 10, R.y + 112);
    row(R.y + 122, "Day forecast", Math.round(res.proj));
    g.setFontAlign(0, 0).setColor("#888").drawString("BMR " + Math.round(BMR_DAY) + "/day  HR " + HR_REST + "-" + HR_MAX, cx, R.y2 - 8);
  };

  const tmr = setInterval(draw, 60000);
  Bangle.setUI({ mode: "custom", back: () => load(), remove: () => clearInterval(tmr) });
  Bangle.loadWidgets(); Bangle.drawWidgets();
  draw();
}
