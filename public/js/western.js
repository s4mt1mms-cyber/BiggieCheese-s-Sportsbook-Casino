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
    ["reload", "Reload", "KeyR"], ["jump", "Jump", "Space"], ["run", "Run", "ShiftLeft"], ["use", "Use · doors · car · bell", "KeyF"], ["emote", "Emotes", "KeyB"], ["crouch", "Crouch", "KeyC"], ["swap", "Switch gun (revolver / sniper)", "KeyQ"], ["view", "First / third person", "KeyV"], ["pause", "Pause", "KeyP"]];
  const KEYS0 = Object.fromEntries(ACTS.map(a => [a[0], a[2]]));
  const SET0 = { sens: 1, ads: 0.6, invert: false, tp: false, crToggle: false, aa: true, fov: 75, sound: 1, keys: KEYS0, btn: 1, lefty: false, aimHold: false, pos: {} };
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
.wwscope{position:absolute;inset:0;pointer-events:none;opacity:0;--R:min(40vh,40vw);background:radial-gradient(circle at 50% 50%,transparent 0,transparent calc(var(--R) - 1px),#0b0806 calc(var(--R) + 1px))}
.wwscope .ln{position:absolute;left:50%;top:50%;width:calc(var(--R) * 2);height:calc(var(--R) * 2);transform:translate(-50%,-50%);border-radius:50%;box-shadow:inset 0 0 0 6px #050403,inset 0 0 calc(var(--R) * .35) rgba(0,0,0,.75),inset 0 0 calc(var(--R) * .08) rgba(0,0,0,.9);background:radial-gradient(circle at 38% 34%,rgba(170,210,255,.10),transparent 45%),radial-gradient(circle,rgba(40,70,60,.06),rgba(20,30,20,.12))}
.wwscope i{position:absolute;left:50%;top:50%;background:#050403}
.wwscope i.v{width:2px;height:calc(var(--R) * 2);transform:translate(-50%,-50%)}.wwscope i.h{height:2px;width:calc(var(--R) * 2);transform:translate(-50%,-50%)}
.wwscope i.pt{width:8px;height:calc(var(--R) * .55)}.wwscope i.pl{height:8px;width:calc(var(--R) * .55)}
.wwscope i.pt.b{transform:translate(-50%,calc(var(--R) * .45))}.wwscope i.pt.t{transform:translate(-50%,calc(var(--R) * -1))}
.wwscope i.pl.r{transform:translate(calc(var(--R) * .45),-50%)}.wwscope i.pl.l{transform:translate(calc(var(--R) * -1),-50%)}
.wwscope u{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:#050403;margin:-2px 0 0 -2px}
.wwscope b{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#ff3b30;box-shadow:0 0 6px #ff3b30}
.wwx.nox{opacity:0}
.wwsb{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(124px,calc(env(safe-area-inset-top) + 116px));width:168px;background:rgba(10,6,2,.42);border-radius:8px;padding:4px 0;pointer-events:none;font:700 11px Barlow;color:#f3e2c4;display:none;text-shadow:0 1px 2px #000}
.wwhud.pvp .wwsb{display:block}.wwsb div{display:flex;align-items:center;gap:6px;padding:1px 8px;line-height:1.5}.wwsb div i{width:12px;opacity:.6;font-style:normal}.wwsb div span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wwsb div b{color:#ffd76a;font-weight:800}.wwsb div.me{background:rgba(92,255,114,.13);color:#b8ffc4}.wwsb div.me b{color:#9dffb0}
.wwthp{position:relative;display:block;width:76px;height:10px;border-radius:6px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.3);overflow:hidden;margin-top:2px;font-style:normal}
.wwthp i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#7dff8c,#2fa84a)}.wwthp.low i{background:linear-gradient(#ff8a7a,#c0281c)}
.wwthp u{position:absolute;right:4px;top:-2px;font:800 9px Barlow;text-decoration:none;text-shadow:0 1px 2px #000;color:#fff}
.wwdead{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;background:rgba(40,8,4,.75);border:2px solid #c8963e;border-radius:12px;padding:12px 22px;pointer-events:none}
.wwdead b{display:block;font:400 26px Rye,Georgia,serif;color:#ffd0a0}.wwdead span{font:600 14px Barlow;color:#e8d4a8}
.wwffaend{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:280px;max-width:92%;background:rgba(20,12,6,.9);border:2px solid #c8963e;border-radius:14px;padding:14px 18px;text-align:center;pointer-events:none;color:#ffe9b8}
.wwffaend h3{margin:0 0 4px;font:400 26px Rye,Georgia,serif;color:#ffd24a}.wwffaend p{margin:0 0 8px;font:600 14px Barlow}.wwffaend table{width:100%;border-collapse:collapse;font:600 13px Barlow}
.wwffaend td,.wwffaend th{padding:3px 6px;text-align:left}.wwffaend th{opacity:.6;font-weight:700}.wwffaend tr.me td{color:#9dffb0}.wwffaend small{display:block;margin-top:8px;opacity:.7;font:600 12px Barlow}.wwbtn.lit{background:rgba(200,150,62,.75)!important}
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
.wwemo.wheel{left:50%;top:50%;right:auto;transform:translate(-50%,-50%);width:340px;height:340px;max-height:none;border-radius:50%;background:radial-gradient(rgba(20,12,6,.35) 22%,rgba(20,12,6,.78) 23%);display:none;padding:0;overflow:visible;pointer-events:none}
.wwemo.wheel.on{display:block}.wwemo.wheel button{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;text-align:center}
.wwemo.wheel button.sel{background:#c8963e;color:#1a0e04;transform:translate(-50%,-50%) scale(1.12)}.wwemo.wheel i{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:600 12px Barlow;color:#e8d4a8;text-align:center;width:120px;font-style:normal}
.wwbuy{margin:8px 0 2px;padding:10px 12px;border:1px solid rgba(200,150,62,.5);border-radius:12px;background:rgba(0,0,0,.25)}
.wwbuyv{display:flex;align-items:baseline;gap:10px}.wwbuyv span{font:700 11px Barlow;letter-spacing:.14em;text-transform:uppercase;color:#c8a46a}
.wwbuyv b{font:400 28px Rye,Georgia,serif;color:#ffe29a}.wwbuyv small{margin-left:auto;font:700 11px Barlow;letter-spacing:.1em;text-transform:uppercase;opacity:.75}
.wwbuy input[type=range]{width:100%;accent-color:#f5c542;height:30px;margin:4px 0}
.wwbuyq{display:flex;gap:6px;flex-wrap:wrap}.wwbuyq button{flex:1;min-width:0!important;padding:6px 4px!important;font:800 13px Barlow!important}
#wwRot.short .wwbuyv b{font-size:24px}#wwRot.short .wwbuy{padding:6px 10px;margin:4px 0}
.wwusek{position:absolute;left:50%;top:64%;transform:translateX(-50%)}.wwusek b{background:#ffd76a;color:#2a1606;border-radius:5px;padding:1px 7px;margin-right:4px}
.wwuseb{font-size:12px!important;background:rgba(120,200,255,.28)!important;border-color:#9fd8ff!important;color:#eaf6ff!important}
.wwrules{text-align:left;font:600 13.5px/1.4 Barlow;color:#f3e2c4;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-top:6px}
.wwrules b{color:#ffd76a}#wwRot.narrow .wwrules{grid-template-columns:1fr}
.wwlaysz{display:flex;align-items:center;gap:6px;font:700 13px Barlow}.wwlaysz input{width:120px;accent-color:#f5c542}.wwlaysz b{min-width:86px;font:800 12px Barlow;color:#ffd76a}
.wwhud.edit .wwbtn.sel{box-shadow:0 0 0 3px #fff,0 0 14px #ffd76a}
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
    G.state = "pause"; if (G.emoW) emoWheel(false); G.fireHeld = false; G.aimHeld = false; G.keys = {}; G.act = {}; G.touches = {}; hideSticks();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
    const pvp = G.mode === "pvp";
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Paused</h2>${pvp ? `<p style="margin:0;color:#ffd0a0">You're still in the match. Others can see and shoot you. Leaving counts as dying.</p>` : ""}<div class="wwgrid">
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
      <label class="ck">Toggle crouch (tap instead of hold) <input type="checkbox" data-wwset="crToggle" ${s.crToggle ? "checked" : ""}></label>
      ${TOUCH ? `<label class="ck">Aim assist <input type="checkbox" data-wwset="aa" ${s.aa !== false ? "checked" : ""}></label>` : ""}
      <label class="ck">Third-person camera <input type="checkbox" data-wwset="tp" ${s.tp ? "checked" : ""}></label>
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
    G.state = "layout"; G.laySel = G.laySel || "fire";
    G.ui.innerHTML = `<div class="wwlay"><div class="wwlaybar"><span id="wwLayT">Drag buttons · tap one to resize it</span>
      <label class="wwlaysz">Size <input type="range" id="wwLaySz" min="0.6" max="1.8" step="0.05" value="${(G.set.bsz || {})[G.laySel] || 1}"><b id="wwLayV"></b></label>
      <button data-ww="layreset">Reset</button><button class="pri" data-ww="laydone">Done</button></div></div>`;
    const sz = G.ui.querySelector("#wwLaySz"), lab = () => { const n = { fire: "FIRE", aim: "AIM", reload: "Reload", jump: "JUMP", emote: "EMOTE", swap: "GUN", crouch: "CROUCH", use: "USE", cash: "Cash out" }[G.laySel] || G.laySel;
      G.ui.querySelector("#wwLayV").textContent = `${n} ${Math.round(((G.set.bsz || {})[G.laySel] || 1) * 100)}%`; G.hud.querySelectorAll(".wwbtn").forEach(b => b.classList.toggle("sel", b.dataset.b === G.laySel)); };
    sz.addEventListener("input", () => { G.set.bsz = G.set.bsz || {}; G.set.bsz[G.laySel] = +sz.value; LSset("ww-set", G.set); placeButtons(); lab(); }); G.layLab = () => { sz.value = (G.set.bsz || {})[G.laySel] || 1; lab(); }; lab();
    G.hud.querySelectorAll("#wwUse").forEach(b => { b.style.display = ""; if (!b.textContent) b.textContent = "USE"; });
    G.hud.classList.add("edit"); placeButtons();
  }
  function bindTo(code) {
    const a = G.capturing; if (!a) return; const k = G.set.keys, old = k[a], other = actOf(code);
    if (other && other !== a) k[other] = old; /* swap so nothing is left with two actions on one key */
    k[a] = code; G.capturing = null; G.capJust = performance.now(); LSset("ww-set", G.set); showControls();
  }
  function setVal(k, v) {
    const s = G.set; s[k] = k === "invert" || k === "tp" || k === "crToggle" || k === "aa" ? !!v : Number(v); LSset("ww-set", s);
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
      else if (a === "ctlreset") { G.set.keys = Object.assign({}, KEYS0); G.set.btn = 1; G.set.lefty = false; G.set.aimHold = false; G.set.pos = {}; G.set.bsz = {}; G.capturing = null; LSset("ww-set", G.set); placeButtons(); showControls(); }
      else if (a === "layout") showLayout();
      else if (a === "layreset") { G.set.pos = {}; G.set.bsz = {}; LSset("ww-set", G.set); placeButtons(); G.layLab && G.layLab(); }
      else if (a === "laydone") { G.hud.classList.remove("edit"); G.hud.querySelectorAll(".wwbtn.sel").forEach(b => b.classList.remove("sel")); G.hud.querySelectorAll("#wwUse,#wwCash").forEach(b => { b.style.display = "none"; b._l = null; }); if (G.hud.querySelector("#wwUse")) G.hud.querySelector("#wwUse")._l = null; LSset("ww-set", G.set); showControls(); }
      else if (a === "setreset") { G.set = Object.assign({}, SET0, { keys: Object.assign({}, KEYS0), pos: {} }); LSset("ww-set", G.set); placeButtons(); showSettings(); if (G.master) G.master.gain.value = G.set.sound * .9; }
      else if (a === "exit") close();
      else if (a === "buyin") { if (G.server && G.server.up && API().admin && API().admin()) showTiers(); else showModes(); }
      else if (a === "ffa") joinFfa();
      else if (a === "respawn") { nsend({ t: "respawn" }); play(); }
      else if (a === "join") { if (G.server && G.server.up) showModes(); else { const b2 = G.ui.querySelector("[data-ww=join] small"); if (b2) b2.textContent = "Server offline · try again soon"; srvStatus(); } }
      else if (a === "leave") leaveMatch();
      else if (a === "rules") showRules();
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
      if (act === "cash" && !e.repeat) cashPress(true); if (act === "emote" && !e.repeat) { if (TOUCH) emoteMenu(); else emoWheel(true); }
      if (G.emoW && /^Digit[1-9]$/.test(k)) { const it = G.emoW.list[+k.slice(5) - 1]; if (it) { emoWheel(false); playEmote(it.id); } } if (act === "use" && !e.repeat) doUse(); if (act === "swap" && !e.repeat) swapGun(); if (act === "crouch" && !e.repeat && G.set.crToggle) G.crTog = !G.crTog; if (act === "view" && !e.repeat) { G.set.tp = !G.set.tp; LSset("ww-set", G.set); banner("", G.set.tp ? "Third person" : "First person"); }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(k)) e.preventDefault();
    };
    H_.ku = e => { if (!G) return; e.stopPropagation(); G.keys[e.code] = false; const act = actOf(e.code); if (act) { G.act[act] = false; if (act === "aim") G.aimHeld = false; if (act === "cash") cashPress(false); if (act === "emote" && G.emoW) { const it = G.emoW.list[G.emoW.sel]; emoWheel(false); if (it) playEmote(it.id); } } };
    window.addEventListener("keydown", H_.kd, true); window.addEventListener("keyup", H_.ku, true);
    H_.mm = e => { if (!G || G.state !== "play" || document.pointerLockElement !== G.cv) return; if (G.emoW) { emoAim(e.movementX, e.movementY); return; } look(e.movementX, e.movementY, 0.0022); };
    H_.md = e => {
      if (!G || TOUCH) return;
      if (G.capturing) { e.preventDefault(); bindTo("Mouse" + e.button); return; }
      if (G.state === "play" && document.pointerLockElement !== G.cv && e.target === G.cv) { try { G.cv.requestPointerLock(); } catch (_) {} return; }
      if (G.state !== "play") return;
      if (G.emoW) { e.preventDefault(); const it = G.emoW.list[G.emoW.sel]; if (it && e.button === 0) { emoWheel(false); playEmote(it.id); } return; } /* clicks pick an emote, never shoot or aim */
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
      if (G.state === "layout") { for (const t of e.changedTouches) { const el = document.elementFromPoint(t.clientX, t.clientY), b = el && el.closest && el.closest(".wwbtn"); if (!b) continue; const p = gpt(t.clientX, t.clientY), r = b.getBoundingClientRect(), c = gpt(r.left + r.width / 2, r.top + r.height / 2); G.touches[t.identifier] = { kind: "drag", b, ox: c.x - p.x, oy: c.y - p.y }; b.classList.add("on"); G.laySel = b.dataset.b; G.layLab && G.layLab(); } return; }
      if (G.state !== "play") return;
      for (const t of e.changedTouches) {
        const p = gpt(t.clientX, t.clientY), btn = e.target.closest && document.elementFromPoint(t.clientX, t.clientY);
        const b = btn && btn.closest && btn.closest(".wwbtn");
        if (b) { const a = b.dataset.b; G.touches[t.identifier] = { kind: a, x: p.x, y: p.y, b };
          b.classList.add("on");
          if (a === "fire") { G.fireHeld = true; fire(); } else if (a === "aim") { if (G.set.aimHold) G.aimHeld = true; else G.aimToggle = !G.aimToggle; } else if (a === "reload") reload(); else if (a === "jump") { G.jumpQ = true; G.act.jump = true; } else if (a === "cash") cashPress(true); else if (a === "emote") emoteMenu(); else if (a === "use") doUse(); else if (a === "swap") swapGun(); else if (a === "crouch") { G.crTog = !G.crTog; b.classList.toggle("lit", G.crTog); }
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
      for (const t of e.changedTouches) { const q = G.touches[t.identifier]; if (!q) continue; if (q.b) q.b.classList.remove("on"); if (q.kind === "fire") G.fireHeld = false; if (q.kind === "aim" && G.set.aimHold) G.aimHeld = false; if (q.kind === "cash") cashPress(false); if (q.kind === "jump") G.act.jump = false; if (q.kind === "stick") hideSticks(); delete G.touches[t.identifier]; }
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
    const s = G.set, ads = G.adsK > 0.5 ? s.ads : 1, m = k * s.sens * ads * (G.fovNow / 75) * (G.wpn === "sn" && G.adsK > .5 ? 1.6 : 1) * (TOUCH && G.aa && G.aa.near ? .65 : 1); /* phone aim assist: a bit of drag on a target */
    G.lookAt = performance.now();
    /* driving: look around the car (free look; eases back behind the car after a couple of seconds) */
    if (G.car && G.car.mine) { if (G.carLook == null) G.carLook = G.car.yaw; G.carLook -= dx * m; /* owner Oct 28: you steer by looking */ G.dPitch = Math.max(-.5, Math.min(.9, (G.dPitch || 0) + dy * m * (s.invert ? -1 : 1))); /* owner Oct 28: driving look inverted vs on foot */ G.dLookAt = performance.now(); return; }
    G.yaw -= dx * m; G.pitch -= dy * m * (s.invert ? -1 : 1); G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
  }
  function placeButtons() {
    if (!G || !G.hud) return;
    let el = G.hud.querySelector("#wwPause");
    if (!el) {
      G.hud.insertAdjacentHTML("beforeend", `<button id="wwPause" aria-label="Pause">❚❚</button>
        <div class="wwx" id="wwX"><i></i><i></i><i></i><i></i></div><div class="wwdot" id="wwDot"></div><div class="wwscope" id="wwScope"><div class="ln"></div><i class="v"></i><i class="h"></i><i class="pt t"></i><i class="pt b"></i><i class="pl l"></i><i class="pl r"></i><u style="transform:translate(22px,0px)"></u><u style="transform:translate(-22px,0px)"></u><u style="transform:translate(0px,22px)"></u><u style="transform:translate(0px,-22px)"></u><u style="transform:translate(44px,0px)"></u><u style="transform:translate(-44px,0px)"></u><u style="transform:translate(0px,44px)"></u><u style="transform:translate(0px,-44px)"></u><u style="transform:translate(66px,0px)"></u><u style="transform:translate(-66px,0px)"></u><u style="transform:translate(0px,66px)"></u><u style="transform:translate(0px,-66px)"></u><u style="transform:translate(88px,0px)"></u><u style="transform:translate(-88px,0px)"></u><u style="transform:translate(0px,88px)"></u><u style="transform:translate(0px,-88px)"></u><b></b></div><div class="wwhit" id="wwHit"><i style="transform:rotate(45deg)"></i><i style="transform:rotate(135deg)"></i><i style="transform:rotate(225deg)"></i><i style="transform:rotate(315deg)"></i></div>
        <div class="wwtop"><span class="wwchip" id="wwChal" style="display:none"></span></div>
        <div class="wwfeed" id="wwFeed"></div>
        <div class="wwtr"><span class="wwchip wwlive" id="wwLive"><i></i><b>1</b> live</span><span class="wwchip wwbb" id="wwBB"><b>+0</b> BB</span></div>
        <div class="wwammo" id="wwAmmo"></div><div class="wwmsg" id="wwMsg"></div><div class="wwtip" id="wwTip"></div>
        <div class="wwstick" id="wwStick"><i></i></div>
        <div class="wwdmg" id="wwDmg"></div><div class="wwdir" id="wwDir"><i></i></div>
        <div class="wwhp" id="wwHp"><i></i><span>100</span></div>
        <div class="wwcashbar" id="wwCashBar" style="display:none"><i></i><span></span></div>
        <div class="wwemo" id="wwEmo"></div>
        ${TOUCH ? "" : `<div class="wwchip wwusek" id="wwUse" style="display:none"></div>`}
        ${TOUCH ? "" : `<div class="wwchip wwcashk" id="wwCash" style="display:none">Hold <b>${esc(keyName(G.set.keys.cash))}</b> to cash out · <b>${esc(keyName(G.set.keys.emote))}</b> emotes</div>`}
        ${TOUCH ? `<div class="wwbtn" data-b="fire" id="wwBF">FIRE</div><div class="wwbtn" data-b="aim" id="wwBA">AIM</div><div class="wwbtn" data-b="reload" id="wwBR">↻</div><div class="wwbtn" data-b="jump" id="wwBJ">JUMP</div><div class="wwbtn" data-b="emote" id="wwBE">EMOTE</div><div class="wwbtn" data-b="swap" id="wwBW">SWAP</div><div class="wwbtn" data-b="crouch" id="wwBC">CROUCH</div><div class="wwbtn wwuseb" data-b="use" id="wwUse" style="display:none"></div><div class="wwbtn wwcashb" data-b="cash" id="wwCash" style="display:none">HOLD TO<br>CASH OUT</div>` : ""}`);
      el = G.hud.querySelector("#wwPause"); el.addEventListener("click", e => { e.stopPropagation(); pause(); });
      el.addEventListener("touchstart", e => { e.stopPropagation(); e.preventDefault(); pause(); }, { passive: false });
      G.aimBtn = G.hud.querySelector("#wwBA");
      drawAmmo();
    }
    if (TOUCH) {
      const gw = G.gw, gh = G.gh, r = Math.max(30, Math.min(48, gh * 0.11)) * (G.set.btn || 1), pad = 22, L = !!G.set.lefty, POS = G.set.pos || {};
      const put = (id, cx, cy, rr) => { const el = G.hud.querySelector(id), sp = POS[el.dataset.b]; rr *= ((G.set.bsz || {})[el.dataset.b] || 1); if (sp) { cx = sp[0] * gw; cy = sp[1] * gh; } else if (L) cx = gw - cx; Object.assign(el.style, { width: rr * 2 + "px", height: rr * 2 + "px", left: (cx - rr) + "px", top: (cy - rr) + "px", fontSize: Math.round(rr * .36) + "px" }); };
      const fx = gw - pad - r * 1.35 - 24, fy = gh - pad - r * 1.35 - 6;
      put("#wwBF", fx, fy, r * 1.35); put("#wwBA", fx - r * 2.7, fy + r * .15, r * .95); put("#wwBR", fx + r * .35, fy - r * 2.55, r * .8); put("#wwBJ", fx - r * 2.5, fy - r * 2.1, r * .8);
      put("#wwBE", fx - r * 4.6, fy + r * .35, r * .7); put("#wwBW", fx - r * 4.6, fy - r * 3.35, r * .7); put("#wwBC", fx - r * 4.6, fy - r * 1.5, r * .7); put("#wwCash", gw / 2, gh * .62, r * 1.1); put("#wwUse", fx - r * 2.4, fy - r * 4.3, r * 1.0);
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
    crack() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .12, 4200, 1.2, .35, "highpass"); tone(t, 2600, 1900, .08, .1, "triangle"); },
    screech() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .3, 1900, 9, .16); },
    glass() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, .35, 5200, .8, .5, "highpass"); for (let i = 0; i < 6; i++) tone(t + Math.random() * .18, 3000 + Math.random() * 3500, 0, .18, .08); },
    bell() { if (!G.ac) return; const t = G.ac.currentTime; [[1, .5], [2.0, .25], [2.4, .2], [3.0, .14], [4.2, .08], [5.4, .05]].forEach(([m, v]) => tone(t, 310 * m, 0, 4.5 / m * 1.4, v)); },
    step(wood) { if (!G.ac) return; const t = G.ac.currentTime; if (wood) { tone(t, 160, 90, .06, .12, "triangle"); nz(t, .05, 800, 1, .06); } else nz(t, .09, 350 + Math.random() * 120, 1.2, .07); },
    door() { if (!G.ac) return; const t = G.ac.currentTime; tone(t, 260, 180, .25, .05, "sawtooth"); nz(t, .1, 600, 2, .08); },
    boom() { if (!G.ac) return; const t = G.ac.currentTime; nz(t, 1.6, 180, .5, 1, "lowpass"); nz(t, .5, 900, .5, .6, "lowpass"); tone(t, 90, 28, 1.2, .9, "sine"); nz(t + .1, 2.4, 400, .3, .25, "lowpass"); },
    ding() { if (!G.ac) return; const t = G.ac.currentTime; tone(t, 1320, 0, .5, .2); tone(t + .08, 1760, 0, .6, .15); },
  };

  /* ---------------- world ---------------- */
  /* colliders: axis-aligned boxes {x0,x1,y0,y1,z0,z1,mat}; boxes no taller than 0.45 above their base are steps you walk onto */
  function buildWorld() {
    const T = THREE, gw = G.gw, gh = G.gh;
    const R = new T.WebGLRenderer({ canvas: G.cv, antialias: !TOUCH, powerPreference: "high-performance" });
    R.setPixelRatio(Math.min(TOUCH ? 1.5 : 1.25, window.devicePixelRatio || 1)); /* perf (Oct 28): computers 1.75 → 1.25 */ R.setSize(gw, gh, false);
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    const SH = !TOUCH; R.shadowMap.enabled = SH; R.shadowMap.type = T.PCFShadowMap; R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = true; /* shadows re-drawn every 3rd frame (perf) */
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(G.set.fov, gw / gh, .05, 900); sc.add(cam);
    Object.assign(G, { R, scene: sc, cam, cols: [], ladders: [], winSpecs: [], wins: [], shoot: [], dyn: [], decals: [], parts: [], doors: [], bottles: [], weeds: [], fovNow: G.set.fov, adsK: 0 });
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
    /* fill a wall span [a0,a1] × [0,H] with boxes, leaving rectangular openings ops [[a0,a1,y0,y1]] (windows, doors) */
    function holes(a0, a1, H, ops, emit) {
      const xs = [a0, a1]; ops.forEach(q => [q[0], q[1]].forEach(v => { if (v > a0 && v < a1) xs.push(v); })); xs.sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) { const x0 = xs[i], x1 = xs[i + 1]; if (x1 - x0 < 1e-3) continue; const m = (x0 + x1) / 2;
        const ys = ops.filter(q => q[0] < m && q[1] > m).map(q => [Math.max(0, q[2]), Math.min(H, q[3])]).sort((p, q) => p[0] - q[0]);
        let y = 0; for (const [b0, b1] of ys) { if (b0 > y + 1e-3) emit(x0, x1, y, b0); y = Math.max(y, b1); } if (H > y + 1e-3) emit(x0, x1, y, H); } }
    /* a flight of solid steps (each ≤ .3 high, so you just walk up): from (zBot, yBase) to (zTop, yTop), x0..x1, using a box maker with lbox's signature */
    function stairs(mk, mat, x0, x1, zBot, zTop, yBase, yTop) { const n = Math.ceil((yTop - yBase) / .28), dz = (zTop - zBot) / n;
      for (let i = 0; i < n; i++) { const top = yBase + (i + 1) * (yTop - yBase) / n; mk(x1 - x0, top - yBase, Math.abs(dz), mat, (x0 + x1) / 2, yBase, zBot + (i + .5) * dz, true); } }
    function building(o) {
      const { x, zf, rot, w, d, h, name } = o, grp = new T.Group(); grp.position.set(x, 0, zf); grp.rotation.y = rot; sc.add(grp); grp.updateMatrixWorld(true);
      const fl = .32; /* every building is a hollow shell now (owner Oct 28): windows are real holes in the wall */
      const L = (lx, lz) => { const c = Math.cos(rot), s = Math.sin(rot); return [x + lx * c + lz * s, zf - lx * s + lz * c]; };
      const lbox = (bw, bh, bd, mat, lx, ly, lz, solid, snd, opt) => { const m = put(box(bw, bh, bd), mat, lx, ly + bh / 2, lz, 0, grp, opt);
        if (solid !== false) { const a = L(lx - bw / 2, lz - bd / 2), b = L(lx + bw / 2, lz + bd / 2); colBox(a[0], b[0], ly, ly + bh, a[1], b[1], snd); } return m; };
      const wall = o.brick ? MT.brick : wood("w" + o.col, o.col);
      const trim = wood("t" + (o.trim || "#3a2414"), o.trim || "#3a2414", true);
      const wl = [], nw = Math.max(1, Math.floor((w - 3) / 3.2));
      for (let i = 0; i < nw; i++) { const lx = (i + .5) / nw * (w - 1) - (w - 1) / 2; if (Math.abs(lx) < 1.6) continue; wl.push([lx, 1.8, 1.3, 1.5]); if (h > 6) wl.push([lx, 5, 1.1, 1.4]); }
      {
        const t = .22, dw = o.enter ? 2.4 : 1.3, dh = o.enter ? 2.9 : fl + 2.5;
        const ops = wl.map(([lx, ly, ww, wh]) => [lx - ww / 2, lx + ww / 2, ly - wh / 2, ly + wh / 2]); if (o.enter || o.door) ops.push([-dw / 2, dw / 2, 0, dh]);
        lbox(w, h, t, wall, 0, 0, -d + t / 2); lbox(t, h, d, wall, -w / 2 + t / 2, 0, -d / 2); lbox(t, h, d, wall, w / 2 - t / 2, 0, -d / 2);
        holes(-w / 2, w / 2, h, ops, (a0, a1, y0, y1) => lbox(a1 - a0, y1 - y0, t, wall, (a0 + a1) / 2, y0, -t / 2));
        lbox(w - .1, fl, d - .1, wood("floor", "#6a4528"), 0, 0, -d / 2, true, "wood");
        lbox(w, .15, d, wood("ceil", "#3d2817"), 0, h - .15, -d / 2, true); /* ceiling = the roof you can stand on */
        /* inside walls a bit darker so the room reads as shade */
        const inW = M({ map: plank(o.inCol || "#5a3a22", [1, 1]), color: 0x9a8a7a });
        [[w - .5, h - fl, .02, 0, -d + t + .02], [.02, h - fl, d - .5, -w / 2 + t + .02, -d / 2], [.02, h - fl, d - .5, w / 2 - t - .02, -d / 2]].forEach(([a, b, c, lx, lz]) => put(box(a, b, c), inW, lx, fl + b / 2, lz, 0, grp, { ns: 1 }));
        o.interior && o.interior(grp, lbox, fl, w, d, h, L);
        if (o.door) { /* a plain hinged door (USE opens/closes it) */
          const a = L(-dw / 2, -t), b = L(dw / 2, 0), dcol = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: 0, y1: dh, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), mat: "wood" };
          const dr = { i: G.doors.length, open: false, wp: L(0, -t / 2), hs: [], col: dcol, ang: 1.5 }; dcol.dr = dr; G.cols.push(dcol); G.doors.push(dr);
          const hinge = new T.Group(); hinge.position.set(-dw / 2, fl, -t / 2); grp.add(hinge);
          put(box(dw - .06, dh - fl - .06, .07), wood("door", "#8a5a30", true), dw / 2, (dh - fl) / 2, 0, 0, hinge, { dyn: 1 }); put(box(.1, .1, .14), MT.brass, dw - .2, 1.15, 0, 0, hinge, { dyn: 1 });
          dr.hs.push({ hinge, sd: 1, a: 0, v: 0 });
        }
        /* swinging batwing doors */
        if (o.enter) { const dcol = (() => { const a = L(-dw / 2, -t), b = L(dw / 2, 0); return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: fl, y1: fl + 2.7, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), mat: "wood" }; })();
        const n0 = L(0, 0), n1 = L(0, 1), dr = { i: G.doors.length, open: false, auto: true, wp: L(0, -t / 2), nrm: [n1[0] - n0[0], n1[1] - n0[1]], hs: [], col: dcol }; dcol.dr = dr; G.doors.push(dr); /* batwings: no collider, swing when someone walks through */
        [-1, 1].forEach(sd => { const hinge = new T.Group(); hinge.position.set(sd * dw / 2, fl + .55, -t / 2); grp.add(hinge);
          const dmat = wood("batwing", "#b07a3e", true), dk = wood("batwingT", "#5a3418", true);
          const dm = put(box(dw / 2 - .12, .78, .05), dmat, -sd * (dw / 4 - .03), .45, 0, 0, hinge, { dyn: 1 });
          put(box(dw / 2 - .1, .1, .07), dk, -sd * (dw / 4 - .03), .88, 0, 0, hinge, { dyn: 1 }); put(box(dw / 2 - .1, .1, .07), dk, -sd * (dw / 4 - .03), .06, 0, 0, hinge, { dyn: 1 });
          dr.hs.push({ hinge, sd, a: 0, v: 0 }); }); }
      }
      /* false front, sign, trim, windows, door */
      const hf = o.hf || h + 1.6;
      lbox(w + .3, hf - h + .1, .25, wall, 0, h - .1, .1, false);
      lbox(w + .5, .25, .4, trim, 0, hf, .1, false); lbox(w + .3, .2, .35, trim, 0, h - .2, .14, false);
      sign(name, Math.min(w - 1, 9), Math.min(1.5, (w - 1) / 5), 0, h + (hf - h) / 2 + .1, .26, 0, o.sbg, o.sfg, grp);
      const win = (lx, ly, ww, wh) => { G.winSpecs.push({ g: grp, lx, ly, lz: .03, ww, wh }); put(box(ww + .2, .12, .12), trim, lx, ly + wh / 2 + .06, .06, 0, grp); put(box(ww + .2, .12, .12), trim, lx, ly - wh / 2 - .06, .06, 0, grp);
        put(box(.06, wh, .1), trim, lx, ly, .07, 0, grp); };
      wl.forEach(q => win(...q));
      if (!o.enter && !o.door) { put(box(1.3, 2.4, .08), wood("door", "#8a5a30", true), 0, 1.2 + fl, .04, 0, grp); put(box(.1, .1, .1), MT.brass, .45, 1.2, .1, 0, grp); }
      if (h > 6 && o.balcony) { lbox(w, .18, 1.6, MT.deck, 0, 3.6, .8, false); for (let i = 0; i <= 8; i++) put(box(.06, .9, .06), MT.rail, -w / 2 + .1 + i * (w - .2) / 8, 4.2, 1.55, 0, grp); put(box(w, .08, .08), MT.rail, 0, 4.6, 1.55, 0, grp); }
      /* porch: deck (walkable step), posts, roof */
      const pd = 2.6; lbox(w, .3, pd, MT.deck, 0, 0, pd / 2, true, "wood");
      if (!o.noRoof) { const np = Math.max(2, Math.round(w / 4)); for (let i = 0; i < np; i++) { const lx = -w / 2 + .25 + i * (w - .5) / (np - 1); lbox(.22, 3.0, .22, MT.post, lx, .3, pd - .15, true); }
        const pr = put(box(w + .4, .14, pd + .4), MT.roof, 0, 3.35, pd / 2, 0, grp); pr.rotation.x = .08; pr.updateMatrixWorld(true);
        { const a = L(-w / 2 - .2, -.2), b = L(w / 2 + .2, pd + .2); colBox(a[0], b[0], 3.26, 3.44, a[1], b[1], "wood"); } /* you can stand on the porch roofs (owner Oct 28) */ }
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
      { const UP = 3.6, gd = 4.2, fz = -.22 - gd, flr = wood("floor", "#6a4528"), rl = MT.rail; /* upstairs (owner Oct 28) */
        lbox(w - .44, .2, gd, flr, 0, UP - .2, -.22 - gd / 2, true, "wood");
        const sx0 = w / 2 - 1.5, sx1 = w / 2 - .23; stairs(lbox, wood("stair", "#5e3f24"), sx0, sx1, fz - 6.6, fz, fl, UP);
        lbox(sx0 - (-w / 2 + .22), .95, .08, rl, (-w / 2 + .22 + sx0) / 2, UP, fz + .04, true); for (let x = -w / 2 + .5; x < sx0; x += .5) put(box(.05, .9, .05), rl, x, UP + .45, fz + .04, 0, grp);
        lbox(.08, .95, 6.6, rl, sx0 - .04, fl + .9, fz - 3.3, false); put(new T.CylinderGeometry(.06, .06, .3, 8), MT.lamp, 0, UP + 2.2, -1.6, 0, grp, { ns: 1 });
        [[-3, -1.6], [2.4, -2.2]].forEach(([tx, tz]) => { put(new T.CylinderGeometry(.55, .55, .06, 16), wood("tab", "#6a3e1e"), tx, UP + .74, tz, 0, grp); put(new T.CylinderGeometry(.07, .16, .72, 8), wood("tab", "#6a3e1e"), tx, UP + .36, tz, 0, grp); const wp = L(tx, tz); colBox(wp[0] - .5, wp[0] + .5, UP, UP + .78, wp[1] - .5, wp[1] + .5); }); }
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
      /* (no point light: perf) */
      for (let i = 0; i < 3; i++) G.bottleSpots.push({ grp, lx: bx + rnd(-.2, .2), ly: fl + 1.38, lz: -d * .55 + (i - 1) * 1.4, free: true });
      sign(named, 3.2, .8, 0, fl + 3.1, -d + .79, 0, "#2a1608", "#ffd76a", grp);
      /* wanted posters */
      ["WANTED", "WANTED", "REWARD"].forEach((t, i) => sign(t, .7, .9, -w / 2 + .36, fl + 1.8, -d * .25 - i * 1.1, Math.PI / 2, "#e8d4a8", "#3a1c0a", grp));
    };
    G.bottleSpots = [];
    /* ---- interiors for the buildings you can walk into (owner Oct 28) ---- */
    const cyl = (r, hh, mat, lx, ly, lz, grp, L, solid) => { put(new T.CylinderGeometry(r, r * .92, hh, 12), mat, lx, ly + hh / 2, lz, 0, grp); if (solid) { const a = L(lx - r, lz - r), b = L(lx + r, lz + r); colBox(a[0], b[0], ly, ly + hh, a[1], b[1]); } };
    const bars = (grp, lbox, fl, x0, x1, lz, hh) => { lbox(x1 - x0, hh, .06, MT.iron, (x0 + x1) / 2, fl, lz, true, "metal"); /* collider */
      for (let x = x0 + .08; x < x1; x += .22) put(box(.035, hh, .035), MT.iron, x, fl + hh / 2, lz + .05, 0, grp); put(box(x1 - x0, .06, .06), MT.iron, (x0 + x1) / 2, fl + hh, lz + .05, 0, grp); };
    const GOODS = [0xa83a2a, 0x3a6a9a, 0xd8b04a, 0x6a8a3a, 0xe8dcc0, 0x8a5a2a].map(c => M({ color: c, roughness: .8 })); /* shared, so they batch into a few draw calls */
    const goods = (grp, x0, x1, y, lz) => { for (let x = x0; x < x1; x += .34) put(box(.22, .26 + Math.random() * .12, .24), GOODS[(Math.random() * GOODS.length) | 0], x, y + .15, lz, 0, grp); };
    const storeInside = (grp, lbox, fl, w, d, h, L) => {
      const sh = wood("shelf", "#3d2210"); lbox(w - .8, 2.5, .5, sh, 0, fl, -d + .55, true); [0.55, 1.25, 1.95].forEach(y => goods(grp, -w / 2 + .7, w / 2 - .7, fl + y, -d + .62));
      lbox(w * .5, 1.0, .7, wood("counter", "#5a3318"), -.6, fl, -d * .5, true); put(box(.5, .35, .3), MT.brass, -.6 - w * .15, fl + 1.18, -d * .5, 0, grp);
      [[w / 2 - 1, -1.6], [w / 2 - 1.7, -1.2], [-w / 2 + 1, -1.5]].forEach(([x, z]) => cyl(.38, 1.0, wood("barrel", "#6a4424"), x, fl, z, grp, L, true));
      [[-w / 2 + 1.1, -d + 2.2], [-w / 2 + 1.1, -d + 3.1]].forEach(([x, z]) => lbox(.8, .8, .8, wood("crate", "#8a6a3a", true), x, fl, z, true));
      put(box(.7, .5, .45), M({ color: 0xc9b48a, roughness: 1 }), w / 2 - 1.2, fl + .25, -d + 1.6, 0, grp); put(box(.7, .5, .45), M({ color: 0xc9b48a, roughness: 1 }), w / 2 - 1.2, fl + .75, -d + 1.6, 0, grp);
    };
    const bankInside = (grp, lbox, fl, w, d, h, L) => {
      const cw = w - 2.2; lbox(cw, 1.1, .6, wood("counter", "#4a2a14"), -w / 2 + .2 + cw / 2, fl, -d * .45, true);
      for (let x = -w / 2 + .35; x < -w / 2 + .2 + cw; x += .2) put(box(.03, 1.0, .03), MT.brass, x, fl + 1.6, -d * .45, 0, grp); put(box(cw, .05, .05), MT.brass, -w / 2 + .2 + cw / 2, fl + 2.1, -d * .45, 0, grp);
      lbox(2.4, 2.5, 1.0, MT.iron, w / 2 - 1.6, fl, -d + .8, true, "metal"); const vd = put(new T.CylinderGeometry(.85, .85, .1, 24), MT.brass, w / 2 - 1.6, fl + 1.25, -d + 1.33, 0, grp); vd.rotation.x = Math.PI / 2; vd.updateMatrixWorld(true);
      put(box(1.2, .9, .05), MT.felt, -w / 2 + 1.6, fl + 1.6, -d + .26, 0, grp); lbox(1.4, .78, .8, wood("desk", "#5a3318"), -w / 2 + 1.6, fl, -d + 1.6, true);
      [-.3, 0, .3].forEach(dx => put(box(.22, .08, .12), MT.brass, -w / 2 + 1.6 + dx, fl + .82, -d + 1.6, 0, grp)); sign("BANK", 1.6, .5, -w / 2 + 1.6, fl + 2.5, -d + .27, 0, "#1a1a2a", "#e8c86a", grp);
    };
    const sheriffInside = (grp, lbox, fl, w, d, h, L) => {
      lbox(1.6, .8, .8, wood("desk", "#5a3318"), -w / 2 + 1.6, fl, -d * .4, true); put(box(.4, .05, .3), MT.white, -w / 2 + 1.5, fl + .83, -d * .4, 0, grp); put(box(.12, .25, .12), MT.amber, -w / 2 + 2.1, fl + .93, -d * .4, 0, grp);
      bars(grp, lbox, fl, .2, w / 2 - .25, -d + 2.6, 2.6); lbox(1.8, .45, .8, wood("cot", "#6a4a2a"), w / 2 - 1.3, fl, -d + 1.0, true); put(box(1.7, .1, .7), M({ color: 0x8a7a6a }), w / 2 - 1.3, fl + .5, -d + 1.0, 0, grp);
      ["WANTED", "WANTED", "OUTLAW"].forEach((tx, i) => sign(tx, .7, .9, -w / 2 + .36, fl + 1.8, -1.6 - i * 1.1, Math.PI / 2, "#e8d4a8", "#3a1c0a", grp));
      put(box(1.2, .1, .2), wood("rack", "#3d2210"), -w / 2 + 1.5, fl + 2.0, -d + .3, 0, grp); for (let i = 0; i < 3; i++) put(box(.06, 1.1, .06), MT.iron, -w / 2 + 1.1 + i * .4, fl + 1.5, -d + .34, 0, grp);
    };
    const barberInside = (grp, lbox, fl, w, d, h, L) => {
      put(box(w * .6, 1.2, .03), M({ color: 0x8a9aa8, roughness: .05, metalness: .9 }), 0, fl + 1.8, -d + .26, 0, grp); lbox(w * .6, .9, .5, wood("counter", "#e8dcc0"), 0, fl, -d + .5, true);
      [-1.5, 1.5].forEach(x => { lbox(.7, .55, .7, M({ color: 0x7a1d1d, roughness: .6 }), x, fl, -d + 1.9, true); put(box(.7, .8, .12), M({ color: 0x7a1d1d, roughness: .6 }), x, fl + .95, -d + 2.2, 0, grp); put(new T.CylinderGeometry(.08, .2, .3, 10), MT.iron, x, fl + .15, -d + 1.9, 0, grp); });
      for (let i = 0; i < 3; i++) lbox(.5, .45, .5, wood("chair", "#5a3218"), -w / 2 + .7, fl, -1.6 - i * .8, true);
      const pole = put(new T.CylinderGeometry(.09, .09, 1.1, 12), M({ color: 0xd84a3a }), w / 2 - .6, fl + 1.4, -1.0, 0, grp);
    };
    const undertakerInside = (grp, lbox, fl, w, d, h, L) => {
      const pine = wood("coffin", "#4a3020", true), dk = wood("coffinD", "#2a1a10", true);
      [[-2.2, -d + .45], [-1.2, -d + .45], [1.4, -d + .45]].forEach(([x, z]) => lbox(.75, 2.0, .38, pine, x, fl, z, true));
      [[-1.8, -d * .5], [1.2, -d * .55]].forEach(([x, z]) => { lbox(.8, .55, 2.0, dk, x, fl + .6, z, true); lbox(.9, .6, .3, wood("trestle", "#5a3a20"), x, fl, z - .7, true); lbox(.9, .6, .3, wood("trestle", "#5a3a20"), x, fl, z + .7, true); });
      put(new T.CylinderGeometry(.05, .05, .35, 8), MT.white, w / 2 - 1, fl + 1.1, -d + 1, 0, grp); lbox(.6, .9, .6, wood("stand", "#3d2210"), w / 2 - 1, fl, -d + 1, true);
    };
    const jailInside = (grp, lbox, fl, w, d, h, L) => {
      bars(grp, lbox, fl, -w / 2 + .25, w / 2 - .25, -d + 3.2, 2.7); lbox(.08, 2.7, 2.9, MT.iron, 0, fl, -d + 1.7, true, "metal");
      [-1, 1].forEach(sd => { lbox(1.8, .45, .8, wood("cot", "#6a4a2a"), sd * (w / 4), fl, -d + .8, true); put(box(.4, .3, .4), MT.iron, sd * (w / 4 + 1.2), fl + .15, -d + 1.8, 0, grp); });
      lbox(1.4, .8, .8, wood("desk", "#5a3318"), -w / 2 + 1.4, fl, -2.2, true); put(box(.4, .1, .3), MT.iron, -w / 2 + 1.4, fl + .85, -2.2, 0, grp);
      put(new T.TorusGeometry(.12, .02, 6, 12), MT.brass, -w / 2 + .3, fl + 1.7, -2.2, 0, grp);
    };

    const ZN = -9.6, ZS = 9.6;
    const north = [
      { x: -46, w: 10, d: 10, h: 4.6, ladder: 1, name: "GENERAL STORE", col: "#a8865c", sbg: "#2a3a1c", door: 1, interior: storeInside },
      { x: -34.5, w: 9, d: 10, h: 5, name: "BANK", col: "#7a3b28", brick: 1, sbg: "#1a1a2a", sfg: "#e8c86a", door: 1, interior: bankInside },
      { x: -21, w: 14, d: 14, h: 7.6, name: "THE RUSTY SPUR", col: "#8a5a34", enter: 1, balcony: 1, hf: 9.6, sbg: "#5a1a10", interior: saloonInside("RUSTY SPUR") },
      { x: -8, w: 8, d: 9, h: 4.4, ladder: -1, name: "SHERIFF", col: "#6e7884", sbg: "#2a2a2a", sfg: "#f3d38a", door: 1, interior: sheriffInside },
      { x: 3, w: 10, d: 11, h: 7.4, ladder: 1, name: "GRAND HOTEL", col: "#6f8a6a", balcony: 1, sbg: "#1d3320" },
      { x: 14.5, w: 9, d: 9, h: 4.5, name: "BARBER", col: "#b3a48a", sbg: "#5a1a1a", door: 1, interior: barberInside },
      { x: 27, w: 12, d: 11, h: 5, ladder: -1, name: "BLACKSMITH", col: "#5e4a3a", sbg: "#1a1410" },
      { x: 42, w: 10, d: 10, h: 4.8, name: "UNDERTAKER", col: "#4a4040", sbg: "#101010", sfg: "#cfc6b8", door: 1, interior: undertakerInside }];
    const south = [
      { x: -45, w: 11, d: 12, h: 6, name: "LIVERY STABLE", col: "#8a2a20", sbg: "#3a1408", noRoof: 1 },
      { x: -31, w: 10, d: 10, h: 4.6, ladder: 1, name: "POST OFFICE", col: "#8f9aa0", sbg: "#1a2a3a" },
      { x: -17, w: 8, d: 9, h: 4.4, name: "ASSAY OFFICE", col: "#b08a56", sbg: "#3a2414" },
      { x: -3, w: 14, d: 14, h: 7.6, ladder: -1, name: "GOLDEN NUGGET", col: "#9a6a2a", enter: 1, balcony: 1, hf: 9.8, sbg: "#3a2408", sfg: "#ffd24a", inCol: "#4e2e1a", interior: saloonInside("GOLDEN NUGGET") },
      { x: 12, w: 9, d: 10, h: 4.6, name: "DRUGS & SUNDRIES", col: "#a87a6a", sbg: "#2a1a3a" },
      { x: 25, w: 10, d: 10, h: 4.6, ladder: 1, name: "TELEGRAPH", col: "#9a9070", sbg: "#2a2414" },
      { x: 40, w: 12, d: 11, h: 5, name: "JAIL", col: "#7a7064", brick: 1, sbg: "#1a1a1a", door: 1, interior: jailInside }];
    north.forEach(o => building(Object.assign({ zf: ZN, rot: 0 }, o)));
    south.forEach(o => building(Object.assign({ zf: ZS, rot: Math.PI }, o)));

    /* church at the east end of the street, facing west, with a bell you can ring */
    { const grp = new T.Group(); grp.position.set(52, 0, 0); grp.rotation.y = -Math.PI / 2; sc.add(grp); grp.updateMatrixWorld(true);
      const W = 9, D = 14, Hh = 6.2, wl = M({ map: plank("#e9e2d4", [1, 1]) });
      /* hollow chapel you can walk into: local x across (world z), local z into the building (world x = 52 − lz) */
      const CL = (lx, lz) => [52 - lz, lx], cb = (bw, bh, bd, mat, lx, ly, lz, solid, opt) => { const m = put(box(bw, bh, bd), mat, lx, ly + bh / 2, lz, 0, grp, opt);
        if (solid !== false) { const a = CL(lx - bw / 2, lz - bd / 2), b = CL(lx + bw / 2, lz + bd / 2); colBox(a[0], b[0], ly, ly + bh, a[1], b[1], "wood"); } return m; };
      const t = .22, dw = 2.2, dh = 3.1, side = (W - dw) / 2, inW = M({ map: plank("#cfc4b0", [1, 1]), color: 0xb8ae9e });
      cb(W, Hh, t, wl, 0, 0, -D + t / 2);
      { const ops = [0, 1, 2].map(k => { const lz = -4 - k * 3.4; return [lz - .55, lz + .55, 2.0, 4.4]; });
        [-1, 1].forEach(sd => holes(-D, 0, Hh, ops, (a0, a1, y0, y1) => cb(t, y1 - y0, a1 - a0, wl, sd * (W / 2 - t / 2), y0, (a0 + a1) / 2))); }
      holes(-W / 2, W / 2, Hh, [[-dw / 2, dw / 2, 0, dh], [-.8, .8, 4.1, 5.3]], (a0, a1, y0, y1) => cb(a1 - a0, y1 - y0, t, wl, (a0 + a1) / 2, y0, -t / 2));
      /* back loft over the doors (owner Oct 28): a window to shoot from, stairs up the left wall */
      { const LT = 3.5, ld = 3.0, lz0 = -t - ld, fw = wood("chfl", "#6a4a2e"), rl = MT.rail; cb(W - .44, .2, ld, fw, 0, LT - .2, -t - ld / 2, true);
        stairs(cb, wood("stair", "#5e3f24"), -W / 2 + .23, -W / 2 + 1.08, lz0 - 4.9, lz0, .15, LT);
        cb(W / 2 - .23 - (-W / 2 + 1.1), .95, .08, rl, (W / 2 - .23 + (-W / 2 + 1.1)) / 2, LT, lz0 + .04, true); for (let x = -W / 2 + 1.3; x < W / 2 - .2; x += .45) put(box(.05, .9, .05), rl, x, LT + .45, lz0 + .04, 0, grp);
        G.winSpecs.push({ g: grp, lx: 0, ly: 4.7, lz: .03, ww: 1.6, wh: 1.2, col: 0x2a52b0 }); const tr = wood("t#3a2414", "#3a2414", true);
        put(box(1.8, .12, .12), tr, 0, 5.36, .06, 0, grp); put(box(1.8, .12, .12), tr, 0, 4.04, .06, 0, grp); }
      cb(W - .1, .15, D - .1, wood("chfl", "#6a4a2e"), 0, 0, -D / 2, true); put(box(W - .3, .1, D - .3), inW, 0, Hh - .05, -D / 2, 0, grp, { ns: 1 });
      [[W - .5, .02, 0, -D + t + .02]].forEach(([a, c, lx, lz]) => put(box(a, Hh - .2, c), inW, lx, .15 + (Hh - .2) / 2, lz, 0, grp, { ns: 1 }));
      const pew = wood("pew", "#5a3418");
      for (let r = 0; r < 5; r++) { const lz = -3.9 - r * 1.75; [-1, 1].forEach(sd => { cb(2.5, .5, .55, pew, sd * 2.0, .15, lz, true); put(box(2.5, .55, .08), pew, sd * 2.0, .15 + .75, lz + .27, 0, grp); }); }
      cb(2.6, 1.05, 1.0, wood("altar", "#3d2210"), 0, .15, -D + 1.5, true); put(box(2.7, .06, 1.1), MT.white, 0, 1.23, -D + 1.5, 0, grp);
      put(box(.14, 1.8, .1), MT.brass, 0, 3.2, -D + t + .08, 0, grp); put(box(.9, .14, .1), MT.brass, 0, 3.6, -D + t + .08, 0, grp);
      [-.8, .8].forEach(x => { put(new T.CylinderGeometry(.05, .05, .4, 8), MT.white, x, 1.46, -D + 1.3, 0, grp); put(new T.SphereGeometry(.05, 6, 5), MT.lamp, x, 1.7, -D + 1.3, 0, grp, { ns: 1 }); });
      /* stained glass on both side walls (breakable like every window) */
      const SG = [0xb02a2a, 0x2a52b0, 0xd8a020, 0x2a8a4a, 0x8a2ab0, 0xb05a2a];
      for (let k = 0; k < 3; k++) [-1, 1].forEach((sd, j) => G.winSpecs.push({ g: grp, lx: sd * (W / 2 + .04), ly: 3.2, lz: -4 - k * 3.4, ww: .08, wh: 2.4, wd: 1.1, col: SG[(k * 2 + j) % SG.length] }));
      /* (no point light: perf) */
      /* double doors (open/close button) */
      { const a = CL(-dw / 2, -t), b = CL(dw / 2, 0); const dcol = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: 0, y1: dh, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), mat: "wood" };
        const dr = { i: G.doors.length, open: false, wp: CL(0, -t / 2), hs: [], col: dcol, ang: 1.6 }; dcol.dr = dr; G.cols.push(dcol); G.doors.push(dr);
        [-1, 1].forEach(sd => { const hinge = new T.Group(); hinge.position.set(sd * dw / 2, .15, -t / 2); grp.add(hinge);
          put(box(dw / 2 - .04, dh - .2, .08), wood("chdoor", "#7a4a26", true), -sd * dw / 4, (dh - .2) / 2, 0, 0, hinge, { dyn: 1 });
          put(box(.06, .06, .12), MT.brass, -sd * (dw / 2 - .18), 1.3, .06, 0, hinge, { dyn: 1 }); dr.hs.push({ hinge, sd, a: 0, v: 0 }); }); }
      /* the bell rope hangs inside, just past the doors, under the tower */
      put(new T.CylinderGeometry(.03, .03, Hh - 1.2, 6), M({ color: 0xc9a46a, roughness: 1 }), 1.1, 1.2 + (Hh - 1.2) / 2, -2.2, 0, grp);
      put(new T.SphereGeometry(.09, 8, 6), M({ color: 0x8a5a2a }), 1.1, 1.15, -2.2, 0, grp); G.rope = CL(1.1, -2.2);
      { const ra = .55, rl = W / 2 / Math.cos(ra) + .5, oroof = M({ color: 0x2f6a5e, roughness: .45, metalness: .45 }); [-1, 1].forEach(sd => { const r = new T.Mesh(box(rl, .2, D + .5), oroof); r.position.set(sd * W / 4, Hh + Math.tan(ra) * W / 4, -D / 2); r.rotation.z = -sd * ra; grp.add(r); r.userData.st = 1; });
        const sh = new T.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(0, Math.tan(ra) * W / 2); sh.lineTo(-W / 2, 0); const tri = new T.Mesh(new T.ShapeGeometry(sh), wl); tri.position.set(0, Hh, .01); grp.add(tri); tri.userData.st = 1; }
      /* onion domes: gold over the bell tower and the middle of the nave, blue ones at the back corners */
      const gold = M({ color: 0xd8a531, roughness: .22, metalness: .92 }), blue = M({ color: 0x2a56a8, roughness: .35, metalness: .5 }), drumM = M({ color: 0xf0ebe0, roughness: .8 }), trimG = M({ color: 0x2f6a5e, roughness: .5, metalness: .4 });
      const onion = (r, h) => new T.LatheGeometry([[0, 0], [r * .82, h * .04], [r, h * .26], [r * .93, h * .46], [r * .6, h * .66], [r * .26, h * .83], [r * .08, h * .95], [0, h]].map(([x, y]) => new T.Vector2(x, y)), 20);
      const cross = (x, y, z, k) => { put(box(.07 * k, 1.3 * k, .07 * k), gold, x, y + .65 * k, z, 0, grp); put(box(.42 * k, .06 * k, .06 * k), gold, x, y + 1.05 * k, z, 0, grp); put(box(.66 * k, .07 * k, .07 * k), gold, x, y + .8 * k, z, 0, grp);
        const sl = put(box(.48 * k, .06 * k, .06 * k), gold, x, y + .35 * k, z, 0, grp); sl.rotation.z = -.35; sl.updateMatrixWorld(true); };
      const cupola = (x, z, y, dr, dh, r, h, mat) => { put(new T.CylinderGeometry(dr, dr, dh, 20), drumM, x, y + dh / 2, z, 0, grp); put(new T.CylinderGeometry(dr + .08, dr + .08, .14, 20), trimG, x, y + dh, z, 0, grp);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(box(.16, dh * .55, .04), MT.dark, x + Math.cos(a) * (dr + .005), y + dh * .5, z + Math.sin(a) * (dr + .005), -a + Math.PI / 2, grp); }
        put(onion(r, h), mat, x, y + dh + .07, z, 0, grp); cross(x, y + dh + h, z, Math.max(.6, r / 1.4)); };
      put(box(3, 4, 3), wl, 0, Hh + 2, -1.5, 0, grp); put(box(3.2, .18, 3.2), trimG, 0, Hh + 4.05, -1.5, 0, grp);
      cupola(0, -1.5, Hh + 4.1, 1.05, 1.1, 1.35, 2.5, gold);
      const ridge = Hh + Math.tan(.55) * W / 2; cupola(0, -8, ridge - .5, 1.7, 1.7, 2.1, 3.6, gold);
      [-1, 1].forEach(sd => cupola(sd * 2.6, -12.3, Hh + 1.0, .65, .9, .85, 1.7, blue));
      sign("ORTHODOX CHURCH", 3.4, .55, 0, 3.45, .06, 0, "#f0ebe0", "#2a3a6a", grp);
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
    /* wagons can be pushed (owner Oct 28): walk into one and it rolls; in PvP everyone sees where it is */
    G.wagons = [];
    const wagon = (x, z, ry) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; sc.add(g); g.updateMatrixWorld(true); const D = { dyn: 1 };
      put(box(1.7, .5, 3.6), wood("wagon", "#7a5230"), 0, 1.05, 0, 0, g, D); put(box(1.7, .5, .08), wood("wagon", "#7a5230"), 0, 1.5, 1.76, 0, g, D); put(box(1.7, .5, .08), wood("wagon", "#7a5230"), 0, 1.5, -1.76, 0, g, D);
      const whs = []; [-1, 1].forEach(sd => [1.2, -1.2].forEach(zz => { const wh = put(new T.TorusGeometry(.55, .07, 6, 18), wood("wheel", "#4a2a14"), sd * .95, .6, zz, 0, g, D); wh.rotation.y = Math.PI / 2; whs.push(wh); }));
      const cov = put(new T.CylinderGeometry(1, 1, 3.2, 16, 1, true, 0, Math.PI), M({ color: 0xe8dcc0, side: T.DoubleSide }), 0, 1.45, 0, 0, g, D); cov.rotation.set(Math.PI / 2, 0, Math.PI / 2); cov.scale.set(1, 1, .9);
      const c = Math.abs(Math.cos(ry)) > .5, hx = c ? 1 : 2, hz = c ? 2 : 1, W = { i: G.wagons.length, g, whs, x, z, hx, hz, ax: c ? "z" : "x" };
      W.col = { x0: x - hx, x1: x + hx, y0: 0, y1: 2.4, z0: z - hz, z1: z + hz, mat: "wood", wg: W }; G.cols.push(W.col); G.wagons.push(W); };
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
    /* ---- every window pane: one instanced mesh, each pane can be shot out (G.wins[i].box = its world box) ---- */
    { const N = G.winSpecs.length, im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), M({ color: 0xffffff, roughness: .12, metalness: .55, transparent: true, opacity: .88 }), N), m4 = new T.Matrix4(), col = new T.Color();
      G.winSpecs.forEach((w, i) => { const mtx = new T.Matrix4().multiplyMatrices(w.g.matrixWorld, m4.compose(new T.Vector3(w.lx, w.ly, w.lz), new T.Quaternion(), new T.Vector3(w.wd ? w.ww : w.ww, w.wh, w.wd || .06)));
        im.setMatrixAt(i, mtx); im.setColorAt(i, col.set(w.col || 0x2a3a48)); const b = new T.Box3(new T.Vector3(-.5, -.5, -.5), new T.Vector3(.5, .5, .5)).applyMatrix4(mtx);
        const W = { i, mtx, broken: 0, col: w.col || 0x2a3a48, box: { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }, c: b.getCenter(new T.Vector3()) }; G.wins.push(W);
        G.cols.push(Object.assign({}, W.box, { mat: "glass", gw: W, dr: { get open() { return !!W.broken; } } })); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; sc.add(im); G.winMesh = im; }
    G.grid = new Map(); for (const c of G.cols) gridAdd(c);
    buildCar(T, M);

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
      P(box(.007, .034, .007), blued, 0, .073, -.34); /* front sight post: tip at y .09 */
      const hand = new T.Group(); hand.position.set(0, -.05, .11); gun.add(hand); P(box(.075, .07, .095), skin, .005, 0, 0, 0, hand); P(box(.03, .03, .07), skin, -.035, .02, -.05, 0, hand);
      P(new T.CylinderGeometry(.045, .055, .35, 10), sleeve, .02, -.07, .24, Math.PI / 2 - .25, hand);
      const fl = new T.Sprite(new T.SpriteMaterial({ map: cvT(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,220,1)"); r.addColorStop(.3, "rgba(255,190,80,.9)"); r.addColorStop(1, "rgba(255,120,20,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w);
        g.strokeStyle = "rgba(255,230,150,.8)"; g.lineWidth = 6; for (let i = 0; i < 6; i++) { const a = i / 6 * 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); } }), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      fl.position.set(0, .035, -.4); fl.scale.set(.22, .22, 1); fl.visible = false; gun.add(fl); G.flash = fl;
      const ml = new T.PointLight(0xffb060, 0, 9, 2); sc.add(ml); G.mlight = ml;
      gun.traverse(o => { if (o.isMesh) { o.renderOrder = 10; } });
      /* sniper rifle (owner Oct 28): no reticle from the hip and wild, 5× scope with perfect aim the moment you aim in */
      const sg = new T.Group(); vm.add(sg); G.gunS = sg; sg.visible = false; const wd = M({ map: plank("#5a3218", [1, 1], true), roughness: .6 });
      P(new T.CylinderGeometry(.011, .013, .62, 12), blued, 0, .03, -.42, Math.PI / 2, sg); P(box(.045, .06, .3), blued, 0, .02, -.02, 0, sg);
      P(box(.05, .07, .42), wd, 0, -.0, -.2, 0, sg); P(box(.05, .1, .26), wd, 0, -.02, .2, 0, sg).rotation.x = .12;
      P(new T.CylinderGeometry(.026, .026, .24, 14), M({ color: 0x15151a, roughness: .4, metalness: .7 }), 0, .1, -.06, Math.PI / 2, sg); P(new T.CylinderGeometry(.033, .028, .05, 14), M({ color: 0x15151a, metalness: .7 }), 0, .1, -.19, Math.PI / 2, sg);
      P(box(.012, .04, .03), blued, .04, .03, .04, 0, sg); P(box(.075, .07, .095), skin, .005, -.06, .12, 0, sg); P(new T.CylinderGeometry(.045, .055, .35, 10), sleeve, .02, -.12, .3, Math.PI / 2 - .25, sg);
      sg.traverse(o => { if (o.isMesh) { o.renderOrder = 10; } });
    }
    G.ray = new T.Raycaster();
    G.wpn = "rv"; G.amm = { rv: 6, sn: 1 }; G.ammo = 6; G.reloading = 0; G.lastShot = 0; G.recoil = 0; G.bob = 0; G.hp = 100;
    G.fireTex = cvT(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,245,200,1)"); r.addColorStop(.35, "rgba(255,150,40,.9)"); r.addColorStop(1, "rgba(200,40,0,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
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
  function spawnPlayer() { if (G.car && G.car.mine) { G.car.mine = false; G.car.driver = 0; } const sp = G.started ? pickSpawn([]) : SPAWNS[0]; G.p = { x: sp[0], y: 0, z: sp[1], vy: 0, ground: true }; G.yaw = sp[2]; G.pitch = 0; G.amm = { rv: 6, sn: 1 }; G.ammo = MAGS[G.wpn || "rv"]; G.reloading = 0; G.aimToggle = false; G.aimHeld = false; }
  /* the car is solid (owner Oct 28): an oriented box ±1 × ±2.2, roof at 1.55 you can stand on */
  const CAR_HX = 1.0, CAR_HZ = 2.2, CAR_TOP = 1.55;
  function carLocal(x, z) { const c = G.car, dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; }
  function carSolid() { const c = G.car; return c && !c.mine && c.g && c.g.visible !== false; }
  function groundAt(x, z, feet, r) {
    let g = 0; if (carSolid() && feet >= CAR_TOP - .5) { const [lx, lz] = carLocal(x, z); if (Math.abs(lx) < CAR_HX && Math.abs(lz) < CAR_HZ) g = CAR_TOP; } for (const c of nearCols(x, z)) { if (c.y1 > feet + .48) continue; if (x + r * .3 < c.x0 || x - r * .3 > c.x1 || z + r * .3 < c.z0 || z - r * .3 > c.z1) continue; if (c.y1 > g) g = c.y1; } return g;
  }
  function collide(p, r) {
    const feet = p.y, ht = G.crK > .5 ? 1.2 : 1.75; for (let it = 0; it < 2; it++) for (const c of nearCols(p.x, p.z)) {
      if (c.y1 <= feet + .46 || c.y0 >= feet + ht || (c.dr && c.dr.open)) continue;
      const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1)), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { const pushes = [[c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); p.x += pushes[0][0]; p.z += pushes[0][1]; }
    }
    if (carSolid() && feet < CAR_TOP - .46) { const c = G.car, [lx, lz] = carLocal(p.x, p.z), cx = Math.max(-CAR_HX, Math.min(lx, CAR_HX)), cz = Math.max(-CAR_HZ, Math.min(lz, CAR_HZ));
      let ox = lx - cx, oz = lz - cz, d = Math.hypot(ox, oz), nx = lx, nz = lz;
      if (d < r) { if (d > 1e-6) { nx = cx + ox / d * r; nz = cz + oz / d * r; } else { const e = [[CAR_HX + r - lx, 0], [-CAR_HX - r - lx, 0], [0, CAR_HZ + r - lz], [0, -CAR_HZ - r - lz]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0]; nx = lx + e[0]; nz = lz + e[1]; }
        const co = Math.cos(c.yaw), si = Math.sin(c.yaw); p.x = c.x + nx * co + nz * si; p.z = c.z - nx * si + nz * co; } }
    const B = G.bounds; p.x = Math.max(B.x0, Math.min(B.x1, p.x)); p.z = Math.max(B.z0, Math.min(B.z1, p.z));
  }
  /* mantle (owner Oct 28): in the air next to a ledge, press jump again to pull yourself up onto it */
  function tryMantle(p, fromGround) {
    const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw); let top = -1, lx = 0, lz = 0;
    for (const f of [.45, .6, .8]) { const qx = p.x + fx * f, qz = p.z + fz * f;
      for (const c of nearCols(qx, qz)) { if (c.dr && c.dr.open) continue; if (qx < c.x0 || qx > c.x1 || qz < c.z0 || qz > c.z1) continue; if (c.y1 > p.y + .35 && c.y1 <= p.y + 2.0 && c.y1 > top) { top = c.y1; lx = qx; lz = qz; } }
      if (top > 0) break; }
    if (top < 0 || (fromGround && top < p.y + 1.15)) return false; /* from the ground only for ledges too high to just jump onto */
    let low = false;
    for (const c of nearCols(lx, lz)) { if (c.dr && c.dr.open) continue; if (c.y1 > top + .05 && c.y0 < top + 1.75) { if (lx + .28 > c.x0 && lx - .28 < c.x1 && lz + .28 > c.z0 && lz - .28 < c.z1) { if (c.y0 < top + 1.2) return false; low = true; } if (c.y0 > p.y + 1.6 && p.x + .3 > c.x0 && p.x - .3 < c.x1 && p.z + .3 > c.z0 && p.z - .3 < c.z1) return false; } }
    if (low) { G.crK = 1; G.crouch = true; }
    G.mantle = { t: 0, y0: p.y, y1: top, x0: p.x, z0: p.z, x1: lx, z1: lz }; SFX.step(true); return true;
  }
  /* collider grid (perf, Oct 28): each collider sits in every 4 m cell it touches (+1 m margin); nearCols(x,z) = the few that can matter there */
  const GC = 4, NOCOLS = [];
  function gridAdd(c) { if (!G.grid) return; c._cells = []; for (let ix = Math.floor((c.x0 - 1) / GC); ix <= Math.floor((c.x1 + 1) / GC); ix++) for (let iz = Math.floor((c.z0 - 1) / GC); iz <= Math.floor((c.z1 + 1) / GC); iz++) {
      const k = ix * 1000 + iz; let a = G.grid.get(k); if (!a) G.grid.set(k, a = []); a.push(c); c._cells.push(a); } }
  function gridDel(c) { for (const a of c._cells || []) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } c._cells = []; }
  function nearCols(x, z) { return G.grid ? G.grid.get(Math.floor(x / GC) * 1000 + Math.floor(z / GC)) || NOCOLS : G.cols; }
  function setWagon(W, x, z) { const dx = x - W.x, dz = z - W.z; W.x = x; W.z = z; gridDel(W.col); Object.assign(W.col, { x0: x - W.hx, x1: x + W.hx, z0: z - W.hz, z1: z + W.hz }); gridAdd(W.col); W.g.position.set(x, 0, z);
    const roll = (W.ax === "z" ? dz : dx) / .55; W.whs.forEach(h => h.rotation.x += roll); }
  function pushWagons(p, r, dt) {
    for (const W of G.wagons || []) { const c = W.col; if (p.y > c.y1 - .3) continue; const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1)), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= r || d < 1e-4) continue; const pen = (r - d) * .7, mx = -dx / d * pen, mz = -dz / d * pen, ox = W.x, oz = W.z; setWagon(W, ox + mx, oz + mz);
      const B = G.bounds, bad = c.x0 < B.x0 || c.x1 > B.x1 || c.z0 < B.z0 || c.z1 > B.z1 || G.cols.some(o => o !== c && !(o.dr && o.dr.open) && o.y1 > .5 && o.x1 > c.x0 && o.x0 < c.x1 && o.z1 > c.z0 && o.z0 < c.z1);
      if (bad) { setWagon(W, ox, oz); continue; }
      if (G.mode === "pvp" && performance.now() - (W.sentAt || 0) > 90) { W.sentAt = performance.now(); nsend({ t: "wagon", i: W.i, x: +W.x.toFixed(3), z: +W.z.toFixed(3) }); } }
  }
  /* crouch (owner Oct 28): hold the crouch key (phone: CROUCH toggles); slower, lower eyes and hitbox, fits under low stuff; you stay down while something is over your head */
  function headBlocked(p) { for (const c of nearCols(p.x, p.z)) { if (c.dr && c.dr.open) continue; if (c.y0 > p.y + 1.15 && c.y0 < p.y + 1.75 && p.x + .3 > c.x0 && p.x - .3 < c.x1 && p.z + .3 > c.z0 && p.z - .3 < c.z1) return true; } return false; }
  function stepPlayer(dt) {
    const p = G.p, k = G.keys; let fx = 0, fz = 0, run = false; if (G.dead) { G.moving = 0; return; }
    if (G.jumpQ && G.crK > .3) { G.crTog = false; G.crSup = true; const cb = G.hud.querySelector("#wwBC"); if (cb) cb.classList.remove("lit"); } /* jumping stands you up (owner) */
    if (!G.act.crouch) G.crSup = false;
    { const want = !!((G.act.crouch && !G.set.crToggle && !G.crSup) || G.crTog) && !(G.car && G.car.mine); G.crouch = want || (G.crK > .5 && headBlocked(p)); G.crK = (G.crK || 0) + ((G.crouch ? 1 : 0) - (G.crK || 0)) * Math.min(1, dt * 12); }
    if (G.mantle) { const m = G.mantle; m.t += dt / .34; const q = Math.min(1, m.t), up = Math.min(1, q * 1.6), fw = Math.max(0, (q - .45) / .55);
      p.y = m.y0 + (m.y1 - m.y0) * up * up * (3 - 2 * up); p.x = m.x0 + (m.x1 - m.x0) * fw; p.z = m.z0 + (m.z1 - m.z0) * fw; p.vx = p.vz = p.vy = 0;
      if (q >= 1) { G.mantle = null; p.ground = true; SFX.step(true); } G.jumpQ = false; G.moving = 0; return; }
    const A = G.act; if (A.fwd || k.ArrowUp) fz += 1; if (A.back || k.ArrowDown) fz -= 1; if (A.left || k.ArrowLeft) fx -= 1; if (A.right || k.ArrowRight) fx += 1; if (A.run) run = true;
    const st = Object.values(G.touches).find(q => q.kind === "stick"); if (st && st.mx != null) { fx += st.mx; fz -= st.my; if (Math.hypot(st.mx, st.my) > .92) run = true; }
    const ads = G.adsK > .5, len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const sp = G.crouch ? (ads ? 1.7 : 2.6) : ads ? 1.8 : run ? 9 : 5.6, sy = Math.sin(G.yaw), cy = Math.cos(G.yaw);
    const vx = (-sy * fz + cy * fx) * sp, vz = (-cy * fz - sy * fx) * sp;
    if (!(ads && !p.ground)) { p.vx = (p.vx || 0) + (vx - (p.vx || 0)) * Math.min(1, dt * 12); p.vz = (p.vz || 0) + (vz - (p.vz || 0)) * Math.min(1, dt * 12); } /* aiming mid-jump keeps your speed (owner) */
    p.x += p.vx * dt; p.z += p.vz * dt; pushWagons(p, .32, dt); collide(p, .32);
    const lad = (G.ladders || []).find(l => p.x > l.x0 && p.x < l.x1 && p.z > l.z0 && p.z < l.z1 && p.y < l.top);
    if (lad && (fz > .2 || (G.onLad && fz < -.2))) {
      const prev = p.y; p.y = Math.max(0, Math.min(lad.top, p.y + (fz > 0 ? 2.8 : -2.8) * dt)); p.vy = 0; p.ground = false; G.onLad = true;
      if (Math.floor(prev / .32) !== Math.floor(p.y / .32)) SFX.step(true); G.jumpQ = false; G.moving = 0; return;
    }
    G.onLad = !!lad && G.onLad;
    const g = groundAt(p.x, p.z, p.y, .32);
    if ((G.jumpQ || G.act.jump || k.Space) && !G.onLad && !(G.car && G.car.mine) && (!p.ground || G.jumpQ) && tryMantle(p, p.ground)) { G.jumpQ = false; return; }
    if (G.jumpQ && p.ground) { p.vy = 6.37; p.ground = false; } /* 1.5× the old jump height */ G.jumpQ = false;
    p.vy -= 16 * dt; p.y += p.vy * dt; if (p.y <= g) { if (!p.ground && p.vy < -4) SFX.step(g > .1); p.y = g; p.vy = 0; p.ground = true; } else if (p.y > g + .05) p.ground = false;
    if (p.ground && g - p.y > -.5 && g > p.y) p.y = g;
    const moving = Math.hypot(p.vx, p.vz); if (p.ground && moving > .5) { const prev = G.bob; G.bob += dt * moving * 1.9; if (Math.floor(prev / Math.PI) !== Math.floor(G.bob / Math.PI)) SFX.step(g > .1); }
    G.moving = moving;
  }

  /* ---------------- shooting ---------------- */
  const MAGS = { rv: 6, sn: 1 }, RLS = { rv: 1.7, sn: 2.0 }, FIRE_GAP = { rv: 260, sn: 400 }; /* sniper = bolt action (owner): one round, ~2 s to work the bolt after every shot */
  function swapGun() { if (G.state !== "play" || (G.car && G.car.mine)) return; G.amm[G.wpn] = G.ammo; G.wpn = G.wpn === "rv" ? "sn" : "rv"; G.ammo = G.amm[G.wpn]; G.reloading = 0;
    G.aimToggle = false; G.gun.visible = G.wpn === "rv"; G.gunS.visible = G.wpn === "sn"; G.recoil = .6; SFX.reload(); drawAmmo(); banner("", G.wpn === "sn" ? "Sniper · aim in to scope (5×)" : "Revolver");
    if (G.mode === "pvp") nsend({ t: "wpn", w: G.wpn }); const b = G.hud.querySelector("#wwBW"); if (b) b.textContent = "SWAP"; }
  function reload() { if (G.reloading || G.ammo >= MAGS[G.wpn]) return; G.reloading = RLS[G.wpn]; SFX.reload(); if (G.mode === "pvp") nsend({ t: "rl", w: G.wpn }); }
  function fire() {
    if (G.state !== "play" || G.dead || (G.car && G.car.mine)) return; const now = performance.now();
    if (G.reloading) return; if (now - G.lastShot < FIRE_GAP[G.wpn]) return; if (G.ammo <= 0) { SFX.click(); reload(); return; }
    const sn = G.wpn === "sn", scoped = G.aimHeld || G.aimToggle; /* sniper: perfect the instant you aim in (quick scopes), wild from the hip */
    G.lastShot = now; G.ammo--; drawAmmo(); G.recoil = sn ? 1.6 : 1; G.flashT = .05; if (sn) { G.vmul = 1.5; SFX.shot(); G.vmul = 1; } else SFX.shot(); sesAdd("shots", 1);
    const T = THREE, cam = G.cam, dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const spread = sn ? (scoped ? 0 : .28) : G.adsK > .5 ? .0015 : (.006 + Math.min(1, G.moving / 6) * .02 + (G.p.ground ? 0 : .03));
    dir.x += (Math.random() - .5) * spread; dir.y += (Math.random() - .5) * spread; dir.z += (Math.random() - .5) * spread; dir.normalize();
    const o = G.tpOn ? new T.Vector3(G.p.x, G.p.y + 1.62 - .57 * (G.crK || 0), G.p.z) : cam.getWorldPosition(new T.Vector3()); /* third person: the shot still leaves your eyes */
    if (G.mode === "pvp") { nsend({ t: "shot", d: [dir.x, dir.y, dir.z], w: G.wpn }); G.prot = 0; }
    let best = { t: 300, kind: "none" };
    if (G.mode === "pvp" && G.net) for (const R of G.net.pl.values()) { if (!R.alive || !R.root || R.dying) continue; const p = R.root.position;
      for (const [y, r] of ((R.flags || 0) & 32) ? [[1.1, .25], [.75, .46], [.35, .44]] : [[1.68, .25], [1.2, .46], [.6, .44]]) { const t = raySphere(o, dir, { x: p.x, y: p.y + y, z: p.z }, r); if (t != null && t < best.t) best = { t, kind: "player" }; } }
    for (const s of G.shoot) { const t = raySphere(o, dir, s.c, s.r); if (t != null && t < best.t) best = { t, kind: s.kind, s }; }
    for (const b of G.bottles) { if (!b.alive) continue; const t = raySphere(o, dir, b.c, b.r); if (t != null && t < best.t) best = { t, kind: "bottle", b }; }
    for (const w of G.weeds) { const t = raySphere(o, dir, w.g.position, .45); if (t != null && t < best.t) best = { t, kind: "weed", w }; }
    for (const c of G.cols) { if ((c.dr && c.dr.open) || c.gw) continue; const r = rayBox(o, dir, c); if (r && r.t < best.t) best = { t: r.t, kind: "wall", c, n: r.n }; }
    for (const w of G.wins) { if (w.broken) continue; const r = rayBox(o, dir, w.box); if (r && r.t < best.t) best = { t: r.t, kind: "glass", w }; }
    if (G.car && G.car.alive) { const t = carRay(o, dir); if (t != null && t < best.t) best = { t, kind: "car" }; }
    if (dir.y < 0) { const t = -o.y / dir.y; if (t < best.t) best = { t, kind: "ground", n: new T.Vector3(0, 1, 0) }; }
    if (sn) setTimeout(() => { if (G && G.wpn === "sn") reload(); }, 120); /* work the bolt */
    const hp = o.clone().addScaledVector(dir, best.t);
    if (["bottle", "bell", "gong", "weed"].includes(best.kind)) sesAdd("hits", 1);
    if (best.kind === "bottle") { breakBottle(best.b, dir); hitMark(); sesAdd("bottles", 1); }
    else if (best.kind === "bell") { if (G.mode !== "pvp") ringBell(); hitMark(); }
    else if (best.kind === "gong") { SFX.metal(); G.gong.v += 4; hitMark(); if (G.mode !== "pvp") chalStart(); }
    else if (best.kind === "weed") { best.w.vy = 4; best.w.vx *= -1.2; puff(hp, .6); hitMark(); }
    else if (best.kind === "wall") { puff(hp, .35); hole(hp, best.n); (SFX[best.c.mat] || SFX.wood)(); }
    else if (best.kind === "ground") { puff(hp, .5); SFX.dirt(); }
    else if (best.kind === "glass") { hitGlass(best.w.i, hp, dir); }
    else if (best.kind === "car") { SFX.metal(); puff(hp, .3); if (G.mode !== "pvp") carDamage(34); }
    if (best.kind === "bell" && G.mode === "pvp") nsend({ t: "bell" });
  }
  function raySphere(o, d, c, r) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc; if (h < 0) return null; const t = -b - Math.sqrt(h); return t > 0 ? t : null; }
  /* phone aim assist (owner Oct 28): only on touch, only in PvP. When an enemy you can see is close to the crosshair, look sensitivity drops
     a little (friction) and, while you're turning or moving, the aim drifts gently toward their chest. Never snaps, never through walls. */
  function aimAssist(dt) {
    const A = G.aa || (G.aa = { near: false, t: null, chk: 0 }); A.near = false;
    if (!TOUCH || G.set.aa === false || G.mode !== "pvp" || !G.net || G.state !== "play" || G.dead || (G.car && G.car.mine) || !G.p) return;
    const T = THREE, now = performance.now(), eye = new T.Vector3(G.p.x, G.p.y + 1.62 - .57 * (G.crK || 0), G.p.z), sn = G.wpn === "sn" && G.adsK > .5;
    const cone = (sn ? 1.2 : G.adsK > .5 ? 3.2 : 4.5) * Math.PI / 180; let best = null;
    for (const R of G.net.pl.values()) { if (!R.alive || !R.root || !R.root.visible || R.dying || ((R.flags || 0) & 1)) continue;
      const q = R.root.position, cy = ((R.flags || 0) & 32) ? .75 : 1.2, dx = q.x - eye.x, dy = q.y + cy - eye.y, dz = q.z - eye.z, d = Math.hypot(dx, dy, dz); if (d < 1 || d > 70) continue;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz)); let ey = ty - G.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey)); const ep = tp - G.pitch, e = Math.hypot(ey, ep);
      if (e < cone && (!best || e < best.e)) best = { R, ey, ep, e, d, dir: new T.Vector3(dx / d, dy / d, dz / d) }; }
    if (!best) { A.t = null; return; }
    if (A.t !== best.R || now - A.chk > 150) { A.chk = now; A.t = best.R; A.vis = true; /* line of sight, a few times a second */
      for (const c of G.cols) { if ((c.dr && c.dr.open) || c.gw || c.y1 < Math.min(eye.y, eye.y + best.dir.y * best.d) - .1) continue; const r = rayBox(eye, best.dir, c); if (r && r.t < best.d - .5) { A.vis = false; break; } } }
    if (!A.vis) return; A.near = true;
    const active = now - (G.lookAt || 0) < 160 || (G.moving || 0) > .5; if (!active) return;
    const k = Math.min(1, dt * (G.adsK > .5 ? 2.2 : 1.6)) * (1 - best.e / cone); G.yaw += best.ey * k; G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch + best.ep * k * .6));
  }
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
  function drawAmmo() { const a = G.hud && G.hud.querySelector("#wwAmmo"); if (!a) return; let h = ""; for (let i = 0; i < MAGS[G.wpn || "rv"]; i++) h += `<i class="${i < G.ammo ? "" : "off"}"></i>`; a.innerHTML = h + (G.reloading ? `<span>RELOADING</span>` : G.ammo === 0 ? `<span>${TOUCH ? "Tap ↻ to reload" : esc(keyName(G.set.keys.reload)) + " to reload"}</span>` : ""); }
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
  function killFeed(killer, victim, hs, bb, mine, how) { if (how === "quit" && !killer) return feed(`<b>${esc(victim)}</b> <span style="opacity:.7">left town</span>${bb ? ` · ${Math.round(bb).toLocaleString()} BB gone` : ""}`, mine);
    feed(`<b>${esc(killer)}</b> <span style="opacity:.7">${how === "car" ? "ran over" : how === "boom" ? "blew up" : how === "quit" ? "got the kill on" : "shot"}</span> ${esc(victim)}${hs ? ` <span class="hs">· headshot</span>` : ""}${bb ? ` · ${Math.round(bb).toLocaleString()} BB` : ""}`, mine); }
  /* free-for-all HUD: your points, the clock, the leader; the end-of-match board */
  function ffaChip() { const N = G.net, e = G && G.hud.querySelector("#wwBB"); if (!e || !N || !N.ffa) return; const f = N.fi || {}, t = Date.now() + (N.off || 0);
    const wait = f.start && t < f.start, left = Math.max(0, (wait ? f.start : f.end || t) - t), mm = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`, lead = (f.top || [])[0];
    e.className = "wwchip wwbb"; e.innerHTML = `<b>${(N.pts || 0).toLocaleString()}</b> pts · ${wait ? "next match " : ""}${mm}`;
    let lb = G.hud.querySelector("#wwLb"); if (!lb) { lb = document.createElement("div"); lb.id = "wwLb"; lb.className = "wwsb"; G.hud.appendChild(lb); }
    const all = (f.top || []).map((r, i) => [i, r]), mine = all.find(x => x[1][0] === N.name), show = all.slice(0, 5); if (mine && mine[0] >= 5) show.push(mine); /* top 5 + you */
    const h = show.map(([i, r]) => `<div${r[0] === N.name ? ' class="me"' : ""}><i>${i + 1}</i><span>${esc(r[0])}</span><b>${r[1]}</b></div>`).join(""); if (lb._h !== h) { lb._h = h; lb.innerHTML = h; } }
  function ffaEnd(m) {
    const N = G.net; sesAdd("matches", 1); saveStats(); const me = N && N.pid, rows = (m.board || []).map((r, i) => `<tr${r[0] === (N && N.name) ? ' class="me"' : ""}><td>${i + 1}</td><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("");
    const won = m.wpid && m.wpid === me;
    const d = document.createElement("div"); d.className = "wwffaend"; d.innerHTML = `<h3>${won ? "You won the match" : m.winner ? `${esc(m.winner)} wins` : "Match over"}</h3>
      <p>${m.paid ? `${won ? "You get" : "They get"} <b>${(m.prize || 1000).toLocaleString()} BB</b>` : m.players < 2 ? "No prize: it takes 2 or more players" : "No prize: nobody scored"}</p>
      <table><tr><th></th><th>Player</th><th>Pts</th><th>Kills</th><th>HS</th></tr>${rows}</table><small>Next match in ${Math.round((m.next || 10000) / 1000)} seconds</small>`;
    G.hud.appendChild(d); setTimeout(() => d.remove(), (m.next || 10000) - 500); if (N) N.pts = 0; if (won) SFX.ding();
  }
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
    try { const r = await fetch(API().server + "/status", { cache: "no-store" }); const j = await r.json(); G.server = { up: !!j.up, checked: true, ffa: j.ffa || null, n: j.n != null ? j.n : (j.rooms || []).reduce((a, x) => a + x.n, 0) }; }
    catch (_) { G.server = { up: false, checked: true, n: 0, rooms: [] }; }
    if (G && G.state === "menu" && G.ready) showMenu(false);
  }
  /* buy-in slider (owner Oct 28): any amount from 100 to 10,000 BB, everyone plays in the same town */
  const BUY_MIN = 100, BUY_MAX = 10000;
  function showTiers(msg) {
    G.state = "menu"; const bal = API().balance ? API().balance() : 0, n = (G.server && G.server.n) || 0, top = Math.min(BUY_MAX, Math.floor(bal / 100) * 100);
    if (top < BUY_MIN) { G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Join game</h2><p>You need at least ${BUY_MIN} BB to buy in. Your balance: <b>${bal.toLocaleString()} BB</b>.</p><div class="wwrow"><button data-ww="menu">Back</button></div></div></div>`; return; }
    const v = Math.max(BUY_MIN, Math.min(top, G.buyAmt || Math.min(1000, top)));
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Join game</h2>
      <p style="margin:0 0 4px">Every kill adds your buy-in to your stack. When you die you walk out with <b>half your stack</b>, so 1 kill breaks even. <b>No cashing out:</b> your run only ends when you die, and leaving counts as dying.</p>
      <div class="wwbuy"><div class="wwbuyv"><span>Buy-in</span><b id="wwBuyV">${v.toLocaleString()} BB</b><small>${n} in town</small></div>
        <input type="range" id="wwBuy" min="${BUY_MIN}" max="${top}" step="100" value="${v}">
        <div class="wwbuyq">${[100, 500, 1000, 2500, 5000, 10000].filter(x => x <= top).map(x => `<button data-wwbq="${x}">${x >= 1000 ? x / 1000 + "K" : x}</button>`).join("")}</div></div>
      <p style="opacity:.75;margin:4px 0 0">Balance <b>${bal.toLocaleString()} BB</b>${msg ? ` · <span style="color:#ffb3a0">${esc(msg)}</span>` : ""}</p>
      <div class="wwrow"><button data-ww="menu">Back</button><button data-ww="rules">Rules</button><button class="pri" id="wwBuyGo" data-wwtier="${v}">Buy in · ${v.toLocaleString()} BB</button></div></div></div>`;
    const r = G.ui.querySelector("#wwBuy"), upd = x => { x = Math.max(BUY_MIN, Math.min(top, Math.round(x / 100) * 100)); G.buyAmt = x; r.value = x;
      G.ui.querySelector("#wwBuyV").textContent = x.toLocaleString() + " BB"; const g = G.ui.querySelector("#wwBuyGo"); g.dataset.wwtier = x; g.textContent = `Buy in · ${x.toLocaleString()} BB`; };
    r.addEventListener("input", () => upd(+r.value)); G.ui.querySelectorAll("[data-wwbq]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); upd(+b.dataset.wwbq); }));
  }
  /* Join game → pick: free-for-all (free, points, 1,000 BB to the winner) or the buy-in shootout */
  function showModes() {
    G.state = "menu"; const f = (G.server && G.server.ffa) || {}, n = (G.server && G.server.n) || 0, left = f.end ? Math.max(0, f.end - Date.now()) : 0;
    G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>Join game</h2><div class="wwmm">
      <button class="pri${f.up ? "" : " soon"}" data-ww="ffa"><span>Free for all</span><small>Free · 5-minute matches · winner gets 1,000 BB · ${f.n || 0} playing${left && f.n ? ` · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")} left` : ""}</small></button>
      ${API().admin && API().admin() ? `<button data-ww="buyin"><span>Buy-in shootout</span><small>Admins only for now · 100 – 10,000 BB · ${n} in town</small></button>` : `<button class="soon" disabled><span>Buy-in shootout</span><small>Coming soon</small></button>`}</div>
      <div class="wwrow"><button data-ww="menu">Back</button><button data-ww="rules">Rules</button></div></div></div>`;
  }
  async function joinFfa() {
    showBusy("Connecting…");
    try { const net = await netOpen("ffa"); showBusy(net.active ? "Back into your match…" : "Riding into town…"); nsend({ t: "join", buy: null }); }
    catch (e) { showModes(); const b = G.ui.querySelector("[data-ww=ffa] small"); if (b) b.textContent = e.message || "Couldn't join."; }
  }
  function showRules() {
    G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwsc"><h2>How shootouts work</h2><div class="wwrules">
      <div><b>Health.</b> Everyone has 100 HP (shown over their heads). After 7 seconds without getting hit you heal about 6 HP a second.</div>
      <div><b>Damage.</b> Body shot 34 (3 to kill). Past 40 m a body shot does 25. <b>Headshot 100: one shot kills.</b></div>
      <div><b>Same hitbox.</b> Every character is hit the same, whatever skin they wear: a body cylinder and a head ball, a little bigger than the models.</div>
      <div><b>Kills.</b> Every kill adds your own buy-in to your stack (whatever the other player bought in for). Their run ends.</div>
      <div><b>The car.</b> 500 HP. Getting hit by it hurts more the faster it's going (near full speed kills). You can shoot the driver. Shoot it to wreck it: everyone inside or within 6 m dies, and whoever wrecked it gets the kills. It comes back after 1 minute.</div>
      <div><b>Guns.</b> Revolver: 6 shots, 34 body (25 past 40 m), 100 head. Sniper (switch with the gun key): bolt action, one shot then about 2 seconds to work the bolt, and any hit kills (100 body, 150 head, any range). From the hip the sniper has no crosshair and sprays everywhere; the moment you aim in it zooms 5× and is dead accurate. Crouching shrinks you (head at 1.1 m) and slows you down.</div>
      <div><b>Ending a run.</b> There's no cashing out: your run ends when you die. You walk out with half your stack: no kills = half your buy-in back, 1 kill = break even, 3 kills = double. Leaving the match counts as dying (the last person who hit you gets the kill). 3 seconds of spawn protection when you spawn.</div>
      <div><b>Free for all.</b> Free to play, 5-minute matches, hit Respawn 3 seconds after dying. A kill is 100 points, a headshot kill 150. Most points when the clock runs out wins 1,000 BB, paid only if 2 or more people played in that match.</div>
      </div><div class="wwrow"><button class="pri" data-ww="join">Back</button></div></div></div>`;
    G.ui.querySelector(".wwrules div:last-child").innerHTML = `<b>Free for all.</b> Free to play, 5-minute matches, hit Respawn 3 seconds after dying. Every kill is 100 points, plus 50 more if it was a headshot (150). Most points when the clock runs out wins 1,000 BB, paid only if 2 or more people played in that match. Every player's score is on the board on the right.`;
  }
  function netMsg(t) { const e = G.ui.querySelector(".wwnetmsg"); if (e) e.textContent = t; }
  function showBusy(t) { G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>BiggieTown</h2><p class="wwnetmsg">${esc(t)}</p></div></div>`; }
  /* connect (or reuse the connection) and sign in with the app's token */
  function netOpen(mode) {
    mode = mode || "money";
    return new Promise((res, rej) => {
      const N = G.net; if (N && N.ws && N.ws.readyState === 1 && N.authed && (N.mode || "money") === mode) return res(N);
      if (N && N.ws && N.ws.readyState <= 1) { N.leaving = true; try { N.ws.close(); } catch (_) {} }
      const ws = new WebSocket(API().server.replace(/^http/, "ws") + (mode === "ffa" ? "/ffa" : "/ws")); const net = G.net = Object.assign(G.net || {}, { ws, mode, ffa: mode === "ffa", authed: false, leaving: false, pl: N && N.pl || new Map(), off: 0, rtt: 120 });
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
      tier = Math.round(tier); if (!(tier >= BUY_MIN && tier <= BUY_MAX)) return showTiers("Pick 100 to 10,000 BB.");
      if ((API().balance ? API().balance() : 0) < tier) return showTiers("Not enough BB for that buy-in.");
      showBusy(`Paying the ${tier.toLocaleString()} BB buy-in…`);
      const id = await API().buyIn(tier); net.buyId = id; net.tierWant = tier; nsend({ t: "join", buy: id });
    } catch (e) { showTiers(e.message || "Couldn't join."); }
  }
  function onNetClose(ws) {
    const net = G && G.net; if (!net || net.ws !== ws) return; net.authed = false;
    if (G.mode === "pvp" && !net.leaving) { /* dropped: reconnect and resume (the server keeps the run for 10 s) */
      banner("Reconnecting…", ""); let tries = 0; const again = () => { if (!G || G.mode !== "pvp") return; tries++;
        netOpen(net.mode).then(n => { if (n.active || n.ffa) nsend({ t: "join", buy: null }); else pvpEnd(); }).catch(() => { if (tries < 4) setTimeout(again, 1500); else { banner("Lost the connection", "You'll be paid out if your run ended"); pvpEnd(); } }); };
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
        (m.doors || []).forEach((o, i) => { if (G.doors[i]) G.doors[i].open = !!o; }); (m.wagons || []).forEach((q, i) => { const W = (G.wagons || [])[i]; if (W && q) setWagon(W, q[0], q[1]); });
        G.wins.forEach(w => fixGlass(w.i)); (m.glass || []).forEach(e => { const [i, st, u, v] = Array.isArray(e) ? e : [e, 2, .5, .5]; const w = G.wins[i]; if (!w) return;
          if (st === 1) crackGlass(i, u, v, false); else if (!w.broken) { w.broken = Date.now(); G.winMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); } }); G.winMesh.instanceMatrix.needsUpdate = true;
        if (G.car) { G.car.mine = false; if (m.car) carState(m.car, true); }
        const s = m.spawn; G.p = { x: s[0], y: s[1], z: s[2], vy: 0, ground: true }; G.yaw = s[3]; G.pitch = 0; G.amm = { rv: 6, sn: 1 }; G.ammo = MAGS[G.wpn || "rv"]; G.reloading = 0; drawAmmo(); if (G.wpn === "sn") nsend({ t: "wpn", w: "sn" });
        G.prot = performance.now() + (m.prot || 0); N.startStack = m.tier; setBB(N.stack - N.tier);
        if (!N.pingT) N.pingT = setInterval(() => nsend({ t: "ping", c: Date.now(), rtt: N.rtt }), 2000);
        nsend({ t: "ping", c: Date.now() }); hudPvp(true); G.dead = false; N.ffa = !!m.ffa; N.pts = 0; if (m.ffa) { N.fi = m.ffa; ffaChip(); } play();
        if (m.ffa) banner("Free for all", "5-minute match · most points wins 1,000 BB"); else banner("Draw!", `${m.tier.toLocaleString()} BB buy-in · last one standing wins`); return;
      }
      case "err": showTiers(m.why); return;
      case "pong": { const r = Date.now() - m.c; N.rtt = N.rtt ? N.rtt * .7 + r * .3 : r; N.off = m.s + r / 2 - Date.now(); return; }
      case "add": addRemote(m); return;
      case "rm": { const R = N.pl.get(m.n); if (R) { R.gone = true; if (!R.dying) rmRemote(R), N.pl.delete(m.n); } return; }
      case "s": {
        const seen = new Set();
        for (const e of m.p) { const [n, x, y, z, yaw, pitch, fl, stack, hp] = e; if (n === N.n) { if (stack !== N.stack) { N.stack = stack; setBB(stack - N.tier); } continue; }
          let R = N.pl.get(n); if (!R) R = addRemote({ n, name: "…", skin: null, stack });
          R.stack = stack; R.flags = fl; R.hp = hp == null ? 100 : hp; R.snaps.push([m.ts, x, y, z, yaw, pitch]); if (R.snaps.length > 40) R.snaps.shift(); R.alive = true; seen.add(n); }
        for (const R of N.pl.values()) if (!seen.has(R.n) && !R.dying) R.alive = false;
        setLive(m.live); N.hp = m.hp; drawHp(); if (m.ffa) { N.fi = m.ffa; N.pts = m.pts || 0; ffaChip(); } N.cash = m.cash || 0; if (m.car) carState(m.car, false);
        if (m.ammo >= 0 && !G.reloading && m.ammo !== G.ammo && (m.aw || "rv") === G.wpn) { G.ammo = m.ammo; drawAmmo(); }
        return;
      }
      case "stack": N.stack = m.stack; if (!N.ffa) setBB(m.stack - N.tier); return;
      case "respawn": { if (G.car && G.car.mine) carExit(true); const s = m.spawn; G.dead = false; G.p = { x: s[0], y: s[1], z: s[2], vy: 0, ground: true }; G.yaw = s[3]; G.pitch = 0; G.amm = { rv: 6, sn: 1 }; G.ammo = MAGS[G.wpn || "rv"]; G.reloading = 0; drawAmmo();
        if (G.wpn === "sn") nsend({ t: "wpn", w: "sn" }); N.hp = 100; drawHp(); G.prot = performance.now() + (m.prot || 0); hudPvp(true); if (G.state !== "play" && G.ui.querySelector("#wwRsp")) play(); return; }
      case "ffaend": ffaEnd(m); return;
      case "door": setDoor(m.i, !!m.open, false); return;
      case "glass": if (m.s === 1) crackGlass(m.i, m.u, m.v, false); else breakGlass(m.i, null, false); return;
      case "glassfix": fixGlass(m.i); return;
      case "wagon": { const W = (G.wagons || [])[m.i]; if (W && Number.isFinite(m.x) && Number.isFinite(m.z)) setWagon(W, m.x, m.z); return; }
      case "bell": ringBell(); return;
      case "boom": carBoom(m.x, m.z, false); return;
      case "car": { const c = G.car; if (m.on) { c.mine = true; c.driver = N.n; c.tgt = null; banner("", "Driving · run them over"); } else { if (c.mine) carExit(true); if (m.why) banner("", m.why); } return; }
      case "pos": G.p.x = m.x; G.p.y = m.y; G.p.z = m.z; return;
      case "fx": { const R = N.pl.get(m.n); if (!R || !R.root) return; const from = R.root.position.clone().add(new T.Vector3(0, 1.45, 0)); tracer(from, new T.Vector3(...m.e));
        const d = from.distanceTo(G.cam.position); G.vmul = Math.max(.08, Math.min(1, 9 / (d + 4))); SFX.shot(); G.vmul = 1; if (R.u) R.flashT = .06; return; }
      case "hit": { N.hp = m.hp; drawHp(); dmgFx(m.from); return; }
      case "hc": { if (m.prot) { banner("", "Spawn protected"); return; } hitMark(m.hs); if (m.kill) SFX.ding(); sesAdd("hits", 1); return; }
      case "kill": { const mine = m.kn === N.n || m.vn === N.n; killFeed(m.k, m.v, m.hs, m.amt, mine, m.how); if (m.kn === N.n) { N.kills++; sesAdd("kills", 1); banner(m.hs ? "Headshot" : "Got 'em", N.ffa ? (m.pts ? `+${m.pts} points` : "Between matches · no points") : `+${m.amt.toLocaleString()} BB`); if (N.ffa) { N.pts += m.pts || 0; ffaChip(); } }
        const R = N.pl.get(m.vn); if (R) R.dying = performance.now(); return; }
      case "dead": { try { document.exitPointerLock && document.exitPointerLock(); } catch (_) {}
        if (m.ffa) { sesAdd("deaths", 1); G.dead = true; G.fireHeld = false; G.aimHeld = false; G.aimToggle = false; G.act = {}; if (G.car && G.car.mine) carExit(true); G.state = "menu";
          const wait = m.ms || 3000, t0 = performance.now();
          G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>${m.by ? `${esc(m.by)} got you` : "You died"}</h2><p>${N.pts || 0} points this match</p>
            <div class="wwgrid"><button class="pri" id="wwRsp" data-ww="respawn" disabled>Respawn in ${Math.ceil(wait / 1000)}</button><button data-ww="leave">Leave match</button></div></div></div>`;
          const tick = () => { const b = G && G.ui.querySelector("#wwRsp"); if (!b) return; const left = wait - (performance.now() - t0); if (left <= 0) { b.disabled = false; b.textContent = "Respawn"; return; } b.textContent = `Respawn in ${Math.ceil(left / 1000)}`; setTimeout(tick, 200); }; tick(); return; }
        G.mode = "dead"; sesAdd("deaths", 1); hudPvp(false); G.state = "menu";
        G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Shot down</h2><p>${m.by ? `<b>${esc(m.by)}</b> got you.` : "You're out."}</p><p>You walk out with half your stack: <b>${m.keep.toLocaleString()} BB</b>.</p><p class="wwnetmsg" style="opacity:.7">Paying out…</p></div></div>`; return; }
      case "out": { try { document.exitPointerLock && document.exitPointerLock(); } catch (_) {} if (m.ffa) { saveStats(); pvpEnd(true); showMenu(false); return; }
        const net = m.amt - (m.buy || N.tier || 0); sesAdd("bb", net); sesAdd("matches", 1); saveStats(); pvpEnd(true);
        const why = m.reason === "dead" ? "Walked out" : m.reason === "quit" ? "Left the match" : "Match ended";
        G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>${why}</h2>
          <p style="font:400 30px Rye,Georgia,serif;color:${net >= 0 ? "#9dffb0" : "#ffb3a0"};margin:4px 0">${net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString()} BB</p>
          <p>${m.amt.toLocaleString()} BB paid to your balance · ${m.kills || 0} kill${m.kills === 1 ? "" : "s"}</p>
          <div class="wwgrid"><button class="pri" data-wwtier="${m.buy || N.tier}">Buy back in</button><button data-ww="menu">Main menu</button></div></div></div>`; return; }
      case "cash": { if (!m.on && m.why === "hit") banner("", "Cash out cancelled: you got hit"); G.cashing = !!m.on; return; }
      case "emo": { if (m.n === N.n) { startOwnEmote(m.id); return; } const R = N.pl.get(m.n); if (R) R.emo = { id: m.id, t0: performance.now() }; return; }
    }
  }
  function pvpEnd(keepConn) {
    { const lb = G.hud.querySelector("#wwLb"); if (lb) lb.remove(); }
    const N = G.net; G.mode = "lobby"; hudPvp(false); G.cashing = false; if (N) { for (const R of N.pl.values()) rmRemote(R); N.pl.clear(); }
    setLive(1); setBB(G.ses.bb); stopOwnEmote(); if (!keepConn && N && N.ws) { N.leaving = true; try { N.ws.close(); } catch (_) {} }
  }
  /* leave from the pause menu: the server keeps your body 10 s (or counts it as a death if you were hit in the last 10 s) */
  function leaveMatch() { const N = G.net; if (N) N.leaving = true; const wasFfa = N && N.ffa; try { N && N.ws && N.ws.close(); } catch (_) {} pvpEnd(true);
    if (wasFfa) { saveStats(); showMenu(false); return; }
    G.state = "menu"; G.ui.innerHTML = `<div class="wwpanel"><div class="wwcard wwpz"><h2>Left the match</h2><p>Leaving counts as dying: you walk out with half your stack. It shows up in your balance in a few seconds.</p>
      <div class="wwgrid"><button class="pri" data-ww="menu">Main menu</button><button class="dang" data-ww="exit">Exit to casino</button></div></div></div>`; }

  /* ---- remote players: their equipped skin (or an animal), standing, walking, aiming, emoting ---- */
  const ANIM_K = ["bear", "cat", "rat", "fox"];
  function addRemote(m) {
    const N = G.net; let R = N.pl.get(m.n);
    if (R) { const skinChanged = R.skin !== m.skin && m.name !== "…"; R.name = m.name || R.name; R.stack = m.stack; if (skinChanged) { rmRemote(R); R.root = null; R.skin = m.skin; } }
    else { const mm = N.meta && N.meta.get(m.n); if (mm && m.name === "…") { m.name = mm.name; m.skin = mm.skin; }
      R = { n: m.n, name: m.name, skin: m.skin, stack: m.stack, snaps: [], ph: Math.random() * 6, speed: 0, alive: false }; N.pl.set(m.n, R); }
    if (m.name !== "…") { (N.meta = N.meta || new Map()).set(m.n, { name: m.name, skin: m.skin }); } /* respawns come back with their own skin */
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
  /* one size for everyone: scale each model so the top of its head is the top of the hitbox's head ball (1.93 m).
     Measured from the model's bounds while standing (skins load late, so it re-measures a few times). */
  function fitModel(R, now) {
    if (((R.flags || 0) & 16) || R.scN >= 6 || now - (R.scAt || 0) < (R.scN ? 1500 : 0) || R.emo || ((R.flags || 0) & 32) || (R === G.me && (G.crK || 0) > .1)) return;
    const T = THREE, r = R.root, s0 = r.scale.x; r.scale.setScalar(1); r.updateMatrixWorld(true); const b = new T.Box3().setFromObject(r), top = b.max.y - r.position.y;
    R.scAt = now; R.scN = (R.scN || 0) + 1; if (top > .4) { r.scale.setScalar(Math.max(.5, Math.min(2.5, 1.93 / top))); R.scaled = true; } else r.scale.setScalar(s0); r.updateMatrixWorld(true);
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
    const cr = R === G.me ? (G.crK || 0) : ((R.flags || 0) & 32) ? 1 : 0;
    const w = Math.min(1, R.speed / 4.5), rn = Math.max(0, Math.min(1, (R.speed - 5.5) / 3)); R.ph += dt * Math.min(9, R.speed) * (2.3 - rn * .4);
    const sw = .62 + rn * .38, kn = .95 + rn * .55; /* running: longer stride, higher knees, lean, more bounce */
    P.lh0 = Math.sin(R.ph) * sw * w; P.lh1 = -Math.sin(R.ph) * sw * w; P.lk0 = Math.max(0, -Math.sin(R.ph)) * kn * w; P.lk1 = Math.max(0, Math.sin(R.ph)) * kn * w; P.y = Math.abs(Math.sin(R.ph)) * (.035 + rn * .05) * w; P.rx = (P.rx || 0) + .2 * rn;
    P.ral = 1; P.rpx = .1; P.rpy = -.12 + Math.sin(R.pitch || 0) * 1.1; P.rpz = -1;
    P.lal = .8; P.lpx = -.28; P.lpy = -.95 + rn * .35; P.lpz = Math.sin(R.ph) * (.35 + rn * .3) * w;
    if (cr > 0) { P.rise = 1 - .45 * cr; P.lh0 = P.lh0 * .5 + .9 * cr; P.lh1 = P.lh1 * .5 + .9 * cr; P.lk0 = Math.max(P.lk0, 1.5 * cr); P.lk1 = Math.max(P.lk1, 1.5 * cr); P.rx = (P.rx || 0) + .25 * cr; } P.hx = (R.pitch || 0) * .5;
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
      if ((R.flags || 0) & 16) { const c = G.car, P = API().emLerp(API().emLDance(0), 0); P.rise = 0; if (R.gun) R.gun.visible = false; R.root.visible = !!(c && c.alive);
        R.root.rotation.set(0, c.yaw, 0); R.root.position.set(c.x + Math.sin(c.yaw) * .6, 0, c.z + Math.cos(c.yaw) * .6); API().emApply(T, R.sp, P);
        if (R.seatDY == null && R.scaled) { R.root.updateMatrixWorld(true); const hp = new T.Vector3(); R.u.head.getWorldPosition(hp); R.seatDY = 2.45 - hp.y; }
        R.root.position.y = R.seatDY || 1.1; if (R.tag) { const v = new T.Vector3(G.car.x, 3, G.car.z).project(G.cam); R.tag.style.display = v.z < 1 ? "" : "none"; R.tag.style.transform = `translate(${((v.x + 1) / 2 * G.gw).toFixed(1)}px,${((1 - v.y) / 2 * G.gh).toFixed(1)}px) translate(-50%,-100%)`; if (R.tag._h !== R.name) { R.tag._h = R.name; R.tag.innerHTML = `<b>${esc(R.name)}</b><span>${Math.round(R.stack || 0).toLocaleString()} BB</span><i>Driving</i>`; } } continue; }
      R.root.visible = true; API().emApply(T, R.sp, poseFor(R, dt, now)); vis.push(R);
      if (R.flashT > 0) { R.flashT -= dt; R.fl.visible = true; } else R.fl.visible = false;
    }
    G.scene.updateMatrixWorld();
    for (const R of vis) {
      fitModel(R, now);
      API().rrSolveArm(T, R.body, R.u.armL, sm); API().rrSolveArm(T, R.body, R.u.armR, sm);
    }
    /* name tags: name + stack, hidden behind walls (checked a few times a second) */
    const cam = G.cam, W = G.gw, H = G.gh, chk = now - (G.tagChk || 0) > 220; if (chk) G.tagChk = now;
    for (const R of vis) {
      const v = R.root.position.clone(); v.y += 2.15; const d = v.distanceTo(cam.position); const sp = v.clone().project(cam);
      const on = sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1; /* owner: tags show through walls */
      R.tag.style.display = on ? "" : "none"; if (!on) continue;
      const f = R.flags || 0, st = (f & 1) ? "Protected" : (f & 2) ? "Cashing out" : (f & 4) ? "Disconnected" : "";
      const hpv = Math.max(0, Math.min(100, Math.ceil(R.hp == null ? 100 : R.hp)));
      const html = `<b>${esc(R.name)}</b><span>${G.net && G.net.ffa ? "" : `${Math.round(R.stack || 0).toLocaleString()} BB`}</span><em class="wwthp${hpv <= 34 ? " low" : ""}"><i style="width:${hpv}%"></i><u>${hpv}</u></em>${st ? `<i>${st}</i>` : ""}`; if (R.tag._h !== html) { R.tag._h = html; R.tag.innerHTML = html; }
      R.tag.style.transform = `translate(${((sp.x + 1) / 2 * W).toFixed(1)}px,${((1 - sp.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%) scale(${Math.max(.55, Math.min(1, 14 / d)).toFixed(2)})`; R.tag.style.opacity = d > 60 ? .7 : 1;
    }
  }
  function tracer(a, b) { const T = THREE, g = new T.BufferGeometry().setFromPoints([a, b]), l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: .8 })); G.scene.add(l);
    G.parts.push({ o: l, v: new T.Vector3(), life: .09, g: 0, line: true }); }

  /* ---- your own emote: the camera swings out behind you and you see your own character dance ---- */
  function startOwnEmote(id) {
    const E = API().emote(id); if (!E) return; ensureMe(); G.me.u.head.scale.setScalar(1);
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
  /* computer (owner Oct 28): hold the emote key → a wheel in the middle of the screen; move the mouse toward one (the camera doesn't turn),
     let go of the key or click to play it; number keys work too. Aiming isn't touched. */
  /* third person (owner Oct 28; Settings or the view key): over-the-shoulder camera, pulled in by walls; aiming in goes back to first person */
  function tpCam() {
    if (!G.set.tp || G.adsK > .5 || G.state !== "play" && G.state !== "pause") return false; const T = THREE, p = G.p, cam = G.cam;
    const eye = new T.Vector3(p.x, p.y + 1.62 - .57 * (G.crK || 0), p.z), fwd = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(G.pitch, G.yaw, 0, "YXZ")), right = new T.Vector3(Math.cos(G.yaw), 0, -Math.sin(G.yaw));
    const piv = eye.clone().addScaledVector(right, .55).add(new T.Vector3(0, .25, 0)), back = fwd.clone().negate(); let L = 3.0;
    for (const c of G.cols) { if ((c.dr && c.dr.open) || c.gw) continue; const r = rayBox(piv, back, c); if (r && r.t < L) L = Math.max(.3, r.t - .2); }
    cam.position.copy(piv).addScaledVector(back, L); return true;
  }
  function ensureMe() { if (!G.me) { const R = { n: G.net ? G.net.n : 0, name: "", skin: API().mySkin ? API().mySkin() : null, snaps: [], ph: 0, speed: 0 }; mkBody(R); if (R.tag) R.tag.remove(); R.tag = null; G.me = R; } return G.me; }
  /* your own body: look down and see yourself (head hidden in first person), the whole you in third person */
  function selfBody(dt, emo, drv, tp) {
    if (emo) return; if (!tp) { if (G.me && G.me.root) G.me.root.visible = false; return; } /* owner Oct 28: first person = no body again */
    const R = ensureMe(); if (!R || !R.root) return; if (drv || !G.p || G.state === "menu") { R.root.visible = false; return; }
    const T = THREE, p = G.p, bk = tp ? 0 : .3; R.root.visible = true; R.root.position.set(p.x + Math.sin(G.yaw) * bk, p.y, p.z + Math.cos(G.yaw) * bk); R.root.rotation.set(0, G.yaw, 0);
    R.speed += (Math.min(9, G.moving || 0) - R.speed) * Math.min(1, dt * 8); R.pitch = tp ? G.pitch : 0;
    const P = poseFor(R, dt, performance.now()); if (!tp) { P.ral = 0; P.lal = 0; P.hx = 0; } if (R.gun) R.gun.visible = tp;
    API().emApply(T, R.sp, P); R.root.updateMatrixWorld(true);
    fitModel(R, performance.now());
    R.u.head.scale.setScalar(tp ? 1 : .001); const sm = r => 1 - Math.exp(-dt * r); API().rrSolveArm(T, R.body, R.u.armL, sm); API().rrSolveArm(T, R.body, R.u.armR, sm);
  }
  function emoWheel(on) {
    const el = G.hud.querySelector("#wwEmo"); if (!el) return;
    if (!on) { G.emoW = null; el.classList.remove("on", "wheel"); return; }
    const list = API().myEmotes ? API().myEmotes() : []; G.emoW = { list, sel: -1, ax: 0, ay: 0 }; el.classList.add("wheel");
    const n = list.length, R = 118;
    el.innerHTML = n ? list.map((e, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; return `<button data-wwemo="${e.id}" style="left:${170 + Math.cos(a) * R}px;top:${170 + Math.sin(a) * R}px">${i < 9 ? `${i + 1} · ` : ""}${esc(e.n)}</button>`; }).join("") + `<i>Move the mouse, let go to play</i>`
      : `<i>No emotes yet · get them in the Aura Shop</i>`; el.classList.add("on");
  }
  function emoAim(dx, dy) { const W = G.emoW, n = W.list.length; if (!n) return; W.ax = Math.max(-120, Math.min(120, W.ax + dx)); W.ay = Math.max(-120, Math.min(120, W.ay + dy));
    let sel = -1; if (Math.hypot(W.ax, W.ay) > 28) { let a = Math.atan2(W.ay, W.ax) + Math.PI / 2; a = (a % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); sel = Math.round(a / (Math.PI * 2) * n) % n; }
    if (sel !== W.sel) { W.sel = sel; G.hud.querySelectorAll("#wwEmo button").forEach((b, i) => b.classList.toggle("sel", i === sel)); } }
  function emoteMenu() {
    const list = API().myEmotes ? API().myEmotes() : [], el = G.hud.querySelector("#wwEmo"); if (!el) return;
    if (el.classList.contains("on")) { el.classList.remove("on"); return; }
    el.innerHTML = list.length ? list.map(e => `<button data-wwemo="${e.id}">${esc(e.n)}</button>`).join("") : `<span>No emotes yet · get them in the Aura Shop</span>`; el.classList.add("on");
  }
  function playEmote(id) { const el = G.hud.querySelector("#wwEmo"); if (el) el.classList.remove("on", "wheel"); G.emoW = null; if (G.mode === "pvp") nsend({ t: "emo", id }); else startOwnEmote(id); }

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
    const b = G.hud.querySelector("#wwCash"), bar = G.hud.querySelector("#wwCashBar"); if (!b) return; const can = false; /* owner Oct 28: no cashing out */
    b.style.display = can ? "" : "none"; if (!can && G.cashHeld) { G.cashHeld = false; nsend({ t: "cash", on: false }); }
    const pr = G.mode === "pvp" ? G.net.cash || 0 : 0; bar.style.display = pr > 0 ? "" : "none"; if (pr > 0) { bar.firstChild.style.width = (pr * 100).toFixed(0) + "%"; bar.lastChild.textContent = `Cashing out ${((1 - pr) * 5).toFixed(1)}s`; }
  }
  function cashPress(on) { if (G.mode !== "pvp") return; if (on && !inBank()) return; G.cashHeld = on; nsend({ t: "cash", on }); }

  /* =====================================================================================================
     Glass, bell, doors, the car (owner Oct 28). In PvP the server keeps doors/glass/bell/car in sync and decides
     every car kill (run-overs, explosions) and the car's health; in free roam it all runs on this page.
     ===================================================================================================== */
  const GLASS_BACK = 90000, CAR_HP = 500, CAR_BOOM_R = 6, CAR_RESPAWN = 60000, CAR_SPAWN = [-30, -3, -Math.PI / 2];
  function breakGlass(i, dir, mine) {
    const w = G.wins[i]; if (!w || w.broken) return; w.broken = w.crackAt || Date.now(); unCrack(w); const T = THREE;
    G.winMesh.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); G.winMesh.instanceMatrix.needsUpdate = true;
    const d = w.c.distanceTo(G.cam.position); G.vmul = Math.max(.15, Math.min(1, 10 / (d + 3))); SFX.glass(); G.vmul = 1;
    const mat = new T.MeshStandardMaterial({ color: w.col, roughness: .1, metalness: .5, transparent: true, opacity: .85 });
    for (let k = 0; k < 18; k++) { const sh = new T.Mesh(new T.TetrahedronGeometry(.04 + Math.random() * .05), mat); sh.position.copy(w.c).add(new T.Vector3((Math.random() - .5) * (w.box.x1 - w.box.x0), (Math.random() - .5) * (w.box.y1 - w.box.y0), (Math.random() - .5) * (w.box.z1 - w.box.z0)));
      G.scene.add(sh); G.parts.push({ o: sh, v: new T.Vector3((Math.random() - .5) * 2 + (dir ? dir.x * 2.5 : 0), Math.random() * 1.5, (Math.random() - .5) * 2 + (dir ? dir.z * 2.5 : 0)), life: 2.2, rot: new T.Vector3(Math.random() * 9, Math.random() * 9, 0), g: 1 }); }
    if (mine) { hitMark(); sesAdd("hits", 1); if (G.mode === "pvp") nsend({ t: "glass", i, s: 2 }); }
  }
  /* first shot: a hole with cracks where you hit it; second shot: the pane shatters */
  function hitGlass(i, hp, dir) { breakGlass(i, dir, true); } /* owner Oct 28: one shot shatters it (the wall behind is a real opening) */
  function glassUV(w, hp) { const b = w.box, thinZ = (b.z1 - b.z0) < (b.x1 - b.x0); const u = thinZ ? (hp.x - b.x0) / (b.x1 - b.x0) : (hp.z - b.z0) / (b.z1 - b.z0); return [Math.max(.08, Math.min(.92, u)), Math.max(.08, Math.min(.92, (hp.y - b.y0) / (b.y1 - b.y0)))]; }
  function crackGlass(i, u, v, mine) {
    const w = G.wins[i]; if (!w || w.broken || w.crack) return; const T = THREE, b = w.box, thinZ = (b.z1 - b.z0) < (b.x1 - b.x0), W = thinZ ? b.x1 - b.x0 : b.z1 - b.z0, H = b.y1 - b.y0;
    const c = document.createElement("canvas"); c.width = 128; c.height = Math.max(64, Math.round(128 * H / W)); const g = c.getContext("2d"), cx = u * c.width, cy = (1 - v) * c.height, col = new T.Color(w.col);
    g.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},.78)`; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + Math.random() * .5, L = 30 + Math.random() * 80; g.beginPath(); g.moveTo(cx, cy); let x = cx, y = cy; for (let q = 0; q < 4; q++) { x += Math.cos(a + (Math.random() - .5) * .5) * L / 4; y += Math.sin(a + (Math.random() - .5) * .5) * L / 4; g.lineTo(x, y); } g.stroke(); }
    for (const r of [12, 22]) { g.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2, rr = r * (.8 + Math.random() * .4); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); }
    g.globalCompositeOperation = "destination-out"; g.beginPath(); for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, rr = 7 + Math.random() * 4; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill();
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const m = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: .12, metalness: .4, side: T.DoubleSide, depthWrite: false }));
    m.position.copy(w.c); if (!thinZ) m.rotation.y = Math.PI / 2; G.scene.add(m); w.crack = m; w.broken = 0; w.crackAt = Date.now();
    G.winMesh.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); G.winMesh.instanceMatrix.needsUpdate = true;
    const d = w.c.distanceTo(G.cam.position); G.vmul = Math.max(.15, Math.min(1, 10 / (d + 3))); SFX.crack(); G.vmul = 1;
    if (mine) { hitMark(); sesAdd("hits", 1); if (G.mode === "pvp") nsend({ t: "glass", i, s: 1, u: +u.toFixed(3), v: +v.toFixed(3) }); }
  }
  function unCrack(w) { if (w.crack) { G.scene.remove(w.crack); w.crack.material.map.dispose(); w.crack.material.dispose(); w.crack.geometry.dispose(); w.crack = null; } }
  function fixGlass(i) { const w = G.wins[i]; if (!w || (!w.broken && !w.crack)) return; unCrack(w); w.broken = 0; G.winMesh.setMatrixAt(i, w.mtx); G.winMesh.instanceMatrix.needsUpdate = true; }
  function glassTick() { const now = Date.now(); if (G.mode === "pvp") return; for (const w of G.wins) if ((w.broken && now - w.broken > GLASS_BACK) || (w.crack && now - w.crackAt > GLASS_BACK)) fixGlass(w.i); }
  /* the bell: very loud for everyone in town, wherever they are */
  function ringBell() { banner("DONG", "The church bell rings"); for (let k = 0; k < 3; k++) setTimeout(() => { if (!G || !G.bell) return; G.bell.v += 4; G.vmul = 2.6; SFX.bell(); G.vmul = 1; G.shake = .5; }, k * 1100); } /* rings 3 times (owner Oct 28) */
  function setDoor(i, open, mine) { const d = G.doors[i]; if (!d || d.open === open) return; d.open = open; SFX.door(); if (mine && G.mode === "pvp") nsend({ t: "door", i, open }); }

  /* ---- the car: a red jalopy, 300 HP, drive it, run people over, shoot it until it blows ---- */
  function buildCar(T, M) {
    const g = new T.Group(), red = M({ color: 0x8a1a14, roughness: .45, metalness: .35 }), blk = M({ color: 0x1a1a1c, roughness: .6, metalness: .3 }), br = M({ color: 0xc8963e, roughness: .3, metalness: .85 }),
      tire = M({ color: 0x151515, roughness: .9 }), seat = M({ color: 0x3a2414, roughness: .8 }), glass = M({ color: 0x9ab8c8, roughness: .05, metalness: .3, transparent: true, opacity: .4 });
    const B = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    B(1.9, .35, 4.2, blk, 0, .62, 0);                       /* chassis */
    B(1.5, .75, 1.5, red, 0, 1.15, -1.35);                   /* hood */
    B(1.9, .8, 2.1, red, 0, 1.2, .9);                       /* body / tub */
    B(1.7, .25, 1.0, seat, 0, 1.55, .55); B(1.7, .7, .18, seat, 0, 1.85, 1.05);
    B(1.95, .08, 2.0, blk, 0, 2.55, .65);                   /* roof */
    [[-.92, -.25], [.92, -.25], [-.92, 1.6], [.92, 1.6]].forEach(([x, z]) => B(.07, 1.0, .07, blk, x, 2.05, z));
    B(1.75, .7, .04, glass, 0, 1.95, -.32);                  /* windshield */
    B(1.55, .7, .1, br, 0, 1.15, -2.12);                     /* radiator */
    [-.55, .55].forEach(x => { const l = new T.Mesh(new T.SphereGeometry(.16, 12, 8), M({ color: 0xfff2c0, emissive: 0xffd88a, emissiveIntensity: .9 })); l.position.set(x, 1.15, -2.2); g.add(l); });
    const sw = new T.Mesh(new T.TorusGeometry(.2, .03, 6, 14), blk); sw.position.set(-.4, 1.85, -.05); sw.rotation.x = -.9; g.add(sw);
    const wheels = []; [[-1, -1.45], [1, -1.45], [-1, 1.45], [1, 1.45]].forEach(([sx, z]) => { const wg = new T.Group(); wg.position.set(sx * 1.0, .48, z); g.add(wg);
      const t1 = new T.Mesh(new T.TorusGeometry(.38, .12, 8, 18), tire); t1.rotation.y = Math.PI / 2; wg.add(t1);
      const hub = new T.Mesh(new T.CylinderGeometry(.28, .28, .14, 12), br); hub.rotation.z = Math.PI / 2; wg.add(hub);
      for (let k = 0; k < 6; k++) { const sp = new T.Mesh(new T.BoxGeometry(.05, .55, .04), blk); sp.rotation.x = k / 6 * Math.PI; wg.add(sp); } wheels.push(wg);
      const fd = new T.Mesh(new T.CylinderGeometry(.6, .6, .36, 14, 1, true, 0, Math.PI), blk); fd.rotation.z = Math.PI / 2; fd.rotation.y = Math.PI / 2; fd.position.set(sx * 1.0, .55, z); fd.material.side = T.DoubleSide; g.add(fd); });
    const sp = new T.Mesh(new T.TorusGeometry(.36, .11, 8, 18), tire); sp.position.set(0, 1.2, 2.1); g.add(sp);
    G.scene.add(g);
    G.car = { g, wheels, x: CAR_SPAWN[0], z: CAR_SPAWN[1], yaw: CAR_SPAWN[2], v: 0, hp: CAR_HP, alive: true, driver: 0, mine: false, spin: 0, deadAt: 0, red };
    placeCar();
  }
  /* the server's car: [x, z, yaw, speed, hp, driver n, alive] */
  function carState(a, snap) { const c = G.car; if (!c) return; const [x, z, yaw, v, hp, drv, alive] = a; c.hp = hp; c.driver = drv;
    if (alive && !c.alive) { carRespawn(); c.driver = drv; } if (!alive) { c.alive = false; return; }
    if (c.mine && drv !== G.net.n) { carExit(true); } if (c.mine) return; if (snap) { c.x = x; c.z = z; c.yaw = yaw; placeCar(); } c.tgt = [x, z, yaw, v]; }
  function placeCar() { const c = G.car; if (!c) return; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; }
  /* ray vs the car's box (car space: x ±1, y 0..2.6, z ±2.2) */
  function carRay(o, d) {
    const c = G.car, s = Math.sin(-c.yaw), k = Math.cos(-c.yaw), ox = o.x - c.x, oz = o.z - c.z;
    const lo = { x: ox * k + oz * s, y: o.y, z: -ox * s + oz * k }, ld = { x: d.x * k + d.z * s, y: d.y, z: -d.x * s + d.z * k };
    const r = rayBox(lo, ld, { x0: -1, x1: 1, y0: .2, y1: 2.6, z0: -2.2, z1: 2.2 }); return r ? r.t : null;
  }
  function carDamage(n) { const c = G.car; if (!c.alive) return; c.hp -= n; if (c.hp <= 0) carBoom(c.x, c.z, true); }
  function carBoom(x, z, local) {
    const c = G.car, T = THREE; c.alive = false; c.hp = 0; c.v = 0; c.deadAt = Date.now(); c.red.color.set(0x1a1410);
    c.g.traverse(o => { if (o.material && o.material.emissive) o.material.emissiveIntensity = 0; });
    const d = Math.hypot(G.p.x - x, G.p.z - z); G.vmul = Math.max(.3, Math.min(1.6, 14 / (d + 4))); SFX.boom(); G.vmul = 1; G.shake = Math.max(G.shake || 0, d < 25 ? 1 : .3);
    for (let k = 0; k < 26; k++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: k < 14 ? G.fireTex : G.puffTex, transparent: true, depthWrite: false, opacity: .95, blending: k < 14 ? T.AdditiveBlending : T.NormalBlending, color: k < 14 ? 0xffffff : 0x3a3430 }));
      sp.position.set(x + (Math.random() - .5) * 2, 1 + Math.random() * 1.5, z + (Math.random() - .5) * 3); sp.scale.setScalar(1.5); G.scene.add(sp);
      G.parts.push({ o: sp, v: new T.Vector3((Math.random() - .5) * 6, Math.random() * 6 + (k < 14 ? 2 : 1), (Math.random() - .5) * 6), life: k < 14 ? .9 : 2.6, grow: k < 14 ? 3 : 2.2, g: -.05 }); }
    if (c.mine) { carExit(true); }
    if (local) { /* free roam: being inside or within 6 m kills you */ if (d < CAR_BOOM_R) { banner("Blown up", "Too close to the car"); G.shake = 1.2; setTimeout(() => { if (G && G.mode !== "pvp") spawnPlayer(); }, 1200); } }
  }
  function carRespawn() { const c = G.car; Object.assign(c, { x: CAR_SPAWN[0], z: CAR_SPAWN[1], yaw: CAR_SPAWN[2], v: 0, hp: CAR_HP, alive: true, driver: 0, deadAt: 0 }); c.red.color.set(0x8a1a14);
    c.g.traverse(o => { if (o.material && o.material.emissive && o.geometry && o.geometry.type === "SphereGeometry") o.material.emissiveIntensity = .9; }); placeCar(); }
  function carEnter() { const c = G.car; if (!c.alive || c.driver) return; if (G.mode === "pvp") { nsend({ t: "car", on: true }); return; } c.mine = true; c.driver = -1; banner("", "Driving · get out with the same button"); }
  function carExit(dead) { const c = G.car; if (!c.mine) return; c.mine = false; c.driver = 0; if (G.mode === "pvp" && !dead) nsend({ t: "car", on: false });
    if (!dead) { const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw); G.p.x = c.x + rx * 1.9; G.p.z = c.z + rz * 1.9; G.p.y = 0; G.yaw = c.yaw; } }
  /* driving (this page is the driver): W/S or the stick = gas/brake/reverse, A/D = steer; slides off walls */
  function carDrive(dt) {
    const c = G.car, k = G.keys, A = G.act; let th = 0, st = 0;
    if (A.fwd || k.ArrowUp) th += 1; if (A.back || k.ArrowDown) th -= 1;
    const sk = Object.values(G.touches).find(q => q.kind === "stick"); if (sk && sk.mx != null) th += -sk.my;
    /* steer toward where you're looking (mouse / look drag), not with A/D (owner Oct 28) */
    if (G.carLook == null) G.carLook = c.yaw; { let df = G.carLook - c.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); st = -df * 2.2 * Math.sign(c.v || 1); }
    th = Math.max(-1, Math.min(1, th)); st = Math.max(-1, Math.min(1, st));
    /* drift (owner Oct 28): holding Jump while driving = handbrake: less grip, tighter turns, the car slides, tire smoke */
    const drift = !!(A.jump || k.Space), MAX = 17, REV = 6; c.vr = c.vr || 0;
    if (th > 0) c.v += (c.v < 0 ? 22 : 9) * th * dt; else if (th < 0) c.v += (c.v > 0 ? -22 : -6) * -th * dt; else c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 4 * dt);
    if (drift) c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 2.2 * dt);
    c.v = Math.max(-REV, Math.min(MAX, c.v));
    const yaw0 = c.yaw; c.yaw -= st * Math.min(1, Math.abs(c.v) / 5) * (drift ? 2.6 : 1.55) * dt * Math.sign(c.v || 1);
    { const dy = c.yaw - yaw0, f = c.v, r = c.vr; c.v = f * Math.cos(dy) - r * Math.sin(dy); c.vr = r * Math.cos(dy) + f * Math.sin(dy); }
    c.vr *= Math.exp(-dt * (drift ? 1.1 : 9));
    if (drift && Math.abs(c.vr) > 2.2) { if (performance.now() - (c.smokeAt || 0) > 70) { c.smokeAt = performance.now(); puff(new THREE.Vector3(c.x + Math.sin(c.yaw) * 1.5, .35, c.z + Math.cos(c.yaw) * 1.5), .9); }
      if (performance.now() - (c.scrAt || 0) > 260) { c.scrAt = performance.now(); SFX.screech(); } }
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw); let nx = c.x + (fx * c.v + rx * c.vr) * dt, nz = c.z + (fz * c.v + rz * c.vr) * dt;
    /* two circles (front + back) against the walls */
    let hit = false; for (const off of [1.3, -1.3]) { const q = { x: nx + fx * off, z: nz + fz * off, y: 0 }, bx = q.x, bz = q.z;
      for (const cc of nearCols(q.x, q.z)) { if (cc.y1 < .7 || (cc.dr && cc.dr.open)) continue; const px = Math.max(cc.x0, Math.min(q.x, cc.x1)), pz = Math.max(cc.z0, Math.min(q.z, cc.z1)), dx = q.x - px, dz = q.z - pz, d2 = dx * dx + dz * dz;
        if (d2 < 1.15 * 1.15) { const d = Math.sqrt(d2) || .001, kk = (1.15 - d) / d; q.x += dx * kk; q.z += dz * kk; hit = true; } }
      nx += q.x - bx; nz += q.z - bz; }
    const B = G.bounds; nx = Math.max(B.x0 + 1, Math.min(B.x1 - 1, nx)); nz = Math.max(B.z0 + 1, Math.min(B.z1 - 1, nz));
    if (hit && Math.abs(c.v) > 6) { SFX.wood(); G.shake = Math.max(G.shake || 0, .25); } if (hit) { c.v *= .55; c.vr *= .4; }
    c.x = nx; c.z = nz; G.p.x = c.x; G.p.z = c.z; G.p.y = 0; G.moving = Math.abs(c.v); placeCar();
    if (G.mode === "pvp" && performance.now() - (G.net.carSent || 0) > 50) { G.net.carSent = performance.now(); nsend({ t: "cin", x: +c.x.toFixed(3), z: +c.z.toFixed(3), yaw: +c.yaw.toFixed(4), v: +(Math.sign(c.v || 1) * Math.hypot(c.v, c.vr)).toFixed(2) }); }
  }
  function carTick(dt) {
    const c = G.car; if (!c) return;
    if (c.mine && c.alive && G.state === "play") carDrive(dt);
    else if (c.tgt) { /* someone else drives: ease toward the server's car */ const a = Math.min(1, dt * 12); c.x += (c.tgt[0] - c.x) * a; c.z += (c.tgt[1] - c.z) * a; let dy = c.tgt[2] - c.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; c.yaw += dy * a; c.v = c.tgt[3]; placeCar(); }
    c.spin += c.v * dt / .45; for (const w of c.wheels) w.rotation.x = -c.spin;
    if (G.mode !== "pvp" && !c.alive && Date.now() - c.deadAt > CAR_RESPAWN) carRespawn();
  }
  /* chase camera while you drive */
  function carCam() { const c = G.car; if (!c || !c.mine) { G.dYaw = 0; G.dPitch = 0; G.carLook = null; return false; }
    const dt = Math.min(.05, (performance.now() - (G.dCamT || performance.now())) / 1000); G.dCamT = performance.now();
    if (G.carLook == null) G.carLook = c.yaw; { const df = G.carLook - c.yaw; G.dYaw = Math.atan2(Math.sin(df), Math.cos(df)); }
    if (performance.now() - (G.dLookAt || 0) > 2500) { const k = Math.exp(-dt * 2.2); G.dPitch = (G.dPitch || 0) * k; }
    const yw = c.yaw + (G.dYaw || 0), pt = G.dPitch || 0, dist = 7.2;
    G.cam.position.set(c.x + Math.sin(yw) * dist * Math.cos(pt), Math.max(1.2, 3.4 + Math.sin(pt) * 6), c.z + Math.cos(yw) * dist * Math.cos(pt));
    G.cam.lookAt(c.x - Math.sin(yw) * 3, 1.3, c.z - Math.cos(yw) * 3); return true; }

  /* ---- USE (F / the USE button): doors, the car, the bell rope — whatever is closest ---- */
  function useTarget() {
    const p = G.p, c = G.car; if (c && c.mine) return { k: "exit", label: `Get out · car ${Math.max(0, Math.round(c.hp))} HP` };
    let best = null, bd = 9;
    if (c && c.alive && !c.driver) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < 3.4 && d < bd) { bd = d; best = { k: "car", label: `Drive · car ${Math.max(0, Math.round(c.hp))} HP` }; } }
    for (const dr of G.doors) { if (dr.auto) continue; const d = Math.hypot(p.x - dr.wp[0], p.z - dr.wp[1]); if (d < 2.4 && d < bd) { bd = d; best = { k: "door", i: dr.i, label: dr.open ? "Close door" : "Open door" }; } }
    if (G.rope) { const d = Math.hypot(p.x - G.rope[0], p.z - G.rope[1]); if (d < 1.8 && d < bd) { bd = d; best = { k: "bell", label: "Ring the bell" }; } }
    return best;
  }
  function doUse() {
    if (G.state !== "play") return; const u = useTarget(); if (!u) return;
    if (u.k === "exit") carExit(); else if (u.k === "car") carEnter(); else if (u.k === "door") setDoor(u.i, !G.doors[u.i].open, true);
    else if (u.k === "bell") { if (performance.now() - (G.bellAt || 0) < 3000) return; G.bellAt = performance.now(); if (G.mode === "pvp") nsend({ t: "bell" }); else ringBell(); }
  }
  function useTick() { const jb = G.hud.querySelector("#wwBJ"); if (jb) { const t = G.car && G.car.mine ? "DRIFT" : "JUMP"; if (jb.textContent !== t) jb.textContent = t; }
    const u = G.state === "play" ? useTarget() : null, el = G.hud.querySelector("#wwUse"); if (!el) return; const lab = u ? u.label : "";
    if (el._l !== lab) { el._l = lab; el.style.display = u ? "" : "none"; el.innerHTML = TOUCH ? esc(lab).toUpperCase() : `<b>${esc(keyName(G.set.keys.use))}</b> ${esc(lab)}`; } }

  /* ---------------- loop ---------------- */
  function loop(now) {
    if (!G) return; G.raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - G.last) / 1000); G.last = now; G.t += dt;
    const T = THREE, cam = G.cam, play = G.state === "play";
    if (play) {
      if (!(G.car && G.car.mine)) stepPlayer(dt); G.ses.time += dt; G.sesD.time = (G.sesD.time || 0) + dt; if (G.t - (G.lastSave || 0) > 60) { G.lastSave = G.t; saveStats(); }
      if (G.fireHeld && TOUCH === false) { /* revolver: one shot per click */ }
      if (G.reloading) { G.reloading -= dt; if (G.reloading <= 0) { G.reloading = 0; G.ammo = MAGS[G.wpn]; drawAmmo(); } }
    }
    /* aim down sights */
    const aiming = play && (G.aimHeld || G.aimToggle) && !G.reloading && !(G.car && G.car.mine), SN = G.wpn === "sn"; G.adsK += ((aiming ? 1 : 0) - G.adsK) * Math.min(1, dt * (SN ? 14 : 12));
    /* sniper zoom: the rifle comes up to your eye, then the scope blooms in while the view pushes in to 5× (accuracy is already perfect the instant you aim) */
    const zk = SN ? Math.max(0, Math.min(1, (G.adsK - .3) / .6)) : 0, ze = zk * zk * (3 - 2 * zk);
    const fov = SN ? G.set.fov / (1 + 4 * ze) : G.set.fov + (G.set.fov * .58 - G.set.fov) * G.adsK;
    { const sc = G.hud.querySelector("#wwScope"); if (sc) { const o = SN ? Math.max(0, Math.min(1, (G.adsK - .35) / .3)) : 0; if (sc._o !== o) { sc._o = o; sc.style.opacity = o; sc.style.transform = `scale(${(1.25 - .25 * o).toFixed(3)})`; } }
      const xx = G.hud.querySelector("#wwX"); if (xx) xx.classList.toggle("nox", SN); } if (Math.abs(fov - G.fovNow) > .01) { G.fovNow = fov; cam.fov = fov; cam.updateProjectionMatrix(); }
    const x = G.hud.querySelector("#wwX"); if (x) x.classList.toggle("ads", G.adsK > .5); const dot = G.hud.querySelector("#wwDot"); if (dot) dot.classList.toggle("on", G.adsK > .6 && !SN);
    if (G.aimBtn) G.aimBtn.classList.toggle("on", !!G.aimToggle);
    aimAssist(dt);
    /* camera */
    const p = G.p, bobA = G.p.ground ? Math.min(1, G.moving / 5) : 0, bob = Math.sin(G.bob * 2) * .035 * bobA * (1 - G.adsK * .8);
    cam.position.set(p.x, p.y + 1.62 - .57 * (G.crK || 0) + bob, p.z); cam.rotation.set(0, 0, 0); cam.rotation.order = "YXZ"; cam.rotation.y = G.yaw; cam.rotation.x = G.pitch + G.recoil * .035;
    /* viewmodel: hip vs sights, bob, recoil, reload spin */
    G.recoil = Math.max(0, G.recoil - dt * 7);
    const vm = G.vm, a = G.adsK; vm.position.set(.2 * (1 - a), -.19 * (1 - a) - .0765 * a - Math.abs(Math.sin(G.bob)) * .012 * bobA * (1 - a), -.42 - .1 * a + G.recoil * .05);
    vm.rotation.y = .06 * (1 - a);
    vm.rotation.set(G.recoil * .35, .06 * (1 - a) + Math.sin(G.bob) * .02 * bobA * (1 - a), 0);
    if (G.reloading) { const k = 1 - G.reloading / 1.7, dip = Math.sin(Math.min(1, k) * Math.PI); vm.rotation.x -= dip * .9; vm.rotation.z = dip * .6; G.cyl.rotation.z += dt * 14 * dip; } else vm.rotation.z = 0;
    if (G.flashT > 0) { G.flashT -= dt; G.flash.visible = true; G.flash.material.rotation = Math.random() * 6; G.mlight.intensity = 2.2; G.mlight.position.copy(cam.position); } else { G.flash.visible = false; G.mlight.intensity = 0; }
    /* doors swing when someone walks through */
    for (const d of G.doors) { let side = 0; if (d.auto) { const who = [G.p]; if (G.net) for (const R of G.net.pl.values()) if (R.alive && R.root && R.root.visible) who.push(R.root.position);
        for (const q of who) { if (!q) continue; const dx = q.x - d.wp[0], dz = q.z - d.wp[1]; if (Math.hypot(dx, dz) < 1.25) { side = dx * d.nrm[0] + dz * d.nrm[1] > 0 ? -1 : 1; break; } } }
      for (const h of d.hs) { const tgt = d.auto ? side * h.sd * 1.25 : d.open ? -h.sd * (d.ang || 1.45) : 0; h.v += ((tgt - h.a) * 30 - h.v * 6) * dt; h.a += h.v * dt; h.hinge.rotation.y = h.a; } }
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
      if (q.light) q.o.intensity = Math.max(0, q.life) * 12;
      if (q.life <= 0) { G.scene.remove(q.o); if (!q.light) { if (q.grow || q.line) q.o.material.dispose(); if (!q.grow) q.o.geometry.dispose(); } G.parts.splice(i, 1); } }
    /* challenge timer chip + tip near the gong */
    const chip = G.hud.querySelector("#wwChal");
    if (G.chal && G.chal.on) { chip.style.display = ""; chip.innerHTML = `Bottles left <b>${G.chal.left}</b> · <b>${((performance.now() - G.chal.t0) / 1000).toFixed(1)}s</b>`; } else chip.style.display = "none";
    const tip = G.hud.querySelector("#wwTip"); if (tip) { const nearG = play && !G.chal.on && Math.hypot(p.x - G.chalTip[0], p.z - G.chalTip[1]) < 7; tip.textContent = "Shoot the gong to start the bottle challenge"; tip.classList.toggle("on", nearG); }
    /* PvP: send my movement 20×/s, move everyone else, cash-out, own emote camera */
    if (G.mode === "pvp" && G.net) { if (now - (G.net.sentAt || 0) > 50) { G.net.sentAt = now; nsend({ t: "in", x: +G.p.x.toFixed(3), y: +G.p.y.toFixed(3), z: +G.p.z.toFixed(3), yaw: +G.yaw.toFixed(4), pitch: +G.pitch.toFixed(4), cr: G.crK > .5 ? 1 : 0 }); } }
    if (G.net) remotesTick(dt); if (G.net && G.net.ffa && performance.now() - (G.ffaT || 0) > 500) { G.ffaT = performance.now(); ffaChip(); } cashTick(); carTick(dt); glassTick(); useTick();
    if (G.mode === "pvp" && G.car && G.car.mine) G.net.sentAt = now; /* the car message carries my position */
    const emo = ownEmoteTick(dt), drv = carCam(), tp = !emo && !drv && tpCam(); G.tpOn = tp; G.vm.visible = !emo && !drv && !tp && !(G.wpn === "sn" && G.adsK > .6);
    selfBody(dt, emo, drv, tp);
    if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.6); const k = G.shake * .12; cam.position.x += (Math.random() - .5) * k; cam.position.y += (Math.random() - .5) * k; cam.position.z += (Math.random() - .5) * k; }
    G.fr = (G.fr || 0) + 1; if (G.R.shadowMap.enabled && G.fr % 3 === 0) G.R.shadowMap.needsUpdate = true;
    G.R.autoClear = false; G.R.clear(); G.R.render(G.scene, cam); G.R.clearDepth(); if (G.vc.aspect !== cam.aspect) { G.vc.aspect = cam.aspect; G.vc.updateProjectionMatrix(); } G.R.render(G.vs, G.vc);
  }
  /* practice bottles on the fence between runs */
  function chalPractice() { if (!G || !G.chal || G.chal.on) return; G.bottles.filter(b => b.kind === "prac" && b.alive).forEach(b => { b.alive = false; b.g.parent && b.g.parent.remove(b.g); }); G.chal.spots.slice(0, 6).forEach(s => spawnBottle(s, "prac")); }
  window.WW = { open, close, _g: () => G, spawns: SPAWNS, killFeed: (...a) => G && killFeed(...a), setLive: n => G && setLive(n) };
})();
