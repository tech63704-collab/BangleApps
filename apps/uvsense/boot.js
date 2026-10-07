// UV Sense background alert v0.06: no network. Listens for weather pushed by Gadgetbridge.
(() => {
  let W; try { W = require("weather"); } catch (e) { return; }
  W.on("update", w => {
    if (!w || w.uv === undefined) return;
    const S = require("Storage"), F = "uvsense.json", d = new Date();
    const day = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
    let st = S.readJSON(F, 1) || {};
    if (st.day !== day) st = { day: day, hours: [], alerted: 0 };
    for (let i = 0; i < 24; i++) if (st.hours[i] === undefined) st.hours[i] = 0;
    st.cur = w.uv; st.t = w.time || Date.now();
    st.hours[d.getHours()] = Math.max(st.hours[d.getHours()], w.uv);
    const lv = w.uv >= 11 ? 3 : w.uv >= 8 ? 2 : w.uv >= 6 ? 1 : 0;   // 6 high, 8 very high, 11 extreme
    if (lv > (st.alerted || 0)) {
      st.alerted = lv;
      const name = ["", "HIGH", "VERY HIGH", "EXTREME"][lv];
      try {
        require("messages").pushMessage({ t: "add", id: "uvsense", src: "UV Sense", title: "UV " + name, body: "UV index " + w.uv.toFixed(1) + " - sun protection" });
      } catch (e) { Bangle.buzz(400 + lv * 200); }
    }
    S.writeJSON(F, st);
  });
})();
