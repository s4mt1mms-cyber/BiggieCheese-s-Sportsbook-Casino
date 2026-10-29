/* Biggietown — first-person free roam in an old western town (owner Oct 28; PvP comes later).
   Loaded on demand by wwOpen() in index.html, which exposes window.WWAPI (three.js loader + a few app helpers).
   Full screen; phones are forced sideways (the whole game is rotated 90° while the phone is held upright);
   the only way back to the casino is Pause → Exit. No money: the bottle challenge only keeps a best time (prefs.wwBest). */
(function () {
  "use strict";
  const API = () => window.WWAPI || {};
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (_) { return d } };
  const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (_) {} };
  const TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  let G = null;

  /* ---------------- settings ---------------- */
  /* control mapping: computer actions → key codes or "Mouse0/1/2…"; phone: drag the buttons anywhere (pos = fractions of the screen), size, left-handed, AIM tap or hold */
  const ACTS = [["fwd", "Move forward", "KeyW"], ["back", "Move back", "KeyS"], ["left", "Move left", "KeyA"], ["right", "Move right", "KeyD"], ["fire", "Fire", "Mouse0"], ["aim", "Aim down sights", "Mouse2"],
    ["reload", "Reload", "KeyR"], ["jump", "Jump", "Space"], ["run", "Run", "ShiftLeft"], ["cash", "Cash out (hold, at the bank)", "KeyE"], ["emote", "Emotes", "KeyB"], ["pause", "Pause", "KeyP"]];
  const KEYS0 = Object.fromEntries(ACTS.map(a => [a[0], a[2]]));
  const SET0 = { sens: 1, ads: 0.6, invert: false, fov: 75, sound: 1, keys: KEYS0, btn: 1, lefty: false, aimHold: false, pos: {} };
  const SET = () => { const s = Object.assign({}, SET0, LS("ww-set", {})); s.keys = Object.assign({}, KEYS0, s.keys || {}); s.pos = s.pos || {}; return s; };
  const keyName = c => { if (!c) return "–"; if (c.startsWith("Mouse")) return ["Left click", "Middle click", "Right click", "Mouse 4", "Mouse 5"][+c.slice(5)] || "Mouse " + c.slice(5);
    if (c.startsWith("Key")) return c.slice(3); if (c.startsWith("Digit")) return c.slice(5); if (c.startsWith("Arrow")) return c.slice(5) + " arrow";
    return { Space: "Space", ShiftLeft: "Left Shift", ShiftRight: "Right Shift", ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl", AltLeft: "Left Alt", AltRight: "Right Alt", Tab: "Tab", Enter: "Enter", CapsLock: "Caps Lock", Backquote: "`" }[c] || c; };
  const actOf = c => { const k = G.set.keys; for (const a in k) if (k[a] === c) return a; return null; };

  /* ---------------- styles ---------------- */
  const CSS = `
body.wwon{overflow:hidden}
#wwOv{position:fixed;inset:0;z-index:2147483000;background:#000;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font-family:Barlow,system-ui,sans-serif;color:#fff}
#wwOv *{box-sizing:border-box}
#wwRot{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
#wwCv{position:absolute;inset:0;width:100%;height:100%;display:block}
.wwhud{position:absolute;inset:0;pointer-events:none}
.wwx{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;transition:opacity .15s}
.wwx i{position:absolute;background:#fff;box-shadow:0 0 2px #000}
.wwx i:nth-child(1){left:10px;top:0;width:2px;height:7px}.wwx i:nth-child(2){left:10px;bottom:0;width:2px;height:7px}
.wwx i:nth-child(3){top:10px;left:0;height:2px;width:7px}.wwx i:nth-child(4){top:10px;right:0;height:2px;width:7px}
.wwx.ads{opacity:.0}
.wwdot{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#ff3b30;opacity:0;transition:opacity .15s}
.wwdot.on{opacity:1}
.wwhit{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0}
.wwhit.on{animation:wwhit .25s ease-out}
.wwhit i{position:absolute;left:12px;top:-2px;width:2px;height:9px;background:#ffe9a8;transform-origin:1px 15px}
@keyframes wwhit{from{opacity:1;transform:scale(1.3)}to{opacity:0;transform:scale(1)}}
.wwtop{position:absolute;top:max(12px,env(safe-area-inset-top));left:0;right:0;display:flex;justify-content:center;gap:10px;pointer-events:none}
.wwchip{background:rgba(20,12,6,.55);border:1px solid rgba(245,197,66,.45);border-radius:999px;padding:6px 12px;font:700 14px Barlow,sans-serif;letter-spacing:.04em;text-shadow:0 1px 2px #000}
.wwchip b{color:#ffd76a}
.wwammo{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));display:flex;gap:4px;align-items:flex-end}
.wwammo i{width:8px;height:22px;border-radius:4px 4px 2px 2px;background:linear-gradient(#f7d27a,#b8860b);box-shadow:0 1px 2px #000}
.wwammo i.off{background:rgba(255,255,255,.18)}
.wwammo span{font:700 12px Barlow;margin-left:6px;opacity:.85}
.wwmsg{position:absolute;left:50%;top:24%;transform:translateX(-50%);text-align:center;font:400 34px Rye,Georgia,serif;color:#ffe2a0;text-shadow:0 2px 0 #5a2e0c,0 4px 12px #000;opacity:0;transition:opacity .3s;white-space:nowrap}
.wwmsg small{display:block;font:700 15px Barlow;color:#fff;letter-spacing:.06em;margin-top:6px}
.wwmsg.on{opacity:1}
.wwtip{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);background:rgba(0,0,0,.5);padding:6px 12px;border-radius:8px;font:600 14px Barlow;opacity:0;transition:opacity .3s;white-space:nowrap}
.wwtip.on{opacity:1}
.wwbtn{position:absolute;pointer-events:auto;border-radius:50%;border:2px solid rgba(255,230,170,.55);background:rgba(30,18,8,.42);color:#ffe9b8;font:800 13px Barlow;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1}
.wwbtn.on{background:rgba(245,197,66,.45);border-color:#ffd76a}
#wwPause{position:absolute;pointer-events:auto;top:max(10px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:44px;height:44px;border-radius:12px;border:2px solid rgba(255,230,170,.5);background:rgba(30,18,8,.5);color:#fff;font:800 16px Barlow}
.wwstick{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(0,0,0,.18);display:none}
.wwstick i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,230,170,.5)}
.wwflash{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(160,0,0,.55));opacity:0;transition:opacity .4s}
.wwpanel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,6,2,.72);pointer-events:auto;padding:16px}
.wwcard{width:min(560px,100%);max-height:100%;overflow:auto;background:linear-gradient(#3b2414,#24150b);border:3px solid #c8963e;border-radius:16px;padding:18px 20px;box-shadow:0 10px 40px #000;text-align:center}
.wwcard h1{font:400 38px Rye,Georgia,serif;color:#ffd76a;margin:0;text-shadow:0 3px 0 #5a2e0c;letter-spacing:.02em}
.wwcard h2{font:400 26px Rye,Georgia,serif;color:#ffd76a;margin:0 0 8px}
.wwcard p{margin:6px 0;font-size:14px;color:#f3e2c4;line-height:1.35}
.wwcard .wwrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.wwcard button{font:800 16px Barlow;padding:11px 18px;border-radius:12px;border:2px solid #c8963e;background:#5a3418;color:#ffe9b8;min-width:130px}
.wwcard button.pri{background:linear-gradient(#f5c542,#c8901e);color:#2a1606;border-color:#ffe29a}
.wwcard button.dang{background:#6a1616;border-color:#d85a5a;color:#ffd9d9}
.wwset{text-align:left;margin-top:8px;display:grid;gap:10px}
.wwset label{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;font:700 14px Barlow;color:#ffe9b8}
.wwset input[type=range]{grid-column:1/3;width:100%;accent-color:#f5c542;height:28px}
.wwset .v{font:700 14px Barlow;color:#fff}
.wwset .ck{display:flex;justify-content:space-between}
.wwset .ck input{width:24px;height:24px;accent-color:#f5c542}
.wwlb{margin:10px auto 0;max-width:340px;text-align:left;font:600 14px Barlow;color:#f3e2c4}
.wwlb div{display:flex;justify-content:space-between;padding:3px 6px;border-bottom:1px dashed rgba(200,150,62,.35)}
.wwlb div.me{color:#ffd76a}
.wwfeed{position:absolute;top:max(10px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));width:min(46%,340px);display:flex;flex-direction:column;gap:4px;pointer-events:none}
.wwfeed div{background:rgba(10,6,2,.55);border-left:3px solid #ffd76a;border-radius:6px;padding:4px 9px;font:700 13px Barlow;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:transform .35s,opacity .35s,max-height .35s,margin .35s,padding .35s;max-height:30px}
.wwfeed div b{color:#ffd76a}.wwfeed div .hs{color:#ff6b5a}.wwfeed div.me{border-left-color:#5cff72}
.wwfeed div.out{opacity:0;transform:translateY(-14px);max-height:0;padding-top:0;padding-bottom:0;margin-top:-4px}
.wwtr{position:absolute;top:max(10px,env(safe-area-inset-top));right:calc(max(12px,env(safe-area-inset-right)) + 54px);display:flex;gap:6px;pointer-events:none}
.wwtr .wwchip{padding:6px 10px;font-size:13px}.wwlive i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b30;margin-right:5px;box-shadow:0 0 6px #ff3b30;animation:wwpulse 1.4s infinite}
@keyframes wwpulse{50%{opacity:.35}}
.wwbb.up b{color:#5cff72}.wwbb.dn b{color:#ff6b5a}
.wwpanel{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.wwmain{width:min(860px,100%);display:grid;grid-template-columns:1fr 1.1fr;gap:22px;align-items:center;text-align:left;padding:22px 26px;
  background:radial-gradient(ellipse at 20% 0%,rgba(255,200,110,.16),transparent 60%),linear-gradient(#3b2414,#1f1209)}
.wwbrand{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.wwbrand svg{width:54px;height:54px;filter:drop-shadow(0 2px 0 #5a2e0c)}
.wwbrand h1{font-size:44px;line-height:1;margin:2px 0 0}
.wwbrand p{margin:0;font:600 13px Barlow;letter-spacing:.18em;text-transform:uppercase;color:#d9b77a}
.wwbest{margin-top:10px;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border:1px solid rgba(200,150,62,.5);border-radius:10px;background:rgba(0,0,0,.25)}
.wwbest span{font:700 11px Barlow;letter-spacing:.14em;text-transform:uppercase;color:#c8a46a}.wwbest b{font:400 22px Rye,Georgia,serif;color:#ffe29a}
.wwmm{display:grid;gap:8px}
.wwmm button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:10px 16px;min-width:0;
  font:800 17px Barlow;letter-spacing:.02em;border-radius:10px;background:linear-gradient(#5e3818,#47280f);transition:transform .08s,filter .15s}
.wwmm button:active{transform:scale(.98)}
.wwmm button small{font:700 11px Barlow;letter-spacing:.12em;text-transform:uppercase;opacity:.75;white-space:nowrap}
.wwmm button.pri{background:linear-gradient(#f5c542,#c8901e)}.wwmm button.pri small{opacity:.8;color:#3a1c06}
.wwmm button.soon{filter:saturate(.75)}
.wwmm button.quiet{background:transparent;border-color:rgba(216,90,90,.6);color:#f3c8c8;font-size:15px;padding:8px 16px}
#wwRot.narrow .wwmain{grid-template-columns:1fr;text-align:center}#wwRot.narrow .wwbrand{align-items:center}
#wwRot.short .wwcard{padding:12px 16px;border-radius:14px}
#wwRot.short .wwcard h2{font-size:22px;margin-bottom:4px}
#wwRot.short .wwmain{padding:16px 22px;gap:18px}
#wwRot.short .wwbrand h1{font-size:38px}#wwRot.short .wwbrand svg{width:42px;height:42px}
#wwRot.short .wwmm{gap:7px}#wwRot.short .wwmm button{padding:8px 14px;font-size:16px}
#wwRot.short .wwkeys{display:none}
#wwRot.short .wwrow{margin-top:8px}#wwRot.short .wwcard button{padding:8px 14px;font-size:15px}
#wwRot.short .wwset{grid-template-columns:1fr 1fr;gap:6px 18px}#wwRot.short .wwset input[type=range]{height:22px}
#wwRot.short .wwset p{grid-column:1/3}
#wwRot.short .wwst{font-size:13px;margin-top:2px}#wwRot.short .wwst td{padding:2px 6px}#wwRot.short .wwst th{padding:2px 6px}
#wwRot.short .wwstp{display:none}
.wwpz{width:min(520px,100%)}.wwpz .wwgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.wwpz .wwgrid button{min-width:0}
.wwsc{width:min(640px,100%)}
.wwst{width:100%;border-collapse:collapse;margin-top:8px;font:600 14px Barlow;color:#f3e2c4}
.wwst th{font:800 12px Barlow;letter-spacing:.08em;color:#ffd76a;text-align:right;padding:4px 6px}.wwst th:first-child{text-align:left}
.wwst td{padding:5px 6px;border-bottom:1px dashed rgba(200,150,62,.3);text-align:right}.wwst td:first-child{text-align:left;color:#e8d4a8}
.wwst .pos{color:#5cff72}.wwst .neg{color:#ff6b5a}
.wwmap{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:6px}
.wwbind{display:flex!important;justify-content:space-between;align-items:center;gap:8px;min-width:0!important;padding:8px 12px!important;font:700 14px Barlow!important;text-align:left}
.wwbind b{font:800 13px Barlow;color:#ffd76a;background:rgba(0,0,0,.35);border:1px solid rgba(200,150,62,.5);border-radius:6px;padding:3px 8px;white-space:nowrap}
.wwbind.cap{border-color:#ffd76a!important;box-shadow:0 0 0 2px rgba(255,215,106,.35)}.wwbind.cap b{color:#fff;animation:wwpulse 1s infinite}
.wwlay{position:absolute;inset:0;background:rgba(10,6,2,.45);pointer-events:none}
.wwlaybar{position:absolute;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;gap:10px;align-items:center;pointer-events:auto;background:rgba(30,18,8,.9);border:2px solid #c8963e;border-radius:12px;padding:8px 10px 8px 14px;font:700 14px Barlow;color:#ffe9b8;white-space:nowrap}
.wwlaybar button{font:800 14px Barlow;padding:8px 14px;border-radius:10px;border:2px solid #c8963e;background:#5a3418;color:#ffe9b8}.wwlaybar button.pri{background:linear-gradient(#f5c542,#c8901e);color:#2a1606}
.wwhud.edit .wwbtn{z-index:5;border-style:dashed;border-color:#ffd76a;background:rgba(245,197,66,.25)}.wwhud.edit{z-index:4}
.wwtiers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.wwtiers button{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0!important;padding:12px 8px!important}
.wwtiers button b{font:400 22px Rye,Georgia,serif;color:#ffe29a}.wwtiers button small{font:700 11px Barlow;letter-spacing:.1em;text-transform:uppercase;opacity:.8}
.wwtiers button.off{opacity:.45}
.wwtag{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;transform-origin:50% 100%;text-shadow:0 1px 2px #000,0 0 4px #000}
.wwtag b{font:800 13px Barlow;color:#fff;white-space:nowrap}.wwtag span{font:800 12px Barlow;color:#ffd76a}.wwtag i{font:700 10px Barlow;font-style:normal;color:#9fd8ff;letter-spacing:.06em;text-transform:uppercase}
.wwhp{position:absolute;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));width:180px;height:14px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.3);overflow:hidden;display:none}
.wwhp i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#7dff8c,#2fa84a);transition:width .2s}.wwhp.low i{background:linear-gradient(#ff8a7a,#c0281c)}
.wwhp span{position:absolute;right:6px;top:-1px;font:800 11px Barlow;text-shadow:0 1px 2px #000}
.wwhud.pvp .wwhp{display:block}
#wwRot.short .wwhp{bottom:auto;top:max(58px,calc(env(safe-area-inset-top) + 50px));left:50%;transform:translateX(-50%);width:150px}
.wwdmg{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(170,0,0,.6));opacity:0;transition:opacity .35s;pointer-events:none}
.wwdir{position:absolute;left:50%;top:50%;width:180px;height:180px;opacity:0;transition:opacity .4s;pointer-events:none}
.wwdir i{position:absolute;left:50%;top:0;width:0;height:0;margin-left:-14px;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:22px solid rgba(255,60,40,.85);filter:drop-shadow(0 0 4px #000)}
.wwhit.hs i{background:#ff5a4a}
.wwcashbar{position:absolute;left:50%;top:60%;transform:translateX(-50%);width:220px;height:22px;border-radius:11px;background:rgba(0,0,0,.55);border:2px solid #ffd76a;overflow:hidden}
.wwcashbar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#ffe29a,#c8901e)}.wwcashbar span{position:absolute;inset:0;text-align:center;font:800 12px/18px Barlow;color:#fff;text-shadow:0 1px 2px #000}
.wwcashk{position:absolute;left:50%;top:70%;transform:translateX(-50%)}
.wwcashb{font-size:12px!important;background:rgba(245,197,66,.4)!important;border-color:#ffd76a!important}
.wwemo{position:absolute;right:max(16px,env(safe-area-inset-right));top:max(60px,calc(env(safe-area-inset-top) + 52px));display:none;flex-direction:column;gap:6px;pointer-events:auto;background:rgba(20,12,6,.85);border:2px solid #c8963e;border-radius:12px;padding:8px;max-height:60%;overflow:auto}
.wwemo.on{display:flex}.wwemo button{font:800 14px Barlow;padding:8px 14px;border-radius:9px;border:1px solid #c8963e;background:#5a3418;color:#ffe9b8;text-align:left}
.wwemo span{font:600 13px Barlow;color:#e8d4a8;padding:4px 6px}
.wwkeys{font:600 12.5px Barlow;color:#d9c39a;margin-top:8px}
.wwload{font:600 15px Barlow;color:#ffe9b8;margin-top:10px}
`;

  /* ---------------- open / close ---------------- */
  function open() {
    if (G) return;
    if (!document.getElementById("wwCss")) {
      const st = document.createElement("style"); st.id = "wwCss"; st.textContent = CSS; document.head.appendChild(st);
      const ln = document.createElement("link"); ln.rel = "stylesheet"; ln.href = "https://fonts.googleapis.com/css2?family=Rye&display=swap"; document.head.appendChild(ln);
    }
    const ov = document.createElement("div"); ov.id = "wwOv";
    ov.innerHTML = `<div id="wwRot"><canvas id="wwCv"></canvas><div class="wwhud" id="wwHud"></div><div id="wwUi"></div></div>`;
    document.body.appendChild(ov); document.body.classList.add("wwon");
    G = { ov, rot: ov.querySelector("#wwRot"), cv: ov.querySelector("#wwCv"), hud: ov.querySelector("#wwHud"), ui: ov.querySelector("#wwUi"),
      state: "menu", set: SET(), keys: {}, act: {}, touches: {}, raf: 0, ready: false, t: 0, chalPractice: () => chalPractice(),
      ses: { kills: 0, deaths: 0, bb: 0, matches: 0, shots: 0, hits: 0, bottles: 0, time: 0, best: 0 }, sesD: {}, server: { up: false, n: 0 } };
    layout(); window.addEventListener("resize", layout); window.addEventListener("orientationchange", () => setTimeout(layout, 250));
    if (window.visualViewport) visualViewport.addEventListener("resize", layout);
    bindInput();
    try { history.pushState({ ww: 1 }, ""); } catch (_) {}
    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onVis);
    showMenu(true);
    (async () => {
      try {
        await API().loadThree();
        try { await Promise.race([document.fonts.load("40px Rye"), new Promise(r => setTimeout(r, 2000))]); } catch (_) {}
        if (!G) return;
        buildWorld(); G.ready = true; showMenu(false);
        G.last = performance.now(); G.raf = requestAnimationFrame(loop);
      } catch (e) { console.error(e); if (G) G.ui.querySelector(".wwload").textContent = "Couldn't load the 3D engine. Check your connection."; }
    })();
  }
  function close() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
    try { if (G.ac) G.ac.close(); } catch (_) {}
    saveStats(); unbindInput(); if (G.net) { G.net.leaving = true; clearInterval(G.net.pingT); try { G.net.ws && G.net.ws.close(); } catch (_) {} }
    window.removeEventListener("resize", layout); window.removeEventListener("popstate", onPop); document.removeEventListener("visibilitychange", onVis);
    if (window.visualViewport) visualViewport.removeEventListener("resize", layout);
    if (G.R) { G.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose() }) }); G.R.dispose(); try { G.R.forceContextLoss() } catch (_) {} }
    G.ov.remove(); document.body.classList.remove("wwon"); G = null;
    try { if (history.state && history.state.ww) history.back(); } catch (_) {}
    try { API().closed && API().closed(); } catch (_) {}
  }
  function onPop() { if (!G) return; try { history.pushState({ ww: 1 }, ""); } catch (_) {} if (G.state === "play") pause(); }
  function onVis() { if (G && document.hidden && G.state === "play") pause(); }

  /* sideways on phones: when the screen is taller than wide, rotate the game 90° (top of the game = right edge of the phone) */
  function layout() {
    if (!G) return;
    const W = window.innerWidth, H = window.innerHeight, rotd = TOUCH && H > W;
    G.rotd = rotd; G.W = W; G.H = H;
    const gw = rotd ? H : W, gh = rotd ? W : H; G.gw = gw; G.gh = gh;
    Object.assign(G.rot.style, { width: gw + "px", height: gh + "px", transform: rotd ? `translate(${W}px,0) rotate(90deg)` : "none" });
    G.rot.classList.toggle("short", gh < 560); G.rot.classList.toggle("narrow", gw < 620);
    if (G.R) { G.R.setSize(gw, gh, false); G.cam.aspect = gw / gh; G.cam.updateProjectionMatrix(); }
    placeButtons();
  }
  /* viewport point → game point */
  const gpt = (x, y) => G.rotd ? { x: y, y: G.W - x } : { x, y };

  /* ---------------- menus ---------------- */
  function lbHtml() {
    const P = API().prefs ? API().prefs() : {}, me = API().me ? API().me() : null;
    const rows = Object.entries(P).filter(([, q]) => q && q.wwBest && q.wwBest.t > 0).map(([id, q]) => ({ id, t: q.wwBest.t })).sort((a, b) => a.t - b.t).slice(0, 8);
    if (!rows.length) return `<p>Nobody has cleared the bottle challenge yet.</p>`;
    return `<div class="wwlb">${rows.map((r, i) => `<div class="${r.id === me ? "me" : ""}"><span>${i + 1}. ${esc(API().nm ? API().nm(r.id) : r.id)}</span><b>${(r.t / 1000).toFixed(2)}s</b></div>`).join("")}</div>`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function keysHtml() { return TOUCH ? `<div class="wwkeys">Left thumb: walk · Right thumb: look · FIRE · AIM to aim down the sights · ⏸ to pause</div>`
    : `<div class="wwkeys">${["fwd", "left", "back", "right"].map(a => keyName(G.set.keys[a])).join("")} move · Mouse look · ${keyName(G.set.keys.fire)} shoot · ${keyName(G.set.keys.aim)} aim · ${keyName(G.set.keys.reload)} reload · ${keyName(G.set.keys.jump)} jump · ${keyName(G.set.keys.run)} run · Esc pause</div>`; }
  /* main menu: Join game (the live server; opens with PvP), Free roam, Settings, Stats, Back to casino */
  const STAR = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="wwSg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c8901e"/></linearGradient></defs>
    <path d="M32 3l7.6 15.8 17.4 2.4-12.6 12.2 3 17.2L32 42.4 16.6 50.6l3-17.2L7 21.2l17.4-2.4z" fill="url(#wwSg)" stroke="#5a2e0c" stroke-width="2.2" stroke-linejoin="round"/>
    ${[[32, 3], [57, 21.2], [47.4, 50.6], [16.6, 50.6], [7, 21.2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="url(#wwSg)" stroke="#5a2e0c" stroke-width="1.6"/>`).join("")}
    <circle cx="32" cy="29" r="7" fill="none" stroke="#5a2e0c" stroke-width="2"/></svg>`;
  function showMenu(loading) {
    G.state = "menu"; G.mode = null;
    if (!loading && Date.now() - (G.srvAt || 0) > 8000) { G.srvAt = Date.now(); srvStatus(); }
    const live = G.server && G.server.up, n = live ? G.server.n || 0 : 0, best = (API().myBest && API().myBest()) || 0;
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwmain"><div class="wwbrand">${STAR}<h1>BiggieTown</h1><p>Shootouts for BiggieBucks</p>
        <div class="wwbest"><span>Your best bottle run</span><b>${best ? (best / 1000).toFixed(2) + "s" : "Not yet"}</b></div></div>
      ${loading ? `<div class="wwload">Saddling up…</div>` : `<div class="wwmm">
        <button class="pri${live ? "" : " soon"}" data-ww="join"><span>Join game</span><small>${live ? `${n} in town` : G.server && G.server.checked ? "Server offline" : "Checking server…"}</small></button>
        <button data-ww="play"><span>Free roam</span><small>Solo · bottle challenge</small></button>
        <button data-ww="settings"><span>Settings</span><small>Sensitivity · aim · FOV</small></button>
        <button data-ww="stats"><span>Stats</span><small>All time · session</small></button>
        <button class="quiet" data-ww="exit"><span>Back to casino</span><small></small></button></div>`}</div></div>`;
  }
  /* stats: this session (since you opened Biggietown) and all time (prefs.wwStats + what this session hasn't saved yet) */
  const ST_KEYS = [["kills", "Kills"], ["deaths", "Deaths"], ["kd", "K/D"], ["bb", "BB won / lost"], ["matches", "Matches"], ["shots", "Shots fired"], ["acc", "Accuracy"], ["bottles", "Bottles broken"], ["best", "Best bottle time"], ["time", "Time played"]];
  function stFmt(k, o) {
    if (k === "kd") return o.deaths ? (o.kills / o.deaths).toFixed(2) : (o.kills || 0).toFixed(2);
    if (k === "acc") return o.shots ? Math.round(o.hits / o.shots * 100) + "%" : "–";
    if (k === "bb") { const v = Math.round(o.bb || 0); return `<span class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString()}</span>`; }
    if (k === "best") return o.best ? (o.best / 1000).toFixed(2) + "s" : "–";
    if (k === "time") { const m = Math.floor((o.time || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
    return Math.round(o[k] || 0).toLocaleString();
  }
  function allTime() { const b = (API().stats && API().stats()) || {}, d = G.sesD, o = {};
    ["kills", "deaths", "bb", "matches", "shots", "hits", "bottles", "time"].forEach(k => o[k] = (Number(b[k]) || 0) + (d[k] || 0));
    o.best = (API().myBest && API().myBest()) || 0; return o; }
  function showStats() {
    const from = G.state; G.state = "stats"; G.statsFrom = from === "stats" ? G.statsFrom : from;
    const ses = Object.assign({}, G.ses, { best: G.ses.best || 0 }), all = allTime();
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Stats</h2><table class="wwst"><tr><th></th><th>This session</th><th>All time</th></tr>
      ${ST_KEYS.map(([k, n]) => `<tr><td>${n}</td><td>${stFmt(k, ses)}</td><td>${stFmt(k, all)}</td></tr>`).join("")}</table>
      <p class="wwstp" style="opacity:.7;font-size:12.5px">Kills, deaths and BB start counting when the live server opens.</p>
      <div class="wwrow"><button class="pri" data-ww="statsdone">Done</button></div></div></div>`;
  }
  function pause() {
    if (!G || G.state !== "play") return;
    G.state = "pause"; G.fireHeld = false; G.aimHeld = false; G.keys = {}; G.act = {}; G.touches = {}; hideSticks();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
    const pvp = G.mode === "pvp";
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Paused</h2>${pvp ? `<p style="margin:0;color:#ffd0a0">You're still in the match. Others can see and shoot you.</p>` : ""}<div class="wwgrid">
      <button class="pri" data-ww="resume">Resume</button><button data-ww="settings">Settings</button>
      ${pvp ? `<button data-ww="stats">Stats</button><button class="dang" data-ww="leave">Leave match</button>` : `<button data-ww="stats">Stats</button><button data-ww="respawn">Respawn</button>
      <button data-ww="menu">Main menu</button><button class="dang" data-ww="exit">Exit to casino</button>`}</div>${keysHtml()}</div></div>`;
    saveStats();
  }
  function showSettings() {
    const s = G.set, from = G.state;
    G.state = "settings"; G.setFrom = from === "settings" ? G.setFrom : from;
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Settings</h2><div class="wwset">
      <label>Look sensitivity <span class="v" id="wwSv">${s.sens.toFixed(2)}×</span><input type="range" min="0.2" max="3" step="0.05" value="${s.sens}" data-wwset="sens"></label>
      <label>Aim-in sensitivity <span class="v" id="wwAv">${s.ads.toFixed(2)}×</span><input type="range" min="0.1" max="1.5" step="0.05" value="${s.ads}" data-wwset="ads"></label>
      <label>Field of view <span class="v" id="wwFv">${s.fov}°</span><input type="range" min="60" max="100" step="1" value="${s.fov}" data-wwset="fov"></label>
      <label>Sound <span class="v" id="wwVv">${Math.round(s.sound * 100)}%</span><input type="range" min="0" max="1" step="0.05" value="${s.sound}" data-wwset="sound"></label>
      <label class="ck">Invert look up/down <input type="checkbox" data-wwset="invert" ${s.invert ? "checked" : ""}></label>
      <p style="text-align:left;opacity:.75;margin:0">Aim-in sensitivity is a multiplier on your look sensitivity while you aim down the sights.</p>
      </div><div class="wwrow"><button data-ww="controls">Controls</button><button data-ww="setreset">Defaults</button><button class="pri" data-ww="setdone">Done</button></div></div></div>`;
  }
  function showControls() {
    G.state = "settings"; const s = G.set;
    const pc = `<div class="wwmap">${ACTS.map(([a, n]) => `<button class="wwbind${G.capturing === a ? " cap" : ""}" data-wwbind="${a}"><span>${n}</span><b>${G.capturing === a ? "Press a key…" : esc(keyName(s.keys[a]))}</b></button>`).join("")}</div>
      <p style="opacity:.7;font-size:12.5px;margin:6px 0 0">Click an action, then press a key or mouse button. Esc cancels. Arrow keys always move too; Esc always pauses.</p>`;
    const ph = `<div class="wwset">
      <label>Button size <span class="v" id="wwBv">${Math.round(s.btn * 100)}%</span><input type="range" min="0.7" max="1.5" step="0.05" value="${s.btn}" data-wwset="btn"></label>
      <label class="ck">Left-handed (fire on the left, walk on the right) <input type="checkbox" data-wwset="lefty" ${s.lefty ? "checked" : ""}></label>
      <label class="ck">Hold AIM instead of tapping it on/off <input type="checkbox" data-wwset="aimHold" ${s.aimHold ? "checked" : ""}></label></div>
      <div class="wwrow"><button data-ww="layout">Move buttons</button></div>`;
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Controls</h2>${TOUCH ? ph : pc}
      <div class="wwrow"><button data-ww="ctlreset">Default controls</button><button class="pri" data-ww="ctldone">Done</button></div></div></div>`;
  }
  /* phone: drag FIRE / AIM / reload / JUMP anywhere; saved as fractions of the screen so it works on any phone */
  function showLayout() {
    G.state = "layout"; G.ui.innerHTML = `<div class="wwlay"><div class="wwlaybar"><span>Drag the buttons where you want them</span><button data-ww="layreset">Reset</button><button class="pri" data-ww="laydone">Done</button></div></div>`;
    G.hud.classList.add("edit"); placeButtons();
  }
  function bindTo(code) {
    const a = G.capturing; if (!a) return; const k = G.set.keys, old = k[a], other = actOf(code);
    if (other && other !== a) k[other] = old; /* swap so nothing is left with two actions on one key */
    k[a] = code; G.capturing = null; G.capJust = performance.now(); LSset("ww-set", G.set); showControls();
  }
  function setVal(k, v) {
    const s = G.set; s[k] = k === "invert" ? !!v : Number(v); LSset("ww-set", s);
    const lab = { btn: ["#wwBv", x => Math.round(x * 100) + "%"], sens: ["#wwSv", x => x.toFixed(2) + "×"], ads: ["#wwAv", x => x.toFixed(2) + "×"], fov: ["#wwFv", x => x + "°"], sound: ["#wwVv", x => Math.round(x * 100) + "%"] }[k];
    if (lab) { const e = G.ui.querySelector(lab[0]); if (e) e.textContent = lab[1](s[k]); }
    if (G.master) G.master.gain.value = s.sound * 0.9;
    if (k === "btn" || k === "lefty") placeButtons();
  }
  function play() {
    if (!G.ready) return;
    G.ui.innerHTML = ""; G.state = "play"; G.last = performance.now();
    audioInit();
    if (!TOUCH) { try { G.cv.requestPointerLock(); } catch (_) {} }
    try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}) } catch (_) {} }).catch(() => {}); } catch (_) {}
    if (!G.started) { G.started = true; banner("BiggieTown", "Population: you"); }
    if (G.mode !== "pvp") { G.mode = "roam"; setLive(1); setBB(G.ses.bb); }
    placeButtons();
  }

  /* ---------------- input ---------------- */
  const H_ = {};
  function bindInput() {
    H_.click = e => {
      const tb = e.target.closest("[data-wwtier]"); if (tb && G) { joinTier(Number(tb.dataset.wwtier)); return; }
      const eb = e.target.closest("[data-wwemo]"); if (eb && G) { playEmote(eb.dataset.wwemo); return; }
      const bb = e.target.closest("[data-wwbind]"); if (bb && G) { if (!G.capturing && performance.now() - (G.capJust || 0) > 400) { G.capturing = bb.dataset.wwbind; showControls(); } return; }
      const b = e.target.closest("[data-ww]"); if (!b || !G) return; const a = b.dataset.ww;
      if (a === "play" || a === "resume") play();
      else if (a === "settings") showSettings();
      else if (a === "setdone") { const f = G.setFrom; if (f === "menu") showMenu(false); else { G.state = "play"; pause(); } }
      else if (a === "controls") { G.capturing = null; showControls(); }
      else if (a === "ctldone") { G.capturing = null; showSettings(); }
      else if (a === "ctlreset") { G.set.keys = Object.assign({}, KEYS0); G.set.btn = 1; G.set.lefty = false; G.set.aimHold = false; G.set.pos = {}; G.capturing = null; LSset("ww-set", G.set); placeButtons(); showControls(); }
      else if (a === "layout") showLayout();
      else if (a === "layreset") { G.set.pos = {}; LSset("ww-set", G.set); placeButtons(); }
      else if (a === "laydone") { G.hud.classList.remove("edit"); LSset("ww-set", G.set); showControls(); }
      else if (a === "setreset") { G.set = Object.assign({}, SET0, { keys: Object.assign({}, KEYS0), pos: {} }); LSset("ww-set", G.set); placeButtons(); showSettings(); if (G.master) G.master.gain.value = G.set.sound * .9; }
      else if (a === "exit") close();
      else if (a === "join") { if (G.server && G.server.up) showTiers(); else { const b2 = G.ui.querySelector("[data-ww=join] small"); if (b2) b2.textContent = "Server offline · try again soon"; srvStatus(); } }
      else if (a === "leave") leaveMatch();
      else if (a === "stats") showStats();
      else if (a === "statsdone") { if (G.statsFrom === "menu") showMenu(false); else { G.state = "play"; pause(); } }
      else if (a === "menu") { saveStats(); showMenu(false); }
      else if (a === "respawn") { spawnPlayer(); play(); }
    };
    H_.input = e => { const t = e.target.closest("[data-wwset]"); if (!t || !G) return; setVal(t.dataset.wwset, t.type === "checkbox" ? t.checked : t.value); };
    G.ov.addEventListener("click", H_.click); G.ov.addEventListener("input", H_.input); G.ov.addEventListener("change", H_.input);
    /* keys: swallow everything while the game is open so casino shortcuts don't fire underneath */
    H_.kd = e => {
      if (!G) return; if (e.target && e.target.closest && e.target.closest("input,textarea")) return;
      e.stopPropagation(); const k = e.code;
      if (G.capturing) { e.preventDefault(); if (k === "Escape") { G.capturing = null; showControls(); } else bindTo(k); return; }
      const act = actOf(k);
      if (k === "Escape" || act === "pause") { if (G.state === "play") { e.preventDefault(); pause(); } return; }
      if (G.state !== "play") return;
      G.keys[k] = true; if (act) { e.preventDefault(); G.act[act] = true; }
      if (act === "reload") reload(); if (act === "jump") G.jumpQ = true; if (act === "fire" && !e.repeat) fire(); if (act === "aim") G.aimHeld = true;
      if (act === "cash" && !e.repeat) cashPress(true); if (act === "emote" && !e.repeat) emoteMenu();
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(k)) e.preventDefault();
    };
    H_.ku = e => { if (!G) return; e.stopPropagation(); G.keys[e.code] = false; const act = actOf(e.code); if (act) { G.act[act] = false; if (act === "aim") G.aimHeld = false; if (act === "cash") cashPress(false); } };
    window.addEventListener("keydown", H_.kd, true); window.addEventListener("keyup", H_.ku, true);
    H_.mm = e => { if (!G || G.state !== "play" || document.pointerLockElement !== G.cv) return; look(e.movementX, e.movementY, 0.0022); };
    H_.md = e => {
      if (!G || TOUCH) return;
      if (G.capturing) { e.preventDefault(); bindTo("Mouse" + e.button); return; }
      if (G.state === "play" && document.pointerLockElement !== G.cv && e.target === G.cv) { try { G.cv.requestPointerLock(); } catch (_) {} return; }
      if (G.state !== "play") return;
      const act = actOf("Mouse" + e.button); if (!act) return; G.act[act] = true;
      if (act === "fire") { G.fireHeld = true; fire(); } else if (act === "aim") G.aimHeld = true; else if (act === "reload") reload(); else if (act === "jump") G.jumpQ = true; else if (act === "pause") pause();
    };
    H_.mu = e => { if (!G) return; const act = actOf("Mouse" + e.button); if (!act) return; G.act[act] = false; if (act === "fire") G.fireHeld = false; if (act === "aim") G.aimHeld = false; };
    H_.ctx = e => { if (G) e.preventDefault(); };
    H_.plc = () => { if (!G || TOUCH) return; if (document.pointerLockElement !== G.cv && G.state === "play") pause(); };
    H_.fsc = () => { if (G && !document.fullscreenElement && G.state === "play" && !TOUCH) pause(); };
    document.addEventListener("mousemove", H_.mm); G.ov.addEventListener("mousedown", H_.md); document.addEventListener("mouseup", H_.mu);
    G.ov.addEventListener("contextmenu", H_.ctx); document.addEventListener("pointerlockchange", H_.plc); document.addEventListener("fullscreenchange", H_.fsc);
    /* touch: left half = joystick (appears under the thumb), right half = look; buttons fire/aim/reload/jump */
    H_.ts = e => {
      if (!G) return; if (e.target.closest(".wwpanel,#wwPause,.wwlaybar,#wwEmo")) return; e.preventDefault();
      if (G.state === "layout") { for (const t of e.changedTouches) { const el = document.elementFromPoint(t.clientX, t.clientY), b = el && el.closest && el.closest(".wwbtn"); if (!b) continue; const p = gpt(t.clientX, t.clientY), r = b.getBoundingClientRect(), c = gpt(r.left + r.width / 2, r.top + r.height / 2); G.touches[t.identifier] = { kind: "drag", b, ox: c.x - p.x, oy: c.y - p.y }; b.classList.add("on"); } return; }
      if (G.state !== "play") return;
      for (const t of e.changedTouches) {
        const p = gpt(t.clientX, t.clientY), btn = e.target.closest && document.elementFromPoint(t.clientX, t.clientY);
        const b = btn && btn.closest && btn.closest(".wwbtn");
        if (b) { const a = b.dataset.b; G.touches[t.identifier] = { kind: a, x: p.x, y: p.y, b };
          b.classList.add("on");
          if (a === "fire") { G.fireHeld = true; fire(); } else if (a === "aim") { if (G.set.aimHold) G.aimHeld = true; else G.aimToggle = !G.aimToggle; } else if (a === "reload") reload(); else if (a === "jump") G.jumpQ = true; else if (a === "cash") cashPress(true); else if (a === "emote") emoteMenu();
          continue; }
        if (G.set.lefty ? p.x > G.gw * 0.58 : p.x < G.gw * 0.42) { if (Object.values(G.touches).some(q => q.kind === "stick")) continue; G.touches[t.identifier] = { kind: "stick", x0: p.x, y0: p.y, x: p.x, y: p.y }; showStick(p.x, p.y); }
        else G.touches[t.identifier] = { kind: "look", x: p.x, y: p.y };
      }
    };
    H_.tm = e => {
      if (!G) return; if (e.target.closest(".wwpanel")) return; e.preventDefault();
      if (G.state === "layout") { for (const t of e.changedTouches) { const q = G.touches[t.identifier]; if (!q || q.kind !== "drag") continue; const p = gpt(t.clientX, t.clientY);
        G.set.pos[q.b.dataset.b] = [Math.max(.04, Math.min(.96, (p.x + q.ox) / G.gw)), Math.max(.06, Math.min(.94, (p.y + q.oy) / G.gh))]; placeButtons(); } return; }
      if (G.state !== "play") return;
      for (const t of e.changedTouches) {
        const q = G.touches[t.identifier]; if (!q) continue; const p = gpt(t.clientX, t.clientY);
        if (q.kind === "stick") { q.x = p.x; q.y = p.y; moveStick(q); }
        else if (q.kind === "look" || q.kind === "fire" || q.kind === "aim") { look(p.x - q.x, p.y - q.y, 0.0058); q.x = p.x; q.y = p.y; }
      }
    };
    H_.te = e => {
      if (!G) return;
      for (const t of e.changedTouches) { const q = G.touches[t.identifier]; if (!q) continue; if (q.b) q.b.classList.remove("on"); if (q.kind === "fire") G.fireHeld = false; if (q.kind === "aim" && G.set.aimHold) G.aimHeld = false; if (q.kind === "cash") cashPress(false); if (q.kind === "stick") hideSticks(); delete G.touches[t.identifier]; }
      if (G.aimBtn) G.aimBtn.classList.toggle("on", !!G.aimToggle);
    };
    G.ov.addEventListener("touchstart", H_.ts, { passive: false }); G.ov.addEventListener("touchmove", H_.tm, { passive: false });
    G.ov.addEventListener("touchend", H_.te); G.ov.addEventListener("touchcancel", H_.te);
    H_.gest = e => e.preventDefault(); document.addEventListener("gesturestart", H_.gest, { passive: false });
  }
  function unbindInput() {
    window.removeEventListener("keydown", H_.kd, true); window.removeEventListener("keyup", H_.ku, true);
    document.removeEventListener("mousemove", H_.mm); document.removeEventListener("mouseup", H_.mu);
    document.removeEventListener("pointerlockchange", H_.plc); document.removeEventListener("fullscreenchange", H_.fsc);
    document.removeEventListener("gesturestart", H_.gest);
  }
  function look(dx, dy, k) {
    const s = G.set, ads = G.adsK > 0.5 ? s.ads : 1, m = k * s.sens * ads * (G.fovNow / 75);
    G.yaw -= dx * m; G.pitch -= dy * m * (s.invert ? -1 : 1); G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
  }
  function placeButtons() {
    if (!G || !G.hud) return;
    let el = G.hud.querySelector("#wwPause");
    if (!el) {
      G.hud.insertAdjacentHTML("beforeend", `<button id="wwPause" aria-label="Pause">❚❚</button>
        <div class="wwx" id="wwX"><i></i><i></i><i></i><i></i></div><div class="wwdot" id="wwDot"></div><div class="wwhit" id="wwHit"><i style="transform:rotate(45deg)"></i><i style="transform:rotate(135deg)"></i><i style="transform:rotate(225deg)"></i><i style="transform:rotate(315deg)"></i></div>
        <div class="wwtop"><span class="wwchip" id="wwChal" style="display:none"></span></div>
        <div class="wwfeed" id="wwFeed"></div>
        <div class="wwtr"><span class="wwchip wwlive" id="wwLive"><i></i><b>1</b> live</span><span class="wwchip wwbb" id="wwBB"><b>+0</b> BB</span></div>
        <div class="wwammo" id="wwAmmo"></div><div class="wwmsg" id="wwMsg"></div><div class="wwtip" id="wwTip"></div>
        <div class="wwstick" id="wwStick"><i></i></div>
        <div class="wwdmg" id="wwDmg"></div><div class="wwdir" id="wwDir"><i></i></div>
        <div class="wwhp" id="wwHp"><i></i><span>100</span></div>
        <div class="wwcashbar" id="wwCashBar" style="display:none"><i></i><span></span></div>
        <div class="wwemo" id="wwEmo"></div>
        ${TOUCH ? "" : `<div class="wwchip wwcashk" id="wwCash" style="display:none">Hold <b>${esc(keyName(G.set.keys.cash))}</b> to cash out · <b>${esc(keyName(G.set.keys.emote))}</b> emotes</div>`}
        ${TOUCH ? `<div class="wwbtn" data-b="fire" id="wwBF">FIRE</div><div class="wwbtn" data-b="aim" id="wwBA">AIM</div><div class="wwbtn" data-b="reload" id="wwBR">↻</div><div class="wwbtn" data-b="jump" id="wwBJ">JUMP</div><div class="wwbtn" data-b="emote" id="wwBE">EMOTE</div><div class="wwbtn wwcashb" data-b="cash" id="wwCash" style="display:none">HOLD TO<br>CASH OUT</div>` : ""}`);
      el = G.hud.querySelector("#wwPause"); el.addEventListener("click", e => { e.stopPropagation(); pause(); });
      el.addEventListener("touchstart", e => { e.stopPropagation(); e.preventDefault(); pause(); }, { passive: false });
      G.aimBtn = G.hud.querySelector("#wwBA");
      drawAmmo();
    }
    if (TOUCH) {
      const gw = G.gw, gh = G.gh, r = Math.max(30, Math.min(48, gh * 0.11)) * (G.set.btn || 1), pad = 22, L = !!G.set.lefty, POS = G.set.pos || {};
      const put = (id, cx, cy, rr) => { const el = G.hud.querySelector(id), sp = POS[el.dataset.b]; if (sp) { cx = sp[0] * gw; cy = sp[1] * gh; } else if (L) cx = gw - cx; Object.assign(el.style, { width: rr * 2 + "px", height: rr * 2 + "px", left: (cx - rr) + "px", top: (cy - rr) + "px", fontSize: Math.round(rr * .36) + "px" }); };
      const fx = gw - pad - r * 1.35 - 24, fy = gh - pad - r * 1.35 - 6;
      put("#wwBF", fx, fy, r * 1.35); put("#wwBA", fx - r * 2.7, fy + r * .15, r * .95); put("#wwBR", fx + r * .35, fy - r * 2.55, r * .8); put("#wwBJ", fx - r * 2.5, fy - r * 2.1, r * .8);
      put("#wwBE", fx - r * 4.6, fy + r * .35, r * .7); put("#wwCash", gw / 2, gh * .62, r * 1.1);
      const am = G.hud.querySelector("#wwAmmo"); am.style.right = "auto"; am.style.left = "50%"; am.style.transform = "translateX(-50%)";
    }
  }
  function showStick(x, y) { const s = G.hud.querySelector("#wwStick"); s.style.display = "block"; s.style.left = x + "px"; s.style.top = y + "px"; s.firstChild.style.transform = ""; }
  function moveStick(q) { const dx = q.x - q.x0, dy = q.y - q.y0, d = Math.hypot(dx, dy), m = Math.min(1, d / 50), a = Math.atan2(dy, dx);
    q.mx = Math.cos(a) * m; q.my = Math.sin(a) * m; G.hud.querySelector("#wwStick").firstChild.style.transform = `translate(${Math.cos(a) * m * 34}px,${Math.sin(a) * m * 34}px)`; }
  function hideSticks() { const s = G && G.hud.querySelector("#wwStick"); if (s) s.style.display = "none"; }

  /* ---------------- audio (all synthesized) ---------------- */
  function audioInit() {
    if (G.ac) { if (G.ac.state === "suspended") G.ac.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); G.ac = ac;
      G.master = ac.createGain(); G.master.gain.value = G.set.sound * .9; G.master.connect(ac.destination);
      const n = ac.sampleRate * 1.2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; G.noise = b;
      /* desert wind */
      const w = ac.createBufferSource(); w.buffer = b; w.loop = true; const wf = ac.createBiquadFilter(); wf.type = "lowpass"; wf.frequency.value = 380; const wg = ac.createGain(); wg.gain.value = .05;
      w.connect(wf); wf.connect(wg); wg.connect(G.master); w.start(); G.wind = wg;
    } catch (_) {}
  }
  function nz(t, dur, f, q, vol, type) { const ac = G.ac; const s = ac.createBufferSource(); s.buffer = G.noise; const fl = ac.createBiquadFilter(); fl.type = type || "bandpass"; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(vol * (G.vmul || 1), t); g.gain.exponentialRampToValueAtTime(.0008, t + dur); s.connect(fl); fl.connect(g); g.connect(G.master); s.start(t, Math.random() * .5); s.stop(t + dur + .02); }
  function tone(t, f0, f1, dur, vol, type) { const ac = G.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol * (G.vmul || 1), t); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(G.master); o.start(t); o.stop(t + dur + .02); }
  const SFX = {
    shot() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .42, 900, .6, .9, "lowpass"); nz(t, .12, 2600, .8, .5); tone(t, 140, 40, .25, .7, "triangle"); nz(t + .06, 1.1, 500, .4, .12, "lowpass"); },
    click() { if (!G.ac) return; const t = G.ac.currentTime; tone(t, 1800, 900, .03, .25, "square"); },
    reload() { if (!G.ac) return; const t = G.ac.currentTime; [0, .3, .5, .7, .9, 1.1, 1.3, 1.6].forEach((d, i) => tone(t + d, i === 0 || i === 7 ? 900 : 2400, 0, .04, .18, "square")); },
    wood() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .12, 420, 2, .5); tone(t, 220, 120, .08, .2, "triangle"); },
    dirt() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .2, 300, .7, .25, "lowpass"); },
    metal() { if (!G.ac) return; const t = G.ac.currentTime; [1, 2.76, 5.4].forEach((m, i) => tone(t, 820 * m, 0, .6 / (i + 1), .18 / (i + 1))); },
    glass() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .35, 5200, .8, .5, "highpass"); for (let i = 0; i < 6; i++) tone(t + Math.random() * .18, 3000 + Math.random() * 3500, 0, .18, .08); },
    bell() { if (!G.ac) return; const t = G.ac.currentTime; [[1, .5], [2.0, .25], [2.4, .2], [3.0, .14], [4.2, .08], [5.4, .05]].forEach(([m, v]) => tone(t, 310 * m, 0, 4.5 / m * 1.4, v)); },
    step(wood) { if (!G.ac) return; const t = G.ac.currentTime; if (wood) { tone(t, 160, 90, .06, .12, "triangle"); nz(t, .05, 800, 1, .06); } else nz(t, .09, 350 + Math.random() * 120, 1.2, .07); },
    door() { if (!G.ac) return; const t = G.ac.currentTime; tone(t, 260, 180, .25, .05, "sawtooth"); nz(t, .1, 600, 2, .08); },
    ding() { if (!G.ac) return; const t = G.ac.currentTime; tone(t, 1320, 0, .5, .2); tone(t + .08, 1760, 0, .6, .15); },
  };

  /* ---------------- world ---------------- */
  /* colliders: axis-aligned boxes {x0,x1,y0,y1,z0,z1,mat}; boxes no taller than 0.45 above their base are steps you walk onto */
  function buildWorld() {
    const T = THREE, gw = G.gw, gh = G.gh;
    const R = new T.WebGLRenderer({ canvas: G.cv, antialias: !TOUCH, powerPreference: "high-performance" });
    R.setPixelRatio(Math.min(TOUCH ? 1.5 : 1.75, window.devicePixelRatio || 1)); R.setSize(gw, gh, false);
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    const SH = !TOUCH; R.shadowMap.enabled = SH; R.shadowMap.type = T.PCFSoftShadowMap;
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(G.set.fov, gw / gh, .05, 900); sc.add(cam);
    Object.assign(G, { R, scene: sc, cam, cols: [], ladders: [], shoot: [], dyn: [], decals: [], parts: [], doors: [], bottles: [], weeds: [], fovNow: G.set.fov, adsK: 0 });
    const FOG = new T.Color(0xe9c294); sc.fog = new T.Fog(FOG, 90, 460); sc.background = FOG;

    /* ---- textures ---- */
    const cvT = (w, h, f, rep) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sandTex = cvT(256, 256, (g, w, h) => { g.fillStyle = "#c89a62"; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = rnd(-30, 30); g.fillStyle = `rgba(${150 + v},${110 + v},${70 + v},${rnd(.15, .5)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3)); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,62,38,${rnd(.2, .5)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(1, 3), 0, 7); g.fill(); } }, [90, 90]);
    const streetTex = cvT(512, 128, (g, w, h) => { g.fillStyle = "#a9784a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 3500; i++) { const v = rnd(-25, 25); g.fillStyle = `rgba(${130 + v},${90 + v},${55 + v},${rnd(.2, .5)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 2)); }
      [h * .3, h * .38, h * .62, h * .7].forEach(y => { g.strokeStyle = "rgba(70,45,25,.35)"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + rnd(-2, 2)); g.stroke(); }); }, [10, 1]);
    const plank = (base, rep, vert) => cvT(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const n = 8;
      for (let i = 0; i < n; i++) { const c = rnd(-18, 18); g.fillStyle = `rgba(${c > 0 ? 255 : 0},${c > 0 ? 230 : 0},${c > 0 ? 200 : 0},${Math.abs(c) / 160})`; vert ? g.fillRect(i * w / n, 0, w / n, h) : g.fillRect(0, i * h / n, w, h / n);
        g.fillStyle = "rgba(20,10,4,.55)"; vert ? g.fillRect(i * w / n, 0, 2, h) : g.fillRect(0, i * h / n, w, 2); }
      for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(0,0,0,${rnd(.03, .09)})`; g.beginPath(); const y = rnd(0, h); if (vert) { g.moveTo(y, 0); g.lineTo(y + rnd(-4, 4), h); } else { g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rnd(-3, 3), w * .6, y + rnd(-3, 3), w, y + rnd(-2, 2)); } g.stroke(); }
      for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(30,15,5,.5)"; g.beginPath(); g.ellipse(rnd(0, w), rnd(0, h), rnd(2, 5), rnd(1, 3), 0, 0, 7); g.fill(); } }, rep);
    const brickTex = cvT(256, 256, (g, w, h) => { g.fillStyle = "#7a3b28"; g.fillRect(0, 0, w, h); for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) { const v = rnd(-20, 20); g.fillStyle = `rgb(${140 + v},${66 + v / 2},${44 + v / 3})`; g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); } }, [2, 2]);
    const M = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: .9, metalness: 0 }, o));
    const mats = {};
    const wood = (key, base, vert) => mats[key] || (mats[key] = M({ map: plank(base, [1, 1], vert), color: 0xffffff }));
    const MT = {
      sand: M({ map: sandTex, roughness: 1 }), street: M({ map: streetTex, roughness: 1 }),
      dark: M({ color: 0x2b1a0e }), glass: M({ color: 0x1c2630, roughness: .15, metalness: .6, emissive: 0x05080a }),
      iron: M({ color: 0x2a2a2e, roughness: .45, metalness: .7 }), brass: M({ color: 0xc8963e, roughness: .35, metalness: .8 }),
      cactus: M({ color: 0x4f7a3a, roughness: .85 }), rock: M({ color: 0xa8643c, roughness: 1, flatShading: true }), rock2: M({ color: 0x8f5232, roughness: 1, flatShading: true }),
      roof: M({ map: plank("#4a3626", [1, 1]), color: 0xbfae9a }), post: wood("post", "#6b4a2c", true), deck: wood("deck", "#7a5532"), rail: wood("rail", "#5e3f24", true),
      white: M({ color: 0xeee6d8 }), felt: M({ color: 0x1d5a33 }), red: M({ color: 0x7a1d1d, roughness: .7 }), bottle: M({ color: 0x2f6b3a, roughness: .1, metalness: .2, transparent: true, opacity: .85 }),
      amber: M({ color: 0x9a5a14, roughness: .1, metalness: .2, transparent: true, opacity: .85 }), lamp: M({ color: 0xffd38a, emissive: 0xffb050, emissiveIntensity: 1.6 }),
      water: M({ color: 0x3b5d6b, roughness: .1, metalness: .3 }), hay: M({ color: 0xc9a54e, roughness: 1 }), brick: M({ map: brickTex })
    };
    /* static geometry batching: everything that never moves is merged per material at the end (few draw calls on phones) */
    const statics = new Map();
    const box = (w, h, d) => new T.BoxGeometry(w, h, d);
    function put(geo, mat, x, y, z, ry, par, opt) {
      const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; (par || sc).add(m);
      if (SH) { m.castShadow = !(opt && opt.ns); m.receiveShadow = true; } if (!(opt && opt.dyn)) { m.updateMatrixWorld(true); m.userData.st = 1; } return m;
    }
    /* a box in world space (optionally solid) */
    function blk(w, h, d, mat, x, y, z, solid, opt) {
      const m = put(box(w, h, d), mat, x, y + h / 2, z, 0, null, opt);
      if (solid !== false) G.cols.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2, mat: (opt && opt.snd) || "wood" });
      return m;
    }
    const colBox = (x0, x1, y0, y1, z0, z1, snd) => G.cols.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), mat: snd || "wood" });

    /* ---- sky, sun, light ---- */
    { const geo = new T.SphereGeometry(800, 32, 16), col = [], p = geo.attributes.position, c1 = new T.Color(0x3f7fc6), c2 = new T.Color(0xf6d6a6), c3 = new T.Color(0xffc78a);
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 800, c = y > 0 ? c2.clone().lerp(c1, Math.pow(Math.min(1, y * 2.2), .7)) : c3; col.push(c.r, c.g, c.b); }
      geo.setAttribute("color", new T.Float32BufferAttribute(col, 3)); const sky = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })); sc.add(sky); G.sky = sky;
      const sun = new T.Sprite(new T.SpriteMaterial({ map: cvT(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,250,230,1)"); r.addColorStop(.25, "rgba(255,236,190,.9)"); r.addColorStop(1, "rgba(255,200,120,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); }), fog: false, depthWrite: false, transparent: true }));
      sun.scale.set(140, 140, 1); sun.position.set(-420, 260, -300); sky.add(sun); }
    sc.add(new T.HemisphereLight(0xcfe0ff, 0xa06a3c, .62));
    const sunL = new T.DirectionalLight(0xffe2b8, 1.25); sunL.position.set(-60, 55, -40); sc.add(sunL); sc.add(sunL.target);
    if (SH) { sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048); const s = sunL.shadow.camera; s.left = -80; s.right = 80; s.top = 60; s.bottom = -60; s.near = 1; s.far = 220; sunL.shadow.bias = -.0006; }

    /* ---- ground, street, far mesas ---- */
    { const g = put(new T.PlaneGeometry(900, 900), MT.sand, 0, 0, 0, 0, null, { ns: 1 }); g.rotation.x = -Math.PI / 2; g.updateMatrixWorld(true);
      const s = put(new T.PlaneGeometry(150, 14), MT.street, -8, .01, 0, 0, null, { ns: 1 }); s.rotation.x = -Math.PI / 2; s.updateMatrixWorld(true); }
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + rnd(-.08, .08), r = rnd(230, 380), h = rnd(25, 70), w = rnd(30, 80);
      const m = put(new T.CylinderGeometry(w * rnd(.55, .8), w, h, 7, 1), i % 2 ? MT.rock : MT.rock2, Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, rnd(0, 3), null, { ns: 1 }); m.scale.z = rnd(.4, .8); m.updateMatrixWorld(true); }
    for (let i = 0; i < 40; i++) { const a = rnd(0, 7), r = rnd(80, 200), s = rnd(1.5, 6); const m = put(new T.DodecahedronGeometry(s, 0), MT.rock, Math.cos(a) * r, s * .35, Math.sin(a) * r, rnd(0, 3)); m.scale.y = rnd(.5, .9); m.updateMatrixWorld(true); }

    /* ---- signs ---- */
    const signTex = (txt, bg, fg, w, h) => cvT(w || 1024, h || 192, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 10; g.strokeRect(8, 8, W - 16, H - 16);
      for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(0,0,0,${rnd(.03, .08)})`; g.beginPath(); const y = rnd(0, H); g.moveTo(0, y); g.lineTo(W, y + rnd(-3, 3)); g.stroke(); }
      let fs = H * .56; g.font = `${fs}px Rye, Georgia, serif`; while (g.measureText(txt).width > W * .9 && fs > 10) { fs -= 2; g.font = `${fs}px Rye, Georgia, serif`; }
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(0,0,0,.35)"; g.fillText(txt, W / 2 + 3, H / 2 + 5); g.fillStyle = fg; g.fillText(txt, W / 2, H / 2 + 2); });
    const sign = (txt, w, h, x, y, z, ry, bg, fg, par) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), M({ map: signTex(txt, bg || "#3a2414", fg || "#f3d38a", 1024, Math.round(1024 * h / w)), roughness: .8 })); m.position.set(x, y, z); m.rotation.y = ry || 0; (par || sc).add(m); m.updateMatrixWorld(true); return m; };

    /* ---- buildings ----
       Built in local space (front at z=0 facing +z, depth toward -z), then placed: north side faces +z (rot 0), south side faces -z (rot π).
       Local boxes are converted to world boxes for collisions. */
    function building(o) {
      const { x, zf, rot, w, d, h, name } = o, grp = new T.Group(); grp.position.set(x, 0, zf); grp.rotation.y = rot; sc.add(grp); grp.updateMatrixWorld(true);
      const fl = o.enter ? .32 : 0;
      const L = (lx, lz) => { const c = Math.cos(rot), s = Math.sin(rot); return [x + lx * c + lz * s, zf - lx * s + lz * c]; };
      const lbox = (bw, bh, bd, mat, lx, ly, lz, solid, snd, opt) => { const m = put(box(bw, bh, bd), mat, lx, ly + bh / 2, lz, 0, grp, opt);
        if (solid !== false) { const a = L(lx - bw / 2, lz - bd / 2), b = L(lx + bw / 2, lz + bd / 2); colBox(a[0], b[0], ly, ly + bh, a[1], b[1], snd); } return m; };
      const wall = o.brick ? MT.brick : wood("w" + o.col, o.col);
      const trim = wood("t" + (o.trim || "#3a2414"), o.trim || "#3a2414", true);
      if (!o.enter) lbox(w, h, d, wall, 0, 0, -d / 2);
      else {
        const t = .22, dw = 2.4, side = (w - dw) / 2;
        lbox(w, h, t, wall, 0, 0, -d + t / 2); lbox(t, h, d, wall, -w / 2 + t / 2, 0, -d / 2); lbox(t, h, d, wall, w / 2 - t / 2, 0, -d / 2);
        lbox(side, h, t, wall, -w / 2 + side / 2, 0, -t / 2); lbox(side, h, t, wall, w / 2 - side / 2, 0, -t / 2); lbox(dw, h - 2.9, t, wall, 0, 2.9, -t / 2);
        lbox(w - .1, fl, d - .1, wood("floor", "#6a4528"), 0, 0, -d / 2, true, "wood");
        lbox(w, .15, d, wood("ceil", "#3d2817"), 0, h - .15, -d / 2, true); /* ceiling = the roof you can stand on */
        /* inside walls a bit darker so the room reads as shade */
        const inW = M({ map: plank(o.inCol || "#5a3a22", [1, 1]), color: 0x9a8a7a });
        [[w - .5, h - fl, .02, 0, -d + t + .02], [.02, h - fl, d - .5, -w / 2 + t + .02, -d / 2], [.02, h - fl, d - .5, w / 2 - t - .02, -d / 2]].forEach(([a, b, c, lx, lz]) => put(box(a, b, c), inW, lx, fl + b / 2, lz, 0, grp, { ns: 1 }));
        o.interior && o.interior(grp, lbox, fl, w, d, h, L);
        /* swinging batwing doors */
        [-1, 1].forEach(sd => { const hinge = new T.Group(); hinge.position.set(sd * dw / 2, fl + .55, -t / 2); grp.add(hinge);
          const dmat = wood("batwing", "#b07a3e", true), dk = wood("batwingT", "#5a3418", true);
          const dm = put(box(dw / 2 - .12, .78, .05), dmat, -sd * (dw / 4 - .03), .45, 0, 0, hinge, { dyn: 1 });
          put(box(dw / 2 - .1, .1, .07), dk, -sd * (dw / 4 - .03), .88, 0, 0, hinge, { dyn: 1 }); put(box(dw / 2 - .1, .1, .07), dk, -sd * (dw / 4 - .03), .06, 0, 0, hinge, { dyn: 1 });
          G.doors.push({ hinge, sd, a: 0, v: 0, wp: L(0, -t / 2), rot }); });
      }
      /* false front, sign, trim, windows, door */
      const hf = o.hf || h + 1.6;
      lbox(w + .3, hf - h + .1, .25, wall, 0, h - .1, .1, false);
      lbox(w + .5, .25, .4, trim, 0, hf, .1, false); lbox(w + .3, .2, .35, trim, 0, h - .2, .14, false);
      sign(name, Math.min(w - 1, 9), Math.min(1.5, (w - 1) / 5), 0, h + (hf - h) / 2 + .1, .26, 0, o.sbg, o.sfg, grp);
      const win = (lx, ly, ww, wh) => { put(box(ww, wh, .06), MT.glass, lx, ly, .03, 0, grp); put(box(ww + .2, .12, .12), trim, lx, ly + wh / 2 + .06, .06, 0, grp); put(box(ww + .2, .12, .12), trim, lx, ly - wh / 2 - .06, .06, 0, grp);
        put(box(.06, wh, .1), trim, lx, ly, .07, 0, grp); };
      const nw = Math.max(1, Math.floor((w - 3) / 3.2));
      for (let i = 0; i < nw; i++) { const lx = (i + .5) / nw * (w - 1) - (w - 1) / 2; if (Math.abs(lx) < 1.6) continue; win(lx, 1.8, 1.3, 1.5); if (h > 6) win(lx, 5, 1.1, 1.4); }
      if (!o.enter) { put(box(1.3, 2.4, .08), wood("door", "#8a5a30", true), 0, 1.2 + fl, .04, 0, grp); put(box(.1, .1, .1), MT.brass, .45, 1.2, .1, 0, grp); }
      if (h > 6 && o.balcony) { lbox(w, .18, 1.6, MT.deck, 0, 3.6, .8, false); for (let i = 0; i <= 8; i++) put(box(.06, .9, .06), MT.rail, -w / 2 + .1 + i * (w - .2) / 8, 4.2, 1.55, 0, grp); put(box(w, .08, .08), MT.rail, 0, 4.6, 1.55, 0, grp); }
      /* porch: deck (walkable step), posts, roof */
      const pd = 2.6; lbox(w, .3, pd, MT.deck, 0, 0, pd / 2, true, "wood");
      if (!o.noRoof) { const np = Math.max(2, Math.round(w / 4)); for (let i = 0; i < np; i++) { const lx = -w / 2 + .25 + i * (w - .5) / (np - 1); lbox(.22, 3.0, .22, MT.post, lx, .3, pd - .15, true); }
        const pr = put(box(w + .4, .14, pd + .4), MT.roof, 0, 3.35, pd / 2, 0, grp); pr.rotation.x = .08; pr.updateMatrixWorld(true); }
      put(box(w - .05, .05, d - .05), MT.roof, 0, h + .025, -d / 2, 0, grp);
      /* ladder up the back wall to the roof (high ground) */
      if (o.ladder) { const lx = (w / 2 - 1.3) * (o.ladder < 0 ? -1 : 1), top = h + .9, lz = -d - .12;
        [-.28, .28].forEach(sx => put(box(.07, top, .07), MT.post, lx + sx, top / 2, lz, 0, grp));
        for (let y = .3; y < top; y += .32) put(box(.6, .05, .05), MT.post, lx, y, lz, 0, grp);
        const a = L(lx - .45, lz - .75), b = L(lx + .45, lz + .12); G.ladders.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), top: h + .08 }); }
      if (o.extra) o.extra(grp, lbox, L);
      return grp;
    }

    /* saloon interior: bar counter, back bar with bottles, mirror, tables + chairs, piano, chandelier, a warm light */
    const chairM = wood("chair", "#5a3218"), leather = M({ color: 0x5a1010, roughness: .55 });
    const saloonInside = (named) => (grp, lbox, fl, w, d, h, L) => {
      const bx = -w / 2 + 2.2, bz = -d + 2.4;
      lbox(.9, 1.15, d * .55, wood("bar", "#5a3318"), bx, fl, -d * .55, true); put(box(1.1, .08, d * .55 + .1), wood("bartop", "#2e1a0c"), bx, fl + 1.19, -d * .55, 0, grp);
      put(box(d * .55, .06, .06).rotateY(Math.PI / 2), MT.brass, bx + .5, fl + .25, -d * .55, 0, grp);
      lbox(w - .6, 2.6, .5, wood("shelf", "#3d2210"), 0, fl, -d + .5, true); put(box(w * .5, 1.5, .03), M({ color: 0x8a9aa8, roughness: .05, metalness: .9 }), 0, fl + 2.2, -d + .78, 0, grp);
      for (let i = 0; i < 18; i++) { const bb = put(new T.CylinderGeometry(.05, .06, .3, 8), i % 3 ? MT.bottle : MT.amber, -w / 2 + 1 + i * (w - 2) / 17, fl + 1.35 + (i % 2) * .55, -d + .62, 0, grp); }
      const tables = [[1.2, -d * .35], [3.6, -d * .62], [1.6, -d * .78], [3.4, -d * .22]];
      tables.forEach(([tx, tz], i) => { if (tx > w / 2 - 1.2) return; put(new T.CylinderGeometry(.75, .75, .07, 20), i % 2 ? MT.felt : wood("tab", "#6a3e1e"), tx, fl + .78, tz, 0, grp); put(new T.CylinderGeometry(.08, .2, .75, 10), wood("tab", "#6a3e1e"), tx, fl + .38, tz, 0, grp);
        const wp = L(tx, tz); colBox(wp[0] - .7, wp[0] + .7, 0, fl + .82, wp[1] - .7, wp[1] + .7);
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4, ch = new T.Group(); ch.position.set(tx + Math.cos(a) * 1.05, fl - .02, tz + Math.sin(a) * 1.05); ch.rotation.y = -a - Math.PI / 2; ch.scale.setScalar(.95); grp.add(ch);
          const add = (geo, mat, x, y, z, par) => put(geo, mat, x, y, z, 0, par); API().rrChairParts(T, add, ch, chairM, leather); }
        G.bottleSpots.push({ grp, lx: tx + .2, ly: fl + .97, lz: tz + .1, free: true }); });
      put(box(1.6, 1.3, .7), wood("piano", "#2a170b"), w / 2 - 1.2, fl + .65, -d + 1.6, 0, grp); put(box(1.5, .08, .25), MT.white, w / 2 - 1.2, fl + 1.02, -d + 2.0, 0, grp);
      const ch = put(new T.TorusGeometry(.7, .05, 8, 24), MT.iron, 0, h - 1.1, -d / 2, 0, grp); ch.rotation.x = Math.PI / 2; ch.updateMatrixWorld(true);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(new T.SphereGeometry(.09, 8, 6), MT.lamp, Math.cos(a) * .7, h - 1.02, -d / 2 + Math.sin(a) * .7, 0, grp, { ns: 1 }); }
      const lp = new T.PointLight(0xffb35c, 1.4, 16, 1.6); lp.position.set(0, h - 1.3, -d / 2); grp.add(lp);
      for (let i = 0; i < 3; i++) G.bottleSpots.push({ grp, lx: bx + rnd(-.2, .2), ly: fl + 1.38, lz: -d * .55 + (i - 1) * 1.4, free: true });
      sign(named, 3.2, .8, 0, fl + 3.1, -d + .79, 0, "#2a1608", "#ffd76a", grp);
      /* wanted posters */
      ["WANTED", "WANTED", "REWARD"].forEach((t, i) => sign(t, .7, .9, -w / 2 + .36, fl + 1.8, -d * .25 - i * 1.1, Math.PI / 2, "#e8d4a8", "#3a1c0a", grp));
    };
    G.bottleSpots = [];

    const ZN = -9.6, ZS = 9.6;
    const north = [
      { x: -46, w: 10, d: 10, h: 4.6, ladder: 1, name: "GENERAL STORE", col: "#a8865c", sbg: "#2a3a1c" },
      { x: -34.5, w: 9, d: 10, h: 5, name: "BANK", col: "#7a3b28", brick: 1, sbg: "#1a1a2a", sfg: "#e8c86a" },
      { x: -21, w: 14, d: 14, h: 7.6, name: "THE RUSTY SPUR", col: "#8a5a34", enter: 1, balcony: 1, hf: 9.6, sbg: "#5a1a10", interior: saloonInside("RUSTY SPUR") },
      { x: -8, w: 8, d: 9, h: 4.4, ladder: -1, name: "SHERIFF", col: "#6e7884", sbg: "#2a2a2a", sfg: "#f3d38a" },
      { x: 3, w: 10, d: 11, h: 7.4, ladder: 1, name: "GRAND HOTEL", col: "#6f8a6a", balcony: 1, sbg: "#1d3320" },
      { x: 14.5, w: 9, d: 9, h: 4.5, name: "BARBER", col: "#b3a48a", sbg: "#5a1a1a" },
      { x: 27, w: 12, d: 11, h: 5, ladder: -1, name: "BLACKSMITH", col: "#5e4a3a", sbg: "#1a1410" },
      { x: 42, w: 10, d: 10, h: 4.8, name: "UNDERTAKER", col: "#4a4040", sbg: "#101010", sfg: "#cfc6b8" }];
    const south = [
      { x: -45, w: 11, d: 12, h: 6, name: "LIVERY STABLE", col: "#8a2a20", sbg: "#3a1408", noRoof: 1 },
      { x: -31, w: 10, d: 10, h: 4.6, ladder: 1, name: "POST OFFICE", col: "#8f9aa0", sbg: "#1a2a3a" },
      { x: -17, w: 8, d: 9, h: 4.4, name: "ASSAY OFFICE", col: "#b08a56", sbg: "#3a2414" },
      { x: -3, w: 14, d: 14, h: 7.6, ladder: -1, name: "GOLDEN NUGGET", col: "#9a6a2a", enter: 1, balcony: 1, hf: 9.8, sbg: "#3a2408", sfg: "#ffd24a", inCol: "#4e2e1a", interior: saloonInside("GOLDEN NUGGET") },
      { x: 12, w: 9, d: 10, h: 4.6, name: "DRUGS & SUNDRIES", col: "#a87a6a", sbg: "#2a1a3a" },
      { x: 25, w: 10, d: 10, h: 4.6, ladder: 1, name: "TELEGRAPH", col: "#9a9070", sbg: "#2a2414" },
      { x: 40, w: 12, d: 11, h: 5, name: "JAIL", col: "#7a7064", brick: 1, sbg: "#1a1a1a" }];
    north.forEach(o => building(Object.assign({ zf: ZN, rot: 0 }, o)));
    south.forEach(o => building(Object.assign({ zf: ZS, rot: Math.PI }, o)));

    /* church at the east end of the street, facing west, with a bell you can ring */
    { const grp = new T.Group(); grp.position.set(52, 0, 0); grp.rotation.y = -Math.PI / 2; sc.add(grp); grp.updateMatrixWorld(true);
      const W = 9, D = 14, Hh = 6.2, wl = M({ map: plank("#e9e2d4", [1, 1]) });
      put(box(W, Hh, D), wl, 0, Hh / 2, -D / 2, 0, grp); colBox(52, 52 + D, 0, Hh, -W / 2, W / 2, "wood");
      { const ra = .55, rl = W / 2 / Math.cos(ra) + .5; [-1, 1].forEach(sd => { const r = new T.Mesh(box(rl, .2, D + .5), MT.roof); r.position.set(sd * W / 4, Hh + Math.tan(ra) * W / 4, -D / 2); r.rotation.z = -sd * ra; grp.add(r); r.userData.st = 1; });
        const sh = new T.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(0, Math.tan(ra) * W / 2); sh.lineTo(-W / 2, 0); const tri = new T.Mesh(new T.ShapeGeometry(sh), wl); tri.position.set(0, Hh, .01); grp.add(tri); tri.userData.st = 1; }
      put(box(3, 4, 3), wl, 0, Hh + 2, -1.5, 0, grp); const sp = new T.Mesh(new T.ConeGeometry(2.2, 4.5, 4), MT.roof); sp.rotation.y = Math.PI / 4; sp.position.set(0, Hh + 6.25, -1.5); grp.add(sp); sp.updateMatrixWorld(true);
      put(box(.15, 1.4, .15), MT.white, 0, Hh + 9.2, -1.5, 0, grp); put(box(.9, .15, .15), MT.white, 0, Hh + 9.45, -1.5, 0, grp);
      put(box(1.8, 3, .1), wood("door", "#8a5a30", true), 0, 1.5, .05, 0, grp); sign("CHAPEL", 3, .7, 0, 3.8, .06, 0, "#e9e2d4", "#3a2414", grp);
      const bell = new T.Group(); bell.position.set(0, Hh + 3.2, -1.5); grp.add(bell);
      const bm = new T.Mesh(new T.CylinderGeometry(.3, .62, .8, 16, 1, true), M({ color: 0xb8862e, roughness: .3, metalness: .9, side: T.DoubleSide })); bm.position.y = -.4; bell.add(bm);
      G.bell = { g: bell, a: 0, v: 0 }; bell.updateMatrixWorld(true);
      const bw = new T.Vector3(); bell.getWorldPosition(bw); G.shoot.push({ kind: "bell", c: bw.clone().add(new T.Vector3(0, -.4, 0)), r: .65 });
      /* bell opening */ put(box(3.1, 2.2, .2), MT.dark, 0, Hh + 2.6, 0.02, 0, grp);
    }

    /* the welcome arch at the west end + boundary fences */
    { const ax = -58; blk(.4, 6, .4, MT.post, ax, 0, -7.5); blk(.4, 6, .4, MT.post, ax, 0, 7.5); blk(.3, .3, 15.4, MT.post, ax, 5.6, 0, false);
      sign("WELCOME TO BIGGIETOWN", 12, 1.3, ax + .2, 4.7, 0, Math.PI / 2, "#5a3418", "#ffe29a"); sign("WELCOME TO BIGGIETOWN", 12, 1.3, ax - .2, 4.7, 0, -Math.PI / 2, "#5a3418", "#ffe29a"); }
    const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 2.5), ang = Math.atan2(z1 - z0, x1 - x0);
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; put(box(.16, 1.3, .16), MT.post, x, .65, z); }
      [.45, 1.0].forEach(y => { const r = put(box(L, .1, .06), MT.rail, (x0 + x1) / 2, y, (z0 + z1) / 2, -ang); r.updateMatrixWorld(true); });
      colBox(Math.min(x0, x1) - .15, Math.max(x0, x1) + .15, 0, 1.4, Math.min(z0, z1) - .15, Math.max(z0, z1) + .15); };
    const BX = 70, BZ = 40; fence(-BX, -BZ, BX, -BZ); fence(-BX, BZ, BX, BZ); fence(-BX, -BZ, -BX, -9); fence(-BX, 9, -BX, BZ); fence(BX, -BZ, BX, BZ);
    colBox(-BX - 3, -BX, 0, 3, -9, 9); /* road out of town: an invisible fence (sign says the desert's closed) */
    sign("DESERT CLOSED · TURN BACK", 5, .8, -BX + .3, 1.6, 0, Math.PI / 2, "#5a3418", "#ffe29a");
    G.bounds = { x0: -BX + .5, x1: BX - .5, z0: -BZ + .5, z1: BZ - .5 };

    /* props: barrels, crates, troughs, hitching rails, wagons, cacti, lamps, water tower, windmill, gallows-free */
    const barrel = (x, z) => { put(new T.CylinderGeometry(.42, .42, 1.05, 12), wood("barrel", "#7a4a24", true), x, .52, z); [.15, .9].forEach(y => put(new T.CylinderGeometry(.44, .44, .07, 12), MT.iron, x, y, z)); colBox(x - .42, x + .42, 0, 1.05, z - .42, z + .42); };
    const crate = (x, z, s, y) => { s = s || .9; blk(s, s, s, wood("crate", "#9a7040"), x, y || 0, z); };
    const trough = (x, z) => { blk(2.4, .6, .8, wood("trough", "#6a4a2a"), x, 0, z); put(box(2.2, .05, .6), MT.water, x, .55, z); };
    const hitch = (x, z) => { blk(.12, 1.1, .12, MT.post, x - 1.3, 0, z); blk(.12, 1.1, .12, MT.post, x + 1.3, 0, z); put(box(2.8, .1, .1), MT.post, x, 1.05, z); colBox(x - 1.4, x + 1.4, 0, 1.15, z - .08, z + .08); };
    const cactus = (x, z, s) => { s = s || 1; const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); sc.add(g); g.updateMatrixWorld(true);
      put(new T.CylinderGeometry(.28, .32, 3.6, 10), MT.cactus, 0, 1.8, 0, 0, g); put(new T.SphereGeometry(.28, 10, 8), MT.cactus, 0, 3.6, 0, 0, g);
      [[-1, 1.5, 1.0], [1, 2.1, .8]].forEach(([sd, y, l]) => { const a = put(new T.CylinderGeometry(.18, .2, .7, 8), MT.cactus, sd * .45, y, 0, 0, g); a.rotation.z = Math.PI / 2; a.updateMatrixWorld(true); put(new T.CylinderGeometry(.18, .18, l, 8), MT.cactus, sd * .78, y + l / 2, 0, 0, g); put(new T.SphereGeometry(.18, 8, 6), MT.cactus, sd * .78, y + l, 0, 0, g); });
      colBox(x - .35 * s, x + .35 * s, 0, 3.8 * s, z - .35 * s, z + .35 * s, "dirt"); };
    const lampPost = (x, z) => { blk(.14, 3.4, .14, MT.iron, x, 0, z, true, { snd: "metal" }); put(box(.35, .45, .35), MT.lamp, x, 3.55, z, 0, null, { ns: 1 }); };
    const wagon = (x, z, ry) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; sc.add(g); g.updateMatrixWorld(true);
      put(box(1.7, .5, 3.6), wood("wagon", "#7a5230"), 0, 1.05, 0, 0, g); put(box(1.7, .5, .08), wood("wagon", "#7a5230"), 0, 1.5, 1.76, 0, g); put(box(1.7, .5, .08), wood("wagon", "#7a5230"), 0, 1.5, -1.76, 0, g);
      [-1, 1].forEach(sd => [1.2, -1.2].forEach(zz => { const wh = put(new T.TorusGeometry(.55, .07, 6, 18), wood("wheel", "#4a2a14"), sd * .95, .6, zz, 0, g); wh.rotation.y = Math.PI / 2; wh.updateMatrixWorld(true); }));
      const cov = put(new T.CylinderGeometry(1, 1, 3.2, 16, 1, true, 0, Math.PI), M({ color: 0xe8dcc0, side: T.DoubleSide }), 0, 1.45, 0, 0, g); cov.rotation.set(Math.PI / 2, 0, Math.PI / 2); cov.scale.set(1, 1, .9); cov.updateMatrixWorld(true);
      const c = Math.abs(Math.cos(ry)) > .5; colBox(x - (c ? 1 : 2), x + (c ? 1 : 2), 0, 2.4, z - (c ? 2 : 1), z + (c ? 2 : 1)); };
    [[-40, -6.4], [-27.5, 6.3], [-13, -6.5], [6, 6.4], [19.5, -6.4], [33, 6.5], [47, -6.3]].forEach(([x, z]) => hitch(x, z));
    [[-37, -6.6], [9.5, 6.6], [30, -6.6]].forEach(([x, z]) => trough(x, z));
    [[-51.6, -8], [-50.8, -7.4], [-28.5, -8.2], [-13.4, 8.3], [8.4, -8.4], [20.5, 8.4], [33.8, -8.1], [47.5, 8.2], [-39.3, 8.3]].forEach(([x, z]) => barrel(x, z));
    [[-29, 8.4], [-28.1, 8.1], [21, -8.3], [48.2, -8.0]].forEach(([x, z]) => crate(x, z)); crate(-28.5, 8.3, .7, .9);
    [[-54, -6.8], [-54, 6.8], [-18, -6.8], [12, 6.8], [36, -6.8], [52, 6.8], [52, -6.8], [-36, 6.8]].forEach(([x, z]) => lampPost(x, z));
    wagon(-24, 3.4, .15); wagon(36, -2.8, Math.PI / 2 + .1);
    [[-64, -30], [-60, 28], [-45, -33], [-20, 34], [6, -33], [30, 33], [55, -30], [62, 26], [64, -12], [-66, 14], [18, -26], [-8, 27], [44, 22], [-30, -25]].forEach(([x, z], i) => cactus(x, z, .8 + (i % 4) * .15));
    /* water tower behind the north side, windmill behind the south side */
    { const x = -58, z = -22; [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([a, b]) => blk(.3, 7, .3, MT.post, x + a, 0, z + b));
      put(new T.CylinderGeometry(2.6, 2.6, 3.4, 18), wood("tank", "#7a5432", true), x, 8.7, z); put(new T.ConeGeometry(2.9, 1.4, 18), MT.roof, x, 11.1, z); [7.4, 10].forEach(y => put(new T.CylinderGeometry(2.64, 2.64, .12, 18), MT.iron, x, y, z)); }
    { const x = -58, z = 24; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, m = put(box(.15, 9.4, .15), MT.iron, x + Math.cos(a) * .7, 4.6, z + Math.sin(a) * .7); m.rotation.set(Math.sin(a) * .07, 0, -Math.cos(a) * .07); m.updateMatrixWorld(true); }
      colBox(x - 1, x + 1, 0, 9, z - 1, z + 1, "metal");
      const hub = new T.Group(); hub.position.set(x + .5, 9.4, z); hub.rotation.y = Math.PI / 2; sc.add(hub); const bl = new T.Group(); hub.add(bl);
      for (let i = 0; i < 14; i++) { const b = new T.Mesh(box(.35, 1.9, .04), MT.white); b.position.y = 1.2; const p = new T.Group(); p.rotation.z = i / 14 * Math.PI * 2; p.add(b); b.rotation.y = .4; bl.add(p); }
      const tail = new T.Mesh(box(.05, 1.2, 1.8), MT.white); tail.position.set(0, 0, 1.6); hub.add(tail); G.windmill = bl; }
    /* outhouse + corral flavor */
    blk(1.4, 2.3, 1.4, wood("out", "#6a4a2a", true), 46, 0, -30); sign("☾", .5, .5, 46, 1.9, -29.29, 0, "#6a4a2a", "#2a1608");
    fence(-30, 22, -18, 22); fence(-18, 22, -18, 32); fence(-30, 32, -18, 32); fence(-30, 22, -30, 26); put(new T.CylinderGeometry(.6, .6, 1.2, 12), MT.hay, -24, .6, 27); colBox(-24.6, -23.4, 0, 1.2, 26.4, 27.6);
    for (let i = 0; i < 5; i++) put(new T.CylinderGeometry(.55, .55, 1.0, 12), MT.hay, -24 + (i % 3) * 1.2 - 1, .5 + (i > 2 ? 1 : 0), 30.5).rotation.z = Math.PI / 2;

    /* ---- bottle challenge (behind the livery stable): ring the START gong, shoot all 12 bottles, best time wins ---- */
    { const gx = -46, gz = 33; G.chalTip = [gx, gz - 10.5];
      sign("BOTTLE CHALLENGE", 5, 1, gx, 2.6, gz - 9.12, Math.PI, "#5a1a10", "#ffe29a"); blk(.2, 2.2, .2, MT.post, gx - 2.4, 0, gz - 9.05); blk(.2, 2.2, .2, MT.post, gx + 2.4, 0, gz - 9.05);
      sign("Shoot the gong · then every bottle", 4.2, .45, gx, 1.6, gz - 9.12, Math.PI, "#e8d4a8", "#3a1c0a");
      /* firing line */ put(box(10, .02, .25), MT.white, gx, .02, gz - 10.5, 0, null, { ns: 1 });
      const board = sign("BEST TIMES", 2.6, .55, gx + 7.2, 3.0, gz - 9.3, Math.PI - .35, "#1d2a1d", "#e8f0d8");
      const lb = new T.Mesh(new T.PlaneGeometry(2.6, 2.2), M({ map: (G.lbTex = cvT(512, 432, () => {})), roughness: .9 })); lb.position.set(gx + 7.2, 1.6, gz - 9.3); lb.rotation.y = Math.PI - .35; sc.add(lb);
      blk(.2, 3.2, .2, MT.post, gx + 6, 0, gz - 8.8); blk(.2, 3.2, .2, MT.post, gx + 8.4, 0, gz - 9.6); drawLB();
      /* gong */ const gong = new T.Mesh(new T.CylinderGeometry(.55, .55, .06, 24), M({ color: 0xc8963e, roughness: .3, metalness: .9 })); gong.rotation.x = Math.PI / 2; gong.position.set(gx - 6, 1.6, gz - 8.6); sc.add(gong);
      put(box(1.6, .12, .12), MT.post, gx - 6, 2.3, gz - 8.6); blk(.12, 2.4, .12, MT.post, gx - 6.75, 0, gz - 8.6); blk(.12, 2.4, .12, MT.post, gx + -5.25, 0, gz - 8.6);
      G.gong = { m: gong, a: 0, v: 0 }; G.shoot.push({ kind: "gong", c: gong.position.clone(), r: .6 });
      fence(gx - 8, gz + 1, gx + 8, gz + 1); fence(gx - 4, gz - 3, gx + 4, gz - 3);
      [[gx - 7, gz - 1, .8], [gx + 6.5, gz - 1.5, .9], [gx - 1, gz + 5, .9]].forEach(([x, z, s]) => crate(x, z, s));
      barrel(gx + 2.5, gz - 1.6);
      const spots = []; for (let i = 0; i < 6; i++) spots.push([gx - 7 + i * 2.8, 1.12, gz + 1]); for (let i = 0; i < 3; i++) spots.push([gx - 3 + i * 3, 1.12, gz - 3]);
      spots.push([gx - 7, .82, gz - 1], [gx + 6.5, .92, gz - 1.5], [gx + 2.5, 1.07, gz - 1.6]);
      G.chal = { spots, on: false, t0: 0, left: 0, best: (API().myBest && API().myBest()) || 0 };
      /* a few practice bottles stay on the near fence when no challenge is running */
    }

    /* ---- tumbleweeds ---- */
    for (let i = 0; i < 4; i++) { const g = new T.Group(); const pos = [], n = 70; for (let k = 0; k < n; k++) { const a = new T.Vector3().randomDirection ? new T.Vector3().randomDirection() : new T.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); const b = a.clone().add(new T.Vector3(rnd(-.6, .6), rnd(-.6, .6), rnd(-.6, .6))).normalize(); pos.push(a.x * .45, a.y * .45, a.z * .45, b.x * .45, b.y * .45, b.z * .45); }
      const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x8a6a3a }))); sc.add(g);
      G.weeds.push({ g, x: rnd(-60, 60), z: rnd(-5, 5), vx: rnd(1.2, 2.6), ph: rnd(0, 6), y: .45 }); }

    /* ---- batch static meshes per material ---- */
    batch(T, sc, statics);

    /* ---- first-person revolver ---- */
    { const vs = new T.Scene(), vc = new T.PerspectiveCamera(62, gw / gh, .01, 10); vs.add(vc); G.vs = vs; G.vc = vc;
      vs.add(new T.HemisphereLight(0xfff0dc, 0x6a4a2a, .9)); const vl = new T.DirectionalLight(0xffe2b8, 1.1); vl.position.set(-1, 2, 1); vs.add(vl);
      const vm = new T.Group(); vc.add(vm); vm.scale.setScalar(.78); G.vm = vm; const gun = new T.Group(); vm.add(gun); G.gun = gun;
      const blued = M({ color: 0x4a4c56, roughness: .3, metalness: .8 }), grip = M({ map: plank("#6a3a1a", [1, 1], true), roughness: .6 }), skin = M({ color: 0xa8704c, roughness: .8 }), sleeve = M({ color: 0x5a3a24, roughness: .9 });
      const P = (geo, m, x, y, z, rx, par) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; (par || gun).add(o); return o; };
      P(new T.CylinderGeometry(.013, .013, .32, 12), blued, 0, .035, -.21, Math.PI / 2);
      P(new T.CylinderGeometry(.03, .03, .26, 12), blued, 0, .022, -.18, Math.PI / 2).scale.set(1, 1, .6);
      const cyl = new T.Group(); cyl.position.set(0, .028, -.03); gun.add(cyl); P(new T.CylinderGeometry(.045, .045, .085, 12), blued, 0, 0, 0, Math.PI / 2, cyl);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(new T.CylinderGeometry(.011, .011, .088, 6), M({ color: 0x111111 }), Math.cos(a) * .028, Math.sin(a) * .028, 0, Math.PI / 2, cyl); }
      G.cyl = cyl; P(box(.03, .06, .12), blued, 0, .015, .035); P(box(.012, .03, .03), blued, 0, .068, .075).rotation.x = -.5;
      P(box(.034, .12, .06), grip, 0, -.06, .095, -.35); P(new T.TorusGeometry(.028, .005, 6, 12, Math.PI), blued, 0, -.015, .03, 0).rotation.z = Math.PI;
      P(box(.004, .012, .004), blued, 0, .058, -.34);
      const hand = new T.Group(); hand.position.set(0, -.05, .11); gun.add(hand); P(box(.075, .07, .095), skin, .005, 0, 0, 0, hand); P(box(.03, .03, .07), skin, -.035, .02, -.05, 0, hand);
      P(new T.CylinderGeometry(.045, .055, .35, 10), sleeve, .02, -.07, .24, Math.PI / 2 - .25, hand);
      const fl = new T.Sprite(new T.SpriteMaterial({ map: cvT(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,220,1)"); r.addColorStop(.3, "rgba(255,190,80,.9)"); r.addColorStop(1, "rgba(255,120,20,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(255,230,150,.8)"; g.lineWidth = 6; for (let i = 0; i < 6; i++) { const a = i / 6 * 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); } }), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      fl.position.set(0, .035, -.4); fl.scale.set(.22, .22, 1); fl.visible = false; gun.add(fl); G.flash = fl;
      const ml = new T.PointLight(0xffb060, 0, 9, 2); sc.add(ml); G.mlight = ml;
      gun.traverse(o => { if (o.isMesh) { o.renderOrder = 10; } });
    }
    G.ray = new T.Raycaster();
    G.ammo = 6; G.reloading = 0; G.lastShot = 0; G.recoil = 0; G.bob = 0; G.hp = 100;
    G.puffTex = cvT(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(210,180,140,.9)"); r.addColorStop(1, "rgba(210,180,140,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    G.holeMat = new T.MeshBasicMaterial({ map: cvT(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, "rgba(10,6,2,1)"); r.addColorStop(.35, "rgba(20,10,4,.9)"); r.addColorStop(.6, "rgba(60,40,20,.4)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    G.shardMat = MT.bottle; G.MT = MT;
    /* practice bottles in the saloons */
    G.bottleSpots.forEach(s => spawnBottle(s, "free"));
    G.chalPractice();
    spawnPlayer(); drawAmmo();
  }
  /* merge static meshes that share a material into one mesh (keeps draw calls low) */
  function batch(T, sc, _) {
    const groups = new Map(), kill = [];
    sc.updateMatrixWorld(true);
    sc.traverse(o => { if (!o.isMesh || !o.userData.st || o.isSkinnedMesh || o.material.transparent || o.material.map && o.material.map.isCanvasTexture && o.material.map.image && o.material.map.image.width === 1024) return;
      const g = o.geometry; if (!g.attributes.uv || !g.attributes.normal) return;
      const k = o.material.uuid + (o.castShadow ? "s" : "n"); if (!groups.has(k)) groups.set(k, { mat: o.material, cs: o.castShadow, list: [] }); groups.get(k).list.push(o); });
    for (const { mat, cs, list } of groups.values()) {
      if (list.length < 2) continue;
      let nv = 0, ni = 0; list.forEach(o => { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; });
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0; const v = new T.Vector3(), nm = new T.Matrix3();
      list.forEach(o => { const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; nm.getNormalMatrix(o.matrixWorld);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], (vo + i) * 3); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3); uv.set([u.getX(i), u.getY(i)], (vo + i) * 2); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; else for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
        io += g.index ? g.index.count : p.count; vo += p.count; kill.push(o); });
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pos, 3)); geo.setAttribute("normal", new T.BufferAttribute(nor, 3)); geo.setAttribute("uv", new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const m = new T.Mesh(geo, mat); m.castShadow = cs; m.receiveShadow = true; m.matrixAutoUpdate = false; sc.add(m);
    }
    kill.forEach(o => { o.parent && o.parent.remove(o); o.geometry.dispose(); });
  }

  /* ---------------- bottles + the challenge ---------------- */
  function spawnBottle(spot, kind) {
    const T = THREE, g = new T.Group(), amber = Math.random() < .35, m = new T.Mesh(new T.CylinderGeometry(.06, .075, .26, 10), amber ? G.MT.amber : G.MT.bottle);
    m.position.y = .13; g.add(m); const nk = new T.Mesh(new T.CylinderGeometry(.025, .045, .11, 8), m.material); nk.position.y = .31; g.add(nk);
    if (spot.grp) { g.position.set(spot.lx, spot.ly, spot.lz); spot.grp.add(g); } else { g.position.set(spot[0], spot[1], spot[2]); G.scene.add(g); }
    g.updateMatrixWorld(true); const c = new T.Vector3(); g.getWorldPosition(c); c.y += .16;
    const b = { g, c, r: .16, kind, spot, alive: true, amber }; G.bottles.push(b); return b;
  }
  function breakBottle(b, dir) {
    b.alive = false; b.g.parent && b.g.parent.remove(b.g); SFX.glass();
    const T = THREE; for (let i = 0; i < 14; i++) { const s = new T.Mesh(new T.TetrahedronGeometry(.03 + Math.random() * .03), b.amber ? G.MT.amber : G.MT.bottle); s.position.copy(b.c); G.scene.add(s);
      G.parts.push({ o: s, v: new T.Vector3((Math.random() - .5) * 3 + dir.x * 2, Math.random() * 3 + 1, (Math.random() - .5) * 3 + dir.z * 2), life: 1.6, rot: new T.Vector3(Math.random() * 9, Math.random() * 9, 0), g: 1 }); }
    if (b.kind === "free") setTimeout(() => { if (G && G.bottles) spawnBottle(b.spot, "free"); }, 25000);
    if (b.kind === "chal") { const C = G.chal; C.left--; if (C.left <= 0) chalDone(); }
    if (b.kind === "prac" && !G.bottles.some(q => q.kind === "prac" && q.alive)) setTimeout(() => G && G.chalPractice(), 4000);
  }
  function chalStart() {
    const C = G.chal; if (C.on) return;
    G.bottles.filter(b => b.kind === "chal" || b.kind === "prac").forEach(b => { b.alive = false; b.g.parent && b.g.parent.remove(b.g); });
    C.spots.forEach(s => spawnBottle(s, "chal")); C.on = true; C.left = C.spots.length; C.t0 = performance.now(); banner("Go!", `${C.spots.length} bottles`);
  }
  function chalDone() {
    const C = G.chal, t = performance.now() - C.t0; C.on = false; SFX.ding();
    const best = !C.best || t < C.best; banner((t / 1000).toFixed(2) + "s", best ? "New best time!" : `Your best: ${(C.best / 1000).toFixed(2)}s`);
    if (!G.ses.best || t < G.ses.best) G.ses.best = Math.round(t);
    if (best) { C.best = t; try { API().saveBest && API().saveBest(Math.round(t)); } catch (_) {} setTimeout(drawLB, 1500); }
    setTimeout(() => G && G.chalPractice(), 2500);
  }
  function drawLB() {
    if (!G || !G.lbTex) return; const c = G.lbTex.image, g = c.getContext("2d"), P = API().prefs ? API().prefs() : {}, me = API().me ? API().me() : null;
    g.fillStyle = "#1d2a1d"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#6a4a2a"; g.lineWidth = 14; g.strokeRect(0, 0, c.width, c.height);
    const rows = Object.entries(P).filter(([, q]) => q && q.wwBest && q.wwBest.t > 0).map(([id, q]) => ({ id, t: q.wwBest.t })).sort((a, b) => a.t - b.t).slice(0, 7);
    g.font = "30px Georgia, serif"; g.fillStyle = "#e8f0d8"; g.textBaseline = "middle";
    if (!rows.length) { g.textAlign = "center"; g.fillText("Nobody yet.", c.width / 2, c.height / 2 - 20); g.fillText("Be the first!", c.width / 2, c.height / 2 + 24); }
    rows.forEach((r, i) => { const y = 50 + i * 54; g.textAlign = "left"; g.fillStyle = r.id === me ? "#ffd76a" : "#e8f0d8"; let n = (API().nm ? API().nm(r.id) : r.id); if (n.length > 16) n = n.slice(0, 15) + "…"; g.fillText(`${i + 1}. ${n}`, 28, y); g.textAlign = "right"; g.fillText((r.t / 1000).toFixed(2) + "s", c.width - 28, y); });
    G.lbTex.needsUpdate = true;
  }

  /* ---------------- player ---------------- */
  /* spawn points all over town [x, z, facing]; pickSpawn(others) = never within 15 m of anyone or in their line of sight,
     farthest from everyone (with a little randomness), never the same spot twice in a row (PvP will pass the other players in) */
  const SPAWNS = [[-56, 0, -Math.PI / 2], [-56, -4, -Math.PI / 2], [48, 0, Math.PI / 2], [46, 4, Math.PI / 2], [-40, -14, Math.PI], [-37.5, 14, 0], [-12.5, -14, Math.PI], [9, -14, Math.PI],
    [19.5, 14, 0], [5.5, 14, 0], [-54, 27, Math.PI], [-24, 20, 0], [-58, -12, -Math.PI / 2], [-58, 16, -Math.PI / 2], [60, -20, Math.PI / 2], [60, 22, Math.PI / 2], [0, -30, Math.PI], [30, 30, 0], [-30, -32, Math.PI]];
  function pickSpawn(others) {
    others = others || []; const sees = (a, b) => { if (!G.cols) return true; const T = THREE, o = new T.Vector3(a[0], 1.6, a[1]), d = new T.Vector3(b[0] - a[0], 0, b[1] - a[1]), L = d.length(); d.normalize();
      for (const c of G.cols) { if (c.y1 < 1.6 || c.y0 > 1.6) continue; const r = rayBox(o, d, c); if (r && r.t < L) return false; } return true; };
    let best = null, bs = -1; SPAWNS.forEach((sp, i) => { if (i === G.lastSpawn && SPAWNS.length > 1) return;
      const dmin = others.length ? Math.min(...others.map(o => Math.hypot(o[0] - sp[0], o[1] - sp[1]))) : 99;
      if (others.length && (dmin < 15 || others.some(o => sees(o, sp)))) return; const sc = dmin + Math.random() * 12; if (sc > bs) { bs = sc; best = i; } });
    if (best == null) best = Math.floor(Math.random() * SPAWNS.length); G.lastSpawn = best; return SPAWNS[best]; }
  function spawnPlayer() { const sp = G.started ? pickSpawn([]) : SPAWNS[0]; G.p = { x: sp[0], y: 0, z: sp[1], vy: 0, ground: true }; G.yaw = sp[2]; G.pitch = 0; G.ammo = 6; G.reloading = 0; G.aimToggle = false; G.aimHeld = false; }
  function groundAt(x, z, feet, r) {
    let g = 0; for (const c of G.cols) { if (c.y1 > feet + .48) continue; if (x + r * .3 < c.x0 || x - r * .3 > c.x1 || z + r * .3 < c.z0 || z - r * .3 > c.z1) continue; if (c.y1 > g) g = c.y1; } return g;
  }
  function collide(p, r) {
    const feet = p.y; for (let it = 0; it < 2; it++) for (const c of G.cols) {
      if (c.y1 <= feet + .46 || c.y0 >= feet + 1.75) continue;
      const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1)), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { const pushes = [[c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); p.x += pushes[0][0]; p.z += pushes[0][1]; }
    }
    const B = G.bounds; p.x = Math.max(B.x0, Math.min(B.x1, p.x)); p.z = Math.max(B.z0, Math.min(B.z1, p.z));
  }
  function stepPlayer(dt) {
    const p = G.p, k = G.keys; let fx = 0, fz = 0, run = false;
    const A = G.act; if (A.fwd || k.ArrowUp) fz += 1; if (A.back || k.ArrowDown) fz -= 1; if (A.left || k.ArrowLeft) fx -= 1; if (A.right || k.ArrowRight) fx += 1; if (A.run) run = true;
    const st = Object.values(G.touches).find(q => q.kind === "stick"); if (st && st.mx != null) { fx += st.mx; fz -= st.my; if (Math.hypot(st.mx, st.my) > .92) run = true; }
    const ads = G.adsK > .5, len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const sp = ads ? 2.6 : run ? 7.6 : 4.6, sy = Math.sin(G.yaw), cy = Math.cos(G.yaw);
    const vx = (-sy * fz + cy * fx) * sp, vz = (-cy * fz - sy * fx) * sp;
    p.vx = (p.vx || 0) + (vx - (p.vx || 0)) * Math.min(1, dt * 12); p.vz = (p.vz || 0) + (vz - (p.vz || 0)) * Math.min(1, dt * 12);
    p.x += p.vx * dt; p.z += p.vz * dt; collide(p, .32);
    const lad = (G.ladders || []).find(l => p.x > l.x0 && p.x < l.x1 && p.z > l.z0 && p.z < l.z1 && p.y < l.top);
    if (lad && (fz > .2 || (G.onLad && fz < -.2))) {
      const prev = p.y; p.y = Math.max(0, Math.min(lad.top, p.y + (fz > 0 ? 2.8 : -2.8) * dt)); p.vy = 0; p.ground = false; G.onLad = true;
      if (Math.floor(prev / .32) !== Math.floor(p.y / .32)) SFX.step(true); G.jumpQ = false; G.moving = 0; return;
    }
    G.onLad = !!lad && G.onLad;
    const g = groundAt(p.x, p.z, p.y, .32);
    if (G.jumpQ && p.ground) { p.vy = 5.2; p.ground = false; } G.jumpQ = false;
    p.vy -= 16 * dt; p.y += p.vy * dt; if (p.y <= g) { if (!p.ground && p.vy < -4) SFX.step(g > .1); p.y = g; p.vy = 0; p.ground = true; } else if (p.y > g + .05) p.ground = false;
    if (p.ground && g - p.y > -.5 && g > p.y) p.y = g;
    const moving = Math.hypot(p.vx, p.vz); if (p.ground && moving > .5) { const prev = G.bob; G.bob += dt * moving * 1.9; if (Math.floor(prev / Math.PI) !== Math.floor(G.bob / Math.PI)) SFX.step(g > .1); }
    G.moving = moving;
  }

  /* ---------------- shooting ---------------- */
  function reload() { if (G.reloading || G.ammo >= 6) return; G.reloading = 1.7; SFX.reload(); if (G.mode === "pvp") nsend({ t: "rl" }); }
  function fire() {
    if (G.state !== "play") return; const now = performance.now();
    if (G.reloading) return; if (now - G.lastShot < 260) return; if (G.ammo <= 0) { SFX.click(); reload(); return; }
    G.lastShot = now; G.ammo--; drawAmmo(); G.recoil = 1; G.flashT = .05; SFX.shot(); sesAdd("shots", 1);
    const T = THREE, cam = G.cam, dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const spread = G.adsK > .5 ? .0015 : (.006 + Math.min(1, G.moving / 6) * .02 + (G.p.ground ? 0 : .03));
    dir.x += (Math.random() - .5) * spread; dir.y += (Math.random() - .5) * spread; dir.z += (Math.random() - .5) * spread; dir.normalize();
    const o = new T.Vector3(); cam.getWorldPosition(o);
    if (G.mode === "pvp") { nsend({ t: "shot", d: [dir.x, dir.y, dir.z] }); G.prot = 0; }
    let best = { t: 300, kind: "none" };
    if (G.mode === "pvp" && G.net) for (const R of G.net.pl.values()) { if (!R.alive || !R.root || R.dying) continue; const p = R.root.position;
      for (const [y, r] of [[1.68, .22], [1.2, .42], [.6, .4]]) { const t = raySphere(o, dir, { x: p.x, y: p.y + y, z: p.z }, r); if (t != null && t < best.t) best = { t, kind: "player" }; } }
    for (const s of G.shoot) { const t = raySphere(o, dir, s.c, s.r); if (t != null && t < best.t) best = { t, kind: s.kind, s }; }
    for (const b of G.bottles) { if (!b.alive) continue; const t = raySphere(o, dir, b.c, b.r); if (t != null && t < best.t) best = { t, kind: "bottle", b }; }
    for (const w of G.weeds) { const t = raySphere(o, dir, w.g.position, .45); if (t != null && t < best.t) best = { t, kind: "weed", w }; }
    for (const c of G.cols) { const r = rayBox(o, dir, c); if (r && r.t < best.t) best = { t: r.t, kind: "wall", c, n: r.n }; }
    if (dir.y < 0) { const t = -o.y / dir.y; if (t < best.t) best = { t, kind: "ground", n: new T.Vector3(0, 1, 0) }; }
    const hp = o.clone().addScaledVector(dir, best.t);
    if (["bottle", "bell", "gong", "weed"].includes(best.kind)) sesAdd("hits", 1);
    if (best.kind === "bottle") { breakBottle(best.b, dir); hitMark(); sesAdd("bottles", 1); }
    else if (best.kind === "bell") { SFX.bell(); G.bell.v += 3; hitMark(); }
    else if (best.kind === "gong") { SFX.metal(); G.gong.v += 4; hitMark(); if (G.mode !== "pvp") chalStart(); }
    else if (best.kind === "weed") { best.w.vy = 4; best.w.vx *= -1.2; puff(hp, .6); hitMark(); }
    else if (best.kind === "wall") { puff(hp, .35); hole(hp, best.n); (SFX[best.c.mat] || SFX.wood)(); }
    else if (best.kind === "ground") { puff(hp, .5); SFX.dirt(); }
  }
  function raySphere(o, d, c, r) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc; if (h < 0) return null; const t = -b - Math.sqrt(h); return t > 0 ? t : null; }
  function rayBox(o, d, c) {
    let t0 = 0, t1 = 1e9, n = null; const ax = [["x", c.x0, c.x1], ["y", c.y0, c.y1], ["z", c.z0, c.z1]];
    for (const [k, lo, hi] of ax) { const od = o[k], dd = d[k]; if (Math.abs(dd) < 1e-9) { if (od < lo || od > hi) return null; continue; }
      let a = (lo - od) / dd, b = (hi - od) / dd, s = -1; if (a > b) { [a, b] = [b, a]; s = 1; } if (a > t0) { t0 = a; n = [k, s]; } if (b < t1) t1 = b; if (t0 > t1) return null; }
    if (!n) return null; const N = new THREE.Vector3(); N[n[0]] = n[1]; return { t: t0, n: N };
  }
  function hitMark(hs) { const h = G.hud.querySelector("#wwHit"); h.classList.remove("on"); h.classList.toggle("hs", !!hs); void h.offsetWidth; h.classList.add("on"); }
  function puff(p, s) { const T = THREE; for (let i = 0; i < 3; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: G.puffTex, transparent: true, depthWrite: false, opacity: .8 })); sp.position.copy(p); sp.scale.setScalar(s * .5); G.scene.add(sp);
    G.parts.push({ o: sp, v: new T.Vector3((Math.random() - .5) * .8, Math.random() * .8 + .3, (Math.random() - .5) * .8), life: .9, grow: s * 1.4, g: 0 }); } }
  function hole(p, n) { const T = THREE, m = new T.Mesh(new T.PlaneGeometry(.09, .09), G.holeMat); m.position.copy(p).addScaledVector(n, .01); m.lookAt(p.clone().add(n)); G.scene.add(m); G.decals.push(m); if (G.decals.length > 40) { const o = G.decals.shift(); G.scene.remove(o); o.geometry.dispose(); } }
  function drawAmmo() { const a = G.hud && G.hud.querySelector("#wwAmmo"); if (!a) return; let h = ""; for (let i = 0; i < 6; i++) h += `<i class="${i < G.ammo ? "" : "off"}"></i>`; a.innerHTML = h + (G.reloading ? `<span>RELOADING</span>` : G.ammo === 0 ? `<span>R to reload</span>` : ""); }
  let bannerT = 0;
  function banner(a, b) { const m = G.hud.querySelector("#wwMsg"); if (!m) return; m.innerHTML = esc(a) + (b ? `<small>${esc(b)}</small>` : ""); m.classList.add("on"); clearTimeout(bannerT); bannerT = setTimeout(() => m.classList.remove("on"), 2600); }

  /* ---------------- HUD: kill feed (max 4 lines, oldest slides up and fades), live count, BB up/down ---------------- */
  function feed(html, mine) {
    const f = G && G.hud.querySelector("#wwFeed"); if (!f) return; const d = document.createElement("div"); d.innerHTML = html; if (mine) d.className = "me"; f.appendChild(d);
    const drop = el => { if (!el || el.classList.contains("out")) return; el.classList.add("out"); setTimeout(() => el.remove(), 380); };
    const live = [...f.children].filter(x => !x.classList.contains("out")); if (live.length > 4) drop(live[0]);
    setTimeout(() => drop(d), 6500);
  }
  /* PvP will call this for every kill: killer/victim names, headshot flag, BB moved */
  function killFeed(killer, victim, hs, bb, mine) { feed(`<b>${esc(killer)}</b> <span style="opacity:.7">shot</span> ${esc(victim)}${hs ? ` <span class="hs">· headshot</span>` : ""}${bb ? ` · ${Math.round(bb).toLocaleString()} BB` : ""}`, mine); }
  function setLive(n) { const e = G && G.hud.querySelector("#wwLive b"); if (e) e.textContent = n; }
  function setBB(v) { const e = G && G.hud.querySelector("#wwBB"); if (!e) return; v = Math.round(v || 0); e.className = "wwchip wwbb" + (v > 0 ? " up" : v < 0 ? " dn" : ""); e.innerHTML = `<b>${v > 0 ? "+" : v < 0 ? "−" : "+"}${Math.abs(v).toLocaleString()}</b> BB`; }
  function sesAdd(k, v) { G.ses[k] = (G.ses[k] || 0) + v; G.sesD[k] = (G.sesD[k] || 0) + v; if (k === "bb") setBB(G.ses.bb); }
  /* all-time stats: prefs.wwStats, written in one small update on pause / menu / exit / every minute (only what changed) */
  function saveStats() {
    if (!G || !G.sesD) return; const d = G.sesD; if (!Object.keys(d).some(k => d[k])) return;
    const b = (API().stats && API().stats()) || {}, o = Object.assign({}, b);
    for (const k in d) o[k] = Math.round(((Number(b[k]) || 0) + d[k]) * 100) / 100;
    G.sesD = {}; try { API().saveStats && API().saveStats(o); } catch (_) {}
  }


  /* =====================================================================================================
     PvP (Oct 28): the live match server (server/index.js on Cloud Run) decides hits, kills and money.
     This page: picks a table (1k / 5k / 10k buy-in), writes the buy-in, sends its own movement 20×/s and its shots,
     draws everyone else as the skin they have equipped (interpolated 110 ms behind), plus emotes, name tags, tracers,
     health, the cash-out at the bank, the kill feed and the BB tracker. One hitbox for everyone lives on the server;
     every character is scaled so its head sits where that hitbox's head is.
     ===================================================================================================== */
  const NETV = 1, INTERP = 110;
  async function srvStatus() {
    try { const r = await fetch(API().server + "/status", { cache: "no-store" }); const j = await r.json(); G.server = { up: !!j.up, checked: true, rooms: j.rooms || [], n: (j.rooms || []).reduce((a, x) => a + x.n, 0) }; }
    catch (_) { G.server = { up: false, checked: true, n: 0, rooms: [] }; }
    if (G && G.state === "menu" && G.ready) showMenu(false);
  }
  function showTiers(msg) {
    G.state = "menu"; const bal = API().balance ? API().balance() : 0, rooms = (G.server && G.server.rooms) || [];
    const tiers = [1000, 5000, 10000];
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Join game</h2>
      <p style="margin:0 0 6px">Kill someone and take their stack. If they had no kills yet you take all of it, if they had one or more you take half. Cash out by holding still at the <b>bank</b> for 5 seconds. Quitting mid-fight counts as dying.</p>
      <div class="wwtiers">${tiers.map(t => { const n = (rooms.find(r => r.tier === t) || {}).n || 0; return `<button class="${bal < t ? "off" : ""}" data-wwtier="${t}" ${bal < t ? "disabled" : ""}><b>${t.toLocaleString()} BB</b><small>${n} in match</small></button>`; }).join("")}</div>
      <p style="opacity:.75;margin:6px 0 0">Your balance: <b>${bal.toLocaleString()} BB</b>${msg ? ` · <span style="color:#ffb3a0">${esc(msg)}</span>` : ""}</p>
      <div class="wwrow"><button data-ww="menu">Back</button></div></div></div>`;
  }
  function netMsg(t) { const e = G.ui.querySelector(".wwnetmsg"); if (e) e.textContent = t; }
  function showBusy(t) { G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>BiggieTown</h2><p class="wwnetmsg">${esc(t)}</p></div></div>`; }
  /* connect (or reuse the connection) and sign in with the app's token */
  function netOpen() {
    return new Promise((res, rej) => {
      const N = G.net; if (N && N.ws && N.ws.readyState === 1 && N.authed) return res(N);
      const ws = new WebSocket(API().server.replace(/^http/, "ws") + "/ws"); const net = G.net = Object.assign(G.net || {}, { ws, authed: false, pl: N && N.pl || new Map(), off: 0, rtt: 120 });
      let done = false; const to = setTimeout(() => { if (!done) { done = true; rej(new Error("The server didn't answer.")); try { ws.close(); } catch (_) {} } }, 9000);
      ws.onopen = async () => { const tok = await API().token(); ws.send(JSON.stringify({ t: "hello", tok, v: NETV })); };
      ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.t === "auth") { if (done) return; done = true; clearTimeout(to); if (!m.ok) { rej(new Error(m.why || "Not allowed.")); return; } net.authed = true; net.pid = m.pid; net.name = m.name; net.active = m.active; net.activeTier = m.tier; res(net); return; }
        onNet(m); };
      ws.onclose = () => { if (!done) { done = true; clearTimeout(to); rej(new Error("Couldn't reach the server.")); } onNetClose(ws); };
      ws.onerror = () => {};
    });
  }
  const nsend = m => { const ws = G.net && G.net.ws; if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  async function joinTier(tier) {
    showBusy("Connecting…");
    try {
      const net = await netOpen();
      if (net.active) { showBusy("Back into your match…"); nsend({ t: "join", buy: null }); return; }
      if ((API().balance ? API().balance() : 0) < tier) return showTiers("Not enough BB for that table.");
      showBusy(`Paying the ${tier.toLocaleString()} BB buy-in…`);
      const id = await API().buyIn(tier); net.buyId = id; net.tierWant = tier; nsend({ t: "join", buy: id });
    } catch (e) { showTiers(e.message || "Couldn't join."); }
  }
  function onNetClose(ws) {
    const net = G && G.net; if (!net || net.ws !== ws) return; net.authed = false;
    if (G.mode === "pvp" && !net.leaving) { /* dropped: reconnect and resume (the server keeps the run for 10 s) */
      banner("Reconnecting…", ""); let tries = 0; const again = () => { if (!G || G.mode !== "pvp") return; tries++;
        netOpen().then(n => { if (n.active) nsend({ t: "join", buy: null }); else pvpEnd(); }).catch(() => { if (tries < 4) setTimeout(again, 1500); else { banner("Lost the connection", "You'll be paid out if your run ended"); pvpEnd(); } }); };
      setTimeout(again, 600);
    }
  }
  function onNet(m) {
    const N = G.net, T = THREE;
    switch (m.t) {
      case "welcome": {
        N.n = m.n; N.tier = m.tier; N.stack = m.stack; N.bank = m.bank; N.kills = m.kills || 0; N.hp = m.hp; N.leaving = false; N.active = false;
        for (const R of N.pl.values()) rmRemote(R); N.pl.clear(); (m.players || []).forEach(addRemote);
        G.mode = "pvp"; G.chal && G.chal.on && (G.chal.on = false);
        const s = m.spawn; G.p = { x: s[0], y: s[1], z: s[2], vy: 0, ground: true }; G.yaw = s[3]; G.pitch = 0; G.ammo = 6; G.reloading = 0; drawAmmo();
        G.prot = performance.now() + (m.prot || 0); N.startStack = m.tier; setBB(N.stack - N.tier);
        if (!N.pingT) N.pingT = setInterval(() => nsend({ t: "ping", c: Date.now(), rtt: N.rtt }), 2000);
        nsend({ t: "ping", c: Date.now() }); hudPvp(true); play(); banner("Draw!", `${m.tier.toLocaleString()} BB table · cash out at the bank`); return;
      }
      case "err": showTiers(m.why); return;
      case "pong": { const r = Date.now() - m.c; N.rtt = N.rtt ? N.rtt * .7 + r * .3 : r; N.off = m.s + r / 2 - Date.now(); return; }
      case "add": addRemote(m); return;
      case "rm": { const R = N.pl.get(m.n); if (R) { R.gone = true; if (!R.dying) rmRemote(R), N.pl.delete(m.n); } return; }
      case "s": {
        const seen = new Set();
        for (const e of m.p) { const [n, x, y, z, yaw, pitch, fl, stack] = e; if (n === N.n) { if (stack !== N.stack) { N.stack = stack; setBB(stack - N.tier); } continue; }
          let R = N.pl.get(n); if (!R) R = addRemote({ n, name: "…", skin: null, stack });
          R.stack = stack; R.flags = fl; R.snaps.push([m.ts, x, y, z, yaw, pitch]); if (R.snaps.length > 40) R.snaps.shift(); R.alive = true; seen.add(n); }
        for (const R of N.pl.values()) if (!seen.has(R.n) && !R.dying) R.alive = false;
        setLive(m.live); N.hp = m.hp; drawHp(); N.cash = m.cash || 0;
        if (m.ammo >= 0 && !G.reloading && m.ammo !== G.ammo) { G.ammo = m.ammo; drawAmmo(); }
        return;
      }
      case "stack": N.stack = m.stack; setBB(m.stack - N.tier); return;
      case "pos": G.p.x = m.x; G.p.y = m.y; G.p.z = m.z; return;
      case "fx": { const R = N.pl.get(m.n); if (!R || !R.root) return; const from = R.root.position.clone().add(new T.Vector3(0, 1.45, 0)); tracer(from, new T.Vector3(...m.e));
        const d = from.distanceTo(G.cam.position); G.vmul = Math.max(.08, Math.min(1, 9 / (d + 4))); SFX.shot(); G.vmul = 1; if (R.u) R.flashT = .06; return; }
      case "hit": { N.hp = m.hp; drawHp(); dmgFx(m.from); return; }
      case "hc": { if (m.prot) { banner("", "Spawn protected"); return; } hitMark(m.hs); if (m.kill) SFX.ding(); sesAdd("hits", 1); return; }
      case "kill": { const mine = m.kn === N.n || m.vn === N.n; killFeed(m.k, m.v, m.hs, m.amt, mine); if (m.kn === N.n) { N.kills++; sesAdd("kills", 1); banner(m.hs ? "Headshot" : "Got 'em", `+${m.amt.toLocaleString()} BB`); }
        const R = N.pl.get(m.vn); if (R) R.dying = performance.now(); return; }
      case "dead": { G.mode = "dead"; sesAdd("deaths", 1); hudPvp(false); G.state = "menu";
        G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Shot down</h2><p>${m.by ? `<b>${esc(m.by)}</b> got you and took <b>${m.took.toLocaleString()} BB</b>.` : "You're out."}</p><p>You walk out with <b>${m.keep.toLocaleString()} BB</b>.</p><p class="wwnetmsg" style="opacity:.7">Paying out…</p></div></div>`; return; }
      case "out": { const net = m.amt - (m.buy || N.tier || 0); sesAdd("bb", net); sesAdd("matches", 1); saveStats(); pvpEnd(true);
        const why = m.reason === "cash" ? "Cashed out" : m.reason === "dead" ? "Walked out" : "Left the match";
        G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>${why}</h2>
          <p style="font:400 30px Rye,Georgia,serif;color:${net >= 0 ? "#9dffb0" : "#ffb3a0"};margin:4px 0">${net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString()} BB</p>
          <p>${m.amt.toLocaleString()} BB paid to your balance · ${m.kills || 0} kill${m.kills === 1 ? "" : "s"}</p>
          <div class="wwgrid"><button class="pri" data-wwtier="${m.buy || N.tier}">Buy back in</button><button data-ww="menu">Main menu</button></div></div></div>`; return; }
      case "cash": { if (!m.on && m.why === "hit") banner("", "Cash out cancelled: you got hit"); G.cashing = !!m.on; return; }
      case "emo": { if (m.n === N.n) { startOwnEmote(m.id); return; } const R = N.pl.get(m.n); if (R) R.emo = { id: m.id, t0: performance.now() }; return; }
    }
  }
  function pvpEnd(keepConn) {
    const N = G.net; G.mode = "lobby"; hudPvp(false); G.cashing = false; if (N) { for (const R of N.pl.values()) rmRemote(R); N.pl.clear(); }
    setLive(1); setBB(G.ses.bb); stopOwnEmote(); if (!keepConn && N && N.ws) { N.leaving = true; try { N.ws.close(); } catch (_) {} }
  }
  /* leave from the pause menu: the server keeps your body 10 s (or counts it as a death if you were hit in the last 10 s) */
  function leaveMatch() { const N = G.net; if (N) N.leaving = true; try { N && N.ws && N.ws.close(); } catch (_) {} pvpEnd(true);
    G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Left the match</h2><p>If nobody shoots you in the next 10 seconds, your stack is paid out to your balance where you stood.</p>
      <div class="wwgrid"><button class="pri" data-ww="menu">Main menu</button><button class="dang" data-ww="exit">Exit to casino</button></div></div></div>`; }

  /* ---- remote players: their equipped skin (or an animal), standing, walking, aiming, emoting ---- */
  const ANIM_K = ["bear", "cat", "rat", "fox"];
  function addRemote(m) {
    const N = G.net; let R = N.pl.get(m.n);
    if (R) { const skinChanged = R.skin !== m.skin && m.name !== "…"; R.name = m.name || R.name; R.stack = m.stack; if (skinChanged) { rmRemote(R); R.root = null; R.skin = m.skin; } }
    else { R = { n: m.n, name: m.name, skin: m.skin, stack: m.stack, snaps: [], ph: Math.random() * 6, speed: 0, alive: false }; N.pl.set(m.n, R); }
    if (!R.root) mkBody(R);
    return R;
  }
  function mkBody(R) {
    const T = THREE, root = new T.Group(); G.scene.add(root); const chair = new T.Group(); root.add(chair);
    const A = API().animals ? API().animals() : {}, k = ANIM_K[R.n % 4], spec = (API().skinSpec && API().skinSpec(R.skin)) || { k, c: (A[k] || {}).c || 0x6e4424 };
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .75 }, o || {}));
    const add = (geo, mat, x, y, z, par) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); (par || root).add(m); return m; };
    const body = API().rrAnimal(T, spec, add, M, chair), u = body.userData;
    u.em = { id: "ww", t0: 0, cp: chair.position.clone(), bp: body.position.clone(), br: body.rotation.clone(), hr: u.head.rotation.clone() };
    /* a revolver in the right hand (the hand's -y points along the forearm) */
    const gun = new T.Group(), gm = M(0x3a3a42, { metalness: .8, roughness: .35 }); gun.add(add(new T.BoxGeometry(.035, .05, .16), gm, 0, -.08, -.02, gun)); const br = add(new T.CylinderGeometry(.012, .012, .2, 8), gm, 0, -.17, -.02, gun);
    add(new T.BoxGeometry(.03, .09, .05), M(0x6a3a1a), 0, -.02, .04, gun); u.armR.hand.add(gun); R.gun = gun;
    const fl = new T.Sprite(new T.SpriteMaterial({ map: G.flash.material.map, blending: T.AdditiveBlending, transparent: true, depthWrite: false })); fl.scale.set(.35, .35, 1); fl.position.set(0, -.3, -.02); fl.visible = false; gun.add(fl); R.fl = fl;
    /* a soft shadow blob under them */
    const sh = new T.Mesh(new T.CircleGeometry(.45, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; root.add(sh);
    root.visible = false; Object.assign(R, { root, chair, body, u, sp: { chair, body, a: 0 }, scaled: false });
    const tag = document.createElement("div"); tag.className = "wwtag"; G.hud.appendChild(tag); R.tag = tag;
  }
  function rmRemote(R) {
    if (R.root) { R.root.traverse(o => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); }); G.scene.remove(R.root); }
    if (R.tag) R.tag.remove(); R.root = null; R.tag = null;
  }
  function interp(R, rt) {
    const s = R.snaps; if (!s.length) return null; if (rt <= s[0][0]) return s[0]; const L = s[s.length - 1]; if (rt >= L[0]) return L;
    for (let i = s.length - 1; i > 0; i--) { const a = s[i - 1], b = s[i]; if (rt >= a[0]) { const k = (rt - a[0]) / Math.max(1, b[0] - a[0]); let dy = b[4] - a[4]; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      return [rt, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] + dy * k, a[5] + (b[5] - a[5]) * k]; } }
    return L;
  }
  /* a pose for emApply: standing (rise 1), walk cycle from speed, right arm aiming, or the emote's own pose */
  function poseFor(R, dt, now) {
    const P = API().emLerp(API().emLDance(0), 0); P.rise = 1;
    if (R.emo) { const E = API().emote(R.emo.id), k = (now - R.emo.t0) / 1000; if (!E || k > E.len || R.speed > 1.6) R.emo = null;
      else { const Q = E.f(k); Object.assign(P, Q); P.rise = 1; P.cb = 0; if (R.gun) R.gun.visible = false; return P; } }
    if (R.gun) R.gun.visible = true;
    const w = Math.min(1, R.speed / 4.5); R.ph += dt * Math.min(9, R.speed) * 2.3;
    P.lh0 = Math.sin(R.ph) * .62 * w; P.lh1 = -Math.sin(R.ph) * .62 * w; P.lk0 = Math.max(0, -Math.sin(R.ph)) * .95 * w; P.lk1 = Math.max(0, Math.sin(R.ph)) * .95 * w; P.y = Math.abs(Math.sin(R.ph)) * .035 * w;
    P.ral = 1; P.rpx = .1; P.rpy = -.12 + Math.sin(R.pitch || 0) * 1.1; P.rpz = -1;
    P.lal = .8; P.lpx = -.28; P.lpy = -.95; P.lpz = Math.sin(R.ph) * .35 * w; P.hx = (R.pitch || 0) * .5;
    return P;
  }
  function remotesTick(dt) {
    const N = G.net; if (!N || !N.pl.size) return; const T = THREE, now = performance.now(), rt = Date.now() + (N.off || 0) - INTERP, sm = r => 1 - Math.exp(-dt * r);
    const vis = [];
    for (const R of N.pl.values()) {
      if (!R.root) continue;
      if (R.dying) { const k = (now - R.dying) / 1000; R.root.rotation.x = -Math.min(1, k / .45) * Math.PI / 2 * .92; R.root.position.y = -Math.max(0, k - 2) * .6;
        if (R.tag) R.tag.style.display = "none"; if (k > 3.2) { rmRemote(R); N.pl.delete(R.n); } continue; }
      if (!R.alive) { R.root.visible = false; if (R.tag) R.tag.style.display = "none"; continue; }
      const s = interp(R, rt); if (!s) continue;
      const px = R.root.position.x, pz = R.root.position.z; R.root.position.set(s[1], s[2], s[3]); R.root.rotation.set(0, s[4], 0); R.pitch = s[5];
      const sp = Math.hypot(s[1] - px, s[3] - pz) / Math.max(.001, dt); R.speed += (Math.min(9, sp) - R.speed) * Math.min(1, dt * 8);
      R.root.visible = true; API().emApply(T, R.sp, poseFor(R, dt, now)); vis.push(R);
      if (R.flashT > 0) { R.flashT -= dt; R.fl.visible = true; } else R.fl.visible = false;
    }
    G.scene.updateMatrixWorld();
    for (const R of vis) {
      if (!R.scaled) { /* one size for everyone: scale the model so its head is where the hitbox's head is (1.68 m) */
        const hp = new T.Vector3(); R.u.head.getWorldPosition(hp); const hy = (hp.y - R.root.position.y) / (R.root.scale.y || 1);
        if (hy > .3) { R.root.scale.setScalar(Math.max(.5, Math.min(2, 1.68 / hy))); R.scaled = true; R.root.updateMatrixWorld(true); } }
      API().rrSolveArm(T, R.body, R.u.armL, sm); API().rrSolveArm(T, R.body, R.u.armR, sm);
    }
    /* name tags: name + stack, hidden behind walls (checked a few times a second) */
    const cam = G.cam, W = G.gw, H = G.gh, chk = now - (G.tagChk || 0) > 220; if (chk) G.tagChk = now;
    for (const R of vis) {
      const v = R.root.position.clone(); v.y += 2.15; const d = v.distanceTo(cam.position); const sp = v.clone().project(cam);
      if (chk) { const o = cam.position, dir = v.clone().sub(o).normalize(); R.occl = G.cols.some(c => { const r = rayBox(o, dir, c); return r && r.t < d - .5; }); }
      const on = sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1 && !R.occl && d < 70;
      R.tag.style.display = on ? "" : "none"; if (!on) continue;
      const f = R.flags || 0, st = (f & 1) ? "Protected" : (f & 2) ? "Cashing out" : (f & 4) ? "Disconnected" : "";
      const html = `<b>${esc(R.name)}</b><span>${Math.round(R.stack || 0).toLocaleString()} BB</span>${st ? `<i>${st}</i>` : ""}`; if (R.tag._h !== html) { R.tag._h = html; R.tag.innerHTML = html; }
      R.tag.style.transform = `translate(${((sp.x + 1) / 2 * W).toFixed(1)}px,${((1 - sp.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%) scale(${Math.max(.6, Math.min(1, 14 / d)).toFixed(2)})`;
    }
  }
  function tracer(a, b) { const T = THREE, g = new T.BufferGeometry().setFromPoints([a, b]), l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: .8 })); G.scene.add(l);
    G.parts.push({ o: l, v: new T.Vector3(), life: .09, g: 0, line: true }); }

  /* ---- your own emote: the camera swings out behind you and you see your own character dance ---- */
  function startOwnEmote(id) {
    const E = API().emote(id); if (!E) return; if (!G.me) { const R = { n: G.net ? G.net.n : 0, name: "", skin: API().mySkin ? API().mySkin() : null, snaps: [], ph: 0, speed: 0 }; mkBody(R); if (R.tag) R.tag.remove(); R.tag = null; G.me = R; }
    G.me.emo = { id, t0: performance.now() }; G.me.root.visible = true; G.ownEmo = { id, t0: performance.now(), len: E.len };
  }
  function stopOwnEmote() { if (G.ownEmo) G.ownEmo = null; if (G.me && G.me.root) G.me.root.visible = false; }
  function ownEmoteTick(dt) {
    const O = G.ownEmo, R = G.me; if (!O || !R || !R.root) return false; const k = (performance.now() - O.t0) / 1000;
    if (k > O.len || G.moving > 1.2) { stopOwnEmote(); return false; }
    const T = THREE; R.root.position.set(G.p.x, G.p.y, G.p.z); R.root.rotation.set(0, G.yaw, 0); R.speed = 0; R.emo = { id: O.id, t0: O.t0 };
    API().emApply(T, R.sp, poseFor(R, dt, performance.now())); G.scene.updateMatrixWorld();
    if (!R.scaled) { const hp = new T.Vector3(); R.u.head.getWorldPosition(hp); const hy = hp.y - R.root.position.y; if (hy > .3) { R.root.scale.setScalar(Math.max(.5, Math.min(2, 1.68 / hy))); R.scaled = true; } }
    const sm = r => 1 - Math.exp(-dt * r); API().rrSolveArm(T, R.body, R.u.armL, sm); API().rrSolveArm(T, R.body, R.u.armR, sm);
    /* camera: behind and above, looking at you */
    const back = 3.4, cx = G.p.x + Math.sin(G.yaw) * back, cz = G.p.z + Math.cos(G.yaw) * back; G.cam.position.set(cx, G.p.y + 2.1, cz); G.cam.lookAt(G.p.x, G.p.y + 1.2, G.p.z);
    return true;
  }
  function emoteMenu() {
    const list = API().myEmotes ? API().myEmotes() : [], el = G.hud.querySelector("#wwEmo"); if (!el) return;
    if (el.classList.contains("on")) { el.classList.remove("on"); return; }
    el.innerHTML = list.length ? list.map(e => `<button data-wwemo="${e.id}">${esc(e.n)}</button>`).join("") : `<span>No emotes yet · get them in the Aura Shop</span>`; el.classList.add("on");
  }
  function playEmote(id) { const el = G.hud.querySelector("#wwEmo"); if (el) el.classList.remove("on"); if (G.mode === "pvp") nsend({ t: "emo", id }); else startOwnEmote(id); }

  /* ---- PvP HUD bits: health, cash-out, damage direction ---- */
  function hudPvp(on) { G.hud.classList.toggle("pvp", !!on); drawHp(); }
  function drawHp() { const e = G.hud.querySelector("#wwHp"); if (!e || !G.net) return; const hp = Math.max(0, Math.min(100, G.net.hp == null ? 100 : G.net.hp)); e.firstChild.style.width = hp + "%"; e.classList.toggle("low", hp <= 34); e.lastChild.textContent = Math.ceil(hp); }
  function dmgFx(from) {
    const f = G.hud.querySelector("#wwDmg"); if (f) { f.style.opacity = 1; clearTimeout(G.dmgT); G.dmgT = setTimeout(() => f.style.opacity = 0, 350); }
    if (from) { const a = Math.atan2(from[0] - G.p.x, from[1] - G.p.z), rel = a - Math.atan2(-Math.sin(G.yaw), -Math.cos(G.yaw)), ind = G.hud.querySelector("#wwDir");
      if (ind) { ind.style.transform = `translate(-50%,-50%) rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`; ind.style.opacity = 1; clearTimeout(G.dirT); G.dirT = setTimeout(() => ind.style.opacity = 0, 900); } }
  }
  const inBank = () => { const B = G.net && G.net.bank; return B && G.p.x > B.x0 && G.p.x < B.x1 && G.p.z > B.z0 && G.p.z < B.z1; };
  function cashTick() {
    const b = G.hud.querySelector("#wwCash"), bar = G.hud.querySelector("#wwCashBar"); if (!b) return; const can = G.mode === "pvp" && inBank();
    b.style.display = can ? "" : "none"; if (!can && G.cashHeld) { G.cashHeld = false; nsend({ t: "cash", on: false }); }
    const pr = G.mode === "pvp" ? G.net.cash || 0 : 0; bar.style.display = pr > 0 ? "" : "none"; if (pr > 0) { bar.firstChild.style.width = (pr * 100).toFixed(0) + "%"; bar.lastChild.textContent = `Cashing out ${((1 - pr) * 5).toFixed(1)}s`; }
  }
  function cashPress(on) { if (G.mode !== "pvp") return; if (on && !inBank()) return; G.cashHeld = on; nsend({ t: "cash", on }); }

  /* ---------------- loop ---------------- */
  function loop(now) {
    if (!G) return; G.raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - G.last) / 1000); G.last = now; G.t += dt;
    const T = THREE, cam = G.cam, play = G.state === "play";
    if (play) {
      stepPlayer(dt); G.ses.time += dt; G.sesD.time = (G.sesD.time || 0) + dt; if (G.t - (G.lastSave || 0) > 60) { G.lastSave = G.t; saveStats(); }
      if (G.fireHeld && TOUCH === false) { /* revolver: one shot per click */ }
      if (G.reloading) { G.reloading -= dt; if (G.reloading <= 0) { G.reloading = 0; G.ammo = 6; drawAmmo(); } }
    }
    /* aim down sights */
    const aiming = play && (G.aimHeld || G.aimToggle) && !G.reloading; G.adsK += ((aiming ? 1 : 0) - G.adsK) * Math.min(1, dt * 12);
    const fov = G.set.fov + (G.set.fov * .58 - G.set.fov) * G.adsK; if (Math.abs(fov - G.fovNow) > .01) { G.fovNow = fov; cam.fov = fov; cam.updateProjectionMatrix(); }
    const x = G.hud.querySelector("#wwX"); if (x) x.classList.toggle("ads", G.adsK > .5); const dot = G.hud.querySelector("#wwDot"); if (dot) dot.classList.toggle("on", G.adsK > .6);
    if (G.aimBtn) G.aimBtn.classList.toggle("on", !!G.aimToggle);
    /* camera */
    const p = G.p, bobA = G.p.ground ? Math.min(1, G.moving / 5) : 0, bob = Math.sin(G.bob * 2) * .035 * bobA * (1 - G.adsK * .8);
    cam.position.set(p.x, p.y + 1.62 + bob, p.z); cam.rotation.set(0, 0, 0); cam.rotation.order = "YXZ"; cam.rotation.y = G.yaw; cam.rotation.x = G.pitch + G.recoil * .035;
    /* viewmodel: hip vs sights, bob, recoil, reload spin */
    G.recoil = Math.max(0, G.recoil - dt * 7);
    const vm = G.vm, a = G.adsK; vm.position.set(.2 * (1 - a), -.19 * (1 - a) - .048 * a - Math.abs(Math.sin(G.bob)) * .012 * bobA * (1 - a), -.42 + .06 * a + G.recoil * .05);
    vm.rotation.y = .06 * (1 - a);
    vm.rotation.set(G.recoil * .35, .06 * (1 - a) + Math.sin(G.bob) * .02 * bobA * (1 - a), 0);
    if (G.reloading) { const k = 1 - G.reloading / 1.7, dip = Math.sin(Math.min(1, k) * Math.PI); vm.rotation.x -= dip * .9; vm.rotation.z = dip * .6; G.cyl.rotation.z += dt * 14 * dip; } else vm.rotation.z = 0;
    if (G.flashT > 0) { G.flashT -= dt; G.flash.visible = true; G.flash.material.rotation = Math.random() * 6; G.mlight.intensity = 2.2; G.mlight.position.copy(cam.position); } else { G.flash.visible = false; G.mlight.intensity = 0; }
    /* doors swing when someone walks through */
    for (const d of G.doors) { const dx = p.x - d.wp[0], dz = p.z - d.wp[1], near = Math.hypot(dx, dz) < 1.5;
      const loc = dx * Math.sin(d.rot) + dz * Math.cos(d.rot); /* + = in front (street side) */
      const tgt = near ? (loc > 0 ? -1.25 : 1.25) * d.sd : 0; if (near && !d.was) SFX.door(); d.was = near;
      d.v += ((tgt - d.a) * 30 - d.v * 5) * dt; d.a += d.v * dt; d.hinge.rotation.y = d.a; }
    /* bell + gong + windmill + tumbleweeds */
    if (G.bell) { const b = G.bell; b.v += (-b.a * 14 - b.v * 1.2) * dt; b.a += b.v * dt; b.g.rotation.x = b.a * .5; }
    if (G.gong) { const b = G.gong; b.v += (-b.a * 30 - b.v * 2) * dt; b.a += b.v * dt; b.m.rotation.z = b.a * .3; }
    if (G.windmill) G.windmill.rotation.z += dt * 1.4;
    for (const w of G.weeds) { w.x += w.vx * dt; w.vy = (w.vy || 0) - 14 * dt; w.y += w.vy * dt; if (w.y < .45) { w.y = .45; w.vy = Math.abs(w.vy) > 1.5 ? -w.vy * .45 : (Math.random() < .01 ? 2.5 : 0); }
      if (w.x > 68) { w.x = -68; w.z = (Math.random() - .5) * 10; } if (w.x < -68) w.x = 68; w.vx += ((w.vx > 0 ? 1.9 : -1.9) - w.vx) * dt * .3;
      w.g.position.set(w.x, w.y, w.z); w.g.rotation.z -= w.vx * dt / .45; }
    /* particles */
    for (let i = G.parts.length - 1; i >= 0; i--) { const q = G.parts[i]; q.life -= dt; q.v.y -= 9.8 * q.g * dt; q.o.position.addScaledVector(q.v, dt);
      if (q.rot) { q.o.rotation.x += q.rot.x * dt; q.o.rotation.y += q.rot.y * dt; if (q.o.position.y < .02) { q.o.position.y = .02; q.v.set(0, 0, 0); q.rot = null; } }
      if (q.grow) { q.o.scale.setScalar(q.o.scale.x + q.grow * dt); q.o.material.opacity = Math.max(0, q.life) * .8; }
      if (q.life <= 0) { G.scene.remove(q.o); if (q.grow || q.line) q.o.material.dispose(); if (!q.grow) q.o.geometry.dispose(); G.parts.splice(i, 1); } }
    /* challenge timer chip + tip near the gong */
    const chip = G.hud.querySelector("#wwChal");
    if (G.chal && G.chal.on) { chip.style.display = ""; chip.innerHTML = `Bottles left <b>${G.chal.left}</b> · <b>${((performance.now() - G.chal.t0) / 1000).toFixed(1)}s</b>`; } else chip.style.display = "none";
    const tip = G.hud.querySelector("#wwTip"); if (tip) { const nearG = play && !G.chal.on && Math.hypot(p.x - G.chalTip[0], p.z - G.chalTip[1]) < 7; tip.textContent = "Shoot the gong to start the bottle challenge"; tip.classList.toggle("on", nearG); }
    /* PvP: send my movement 20×/s, move everyone else, cash-out, own emote camera */
    if (G.mode === "pvp" && G.net) { if (now - (G.net.sentAt || 0) > 50) { G.net.sentAt = now; nsend({ t: "in", x: +G.p.x.toFixed(3), y: +G.p.y.toFixed(3), z: +G.p.z.toFixed(3), yaw: +G.yaw.toFixed(4), pitch: +G.pitch.toFixed(4) }); } }
    if (G.net) remotesTick(dt); cashTick();
    const emo = ownEmoteTick(dt); G.vm.visible = !emo;
    G.R.autoClear = false; G.R.clear(); G.R.render(G.scene, cam); G.R.clearDepth(); if (G.vc.aspect !== cam.aspect) { G.vc.aspect = cam.aspect; G.vc.updateProjectionMatrix(); } G.R.render(G.vs, G.vc);
  }
  /* practice bottles on the fence between runs */
  function chalPractice() { if (!G || !G.chal || G.chal.on) return; G.bottles.filter(b => b.kind === "prac" && b.alive).forEach(b => { b.alive = false; b.g.parent && b.g.parent.remove(b.g); }); G.chal.spots.slice(0, 6).forEach(s => spawnBottle(s, "prac")); }
  window.WW = { open, close, _g: () => G, spawns: SPAWNS, killFeed: (...a) => G && killFeed(...a), setLive: n => G && setLive(n) };
})();
