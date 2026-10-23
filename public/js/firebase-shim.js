/*
 * Firebase shim for BiggieCheese's Sportsbook.
 *
 * The app was written against the Claude artifact runtime, which handed it two
 * objects: `db` (a small Firestore-like document store) and `user` (who is
 * looking). This file builds the same two objects on top of Firebase Auth and
 * Cloud Firestore, then resolves window.SB_BACKEND with {db, user}. Nothing
 * in the app's game code had to change.
 *
 * It also owns the sign-in gate (#sbGate in index.html):
 *   signed out            -> "Sign in with Google", email + password, or an emailed link
 *   password account, email not verified yet -> "Check your email, then tap I've verified"
 *   signed in, no link yet -> "BiggieCheese's Sportsbook is invite-only: enter your
 *                             invite code" (+ sign out)
 *   signed in and linked   -> gate disappears and the app boots
 *
 * Invites: the commish makes codes in the Admin tab (invites/{code}). Redeeming
 * one writes links/{your firebase uid} = {oldId, email, code}.
 * Who you are in the app (S.me) = links/{uid}.oldId: the old artifact player id
 * the invite was made for (so balances/cards carry over), or your Firebase uid
 * for a brand-new player.
 * Admin (S.canEdit): the bootstrap owner email below, or an email listed in
 * config/admins.emails.
 */
import { firebaseConfig } from "./firebase-config.js";
import { encode, decode, isPlainObject } from "./codec.js";

const SDK_VERSION = "10.12.2";

// The owner. Always an admin, and linked to their old artifact player on first sign-in.
// (Also hard-coded in firestore.rules; change both together.)
const BOOTSTRAP_ADMIN_EMAIL = "s4mt1mms@gmail.com";
const BOOTSTRAP_ADMIN_OLD_ID = "u_IfmXeDmDg1B3W4naCzVbSA"; // BiggieCheese Oppenheimer
const SITE = "https://biggiecheesesportsbook.web.app";
const EMAIL_KEY = "sb-email-for-signin";
const AUTH_EMU = "http://127.0.0.1:9099";
const MIN_PW = 8;

const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const siteOrigin = () => (location.protocol === "https:" ? location.origin : SITE);
// ?invite=CODE in the link fills in the code; keep it through the Google sign-in round trip.
(function stashInvite() {
  try {
    const u = new URL(location.href);
    const c = normCode(u.searchParams.get("invite"));
    if (c) {
      sessionStorage.setItem("sb-invite", c);
      u.searchParams.delete("invite");
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    }
  } catch (_) {}
})();
// ?setpw=1: a fresh sign-in link asked for from "Set password" (Firebase wants a recent
// sign-in before a password can be added); open the password sheet once we're in.
(function stashSetPw() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("setpw")) {
      sessionStorage.setItem("sb-setpw", "1");
      u.searchParams.delete("setpw");
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    }
  } catch (_) {}
})();
function peekPendingInvite() { try { return sessionStorage.getItem("sb-invite") || ""; } catch (_) { return ""; } }
function takePendingInvite() { try { sessionStorage.removeItem("sb-invite"); } catch (_) {} }
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;

const gate = document.getElementById("sbGate");
const gateBody = document.getElementById("sbGateBody");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const GOOGLE_G = '<span class="g" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg></span>';

function showGate(state, html) {
  if (!gate) return;
  gate.hidden = false;
  gate.dataset.state = state;
  document.documentElement.classList.add("sbgate-open");
  gateBody.innerHTML = html;
}
function hideGate() {
  if (!gate) return;
  gate.hidden = true;
  document.documentElement.classList.remove("sbgate-open");
}
const spinner = (msg) => `<div class="sbgate-spin" aria-hidden="true"></div><p class="sbgate-note">${esc(msg)}</p>`;

/* ---------- service worker (Add to Home Screen + quick updates) ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* ---------- boot ---------- */
boot().catch((e) => {
  console.error(e);
  showGate("error", `<p class="sbgate-err">Couldn't start: ${esc(e && e.message || e)}</p>
    <button type="button" class="sbgate-btn ghost" onclick="location.reload()">Try again</button>`);
});

async function boot() {
  if (!firebaseConfig || !firebaseConfig.apiKey || /^YOUR_/.test(firebaseConfig.apiKey) || /YOUR_/.test(firebaseConfig.projectId || "")) {
    showGate("setup", `<p class="sbgate-h">Almost ready</p>
      <p>The site isn't connected to Firebase yet. Paste your project's config into <code>public/js/firebase-config.js</code> and deploy again (see README).</p>`);
    return;
  }
  showGate("loading", spinner("Loading…"));

  let appMod, authMod, fsMod;
  try {
    [appMod, authMod, fsMod] = await Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-auth.js"),
      import(SDK + "firebase-firestore.js"),
    ]);
  } catch (e) {
    showGate("error", `<p class="sbgate-h">Can't reach the server</p><p>Check your connection and try again.</p>
      <button type="button" class="sbgate-btn ghost" onclick="location.reload()">Try again</button>`);
    return;
  }

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  // Memory cache on purpose: the app runs money logic (dividends, loans) right after
  // its first snapshot, so it must never boot from a stale on-device copy.
  const fs = fsMod.initializeFirestore(app, { ignoreUndefinedProperties: true });

  // Local testing only: http://localhost:5000/?emu talks to `firebase emulators:start`
  // instead of the real project (see README "Run it locally"). Never active on the real site.
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let emu = false;
  try { emu = local && (new URLSearchParams(location.search).has("emu") || sessionStorage.getItem("sb-emu") === "1"); if (emu) sessionStorage.setItem("sb-emu", "1"); } catch (_) {}
  if (emu) {
    authMod.connectAuthEmulator(auth, AUTH_EMU, { disableWarnings: true });
    fsMod.connectFirestoreEmulator(fs, "127.0.0.1", 8080);
    // Sign in as anyone without Google: SB_DEV_SIGNIN("me@example.com", "Me")
    window.SB_DEV_SIGNIN = (email, name) => authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(
      JSON.stringify({ sub: "g-" + email, email, email_verified: true, name: name || email.split("@")[0] })));
  }

  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  window.SB_SIGNOUT = async () => {
    try { await authMod.signOut(auth); } catch (_) {}
    location.reload();
  };

  // Finish a redirect sign-in if we're coming back from one.
  let redirectError = null;
  try { await authMod.getRedirectResult(auth); } catch (e) { redirectError = e; }

  // Coming back from an emailed sign-in link?
  if (authMod.isSignInWithEmailLink(auth, location.href)) {
    let stored = "";
    try { stored = localStorage.getItem(EMAIL_KEY) || ""; } catch (_) {}
    if (stored) {
      try { await finishEmailLink(stored); } catch (e) { redirectError = e; }
    } else {
      // Opened on a different phone/browser than the one that asked: confirm the address.
      await new Promise((resolve) => {
        showGate("email-confirm", `
          <p class="sbgate-h">Confirm your email</p>
          <p>For security, type the email address you asked the sign-in link for.</p>
          <form class="sbgate-form" id="sbEmailConfirm">
            <label class="sbgate-vh" for="sbEmailC">Email</label>
            <input id="sbEmailC" class="sbgate-input sbgate-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
            <button type="submit" class="sbgate-btn">Sign in</button>
          </form>
          <p class="sbgate-err" id="sbEmailCErr" role="alert"></p>`);
        document.getElementById("sbEmailConfirm").addEventListener("submit", async (ev) => {
          ev.preventDefault();
          try { await finishEmailLink(document.getElementById("sbEmailC").value); resolve(); }
          catch (e) { document.getElementById("sbEmailCErr").textContent = friendlyAuthError(e); }
        });
      });
    }
  }
  async function finishEmailLink(addr) {
    await authMod.signInWithEmailLink(auth, String(addr).trim(), location.href);
    try { localStorage.removeItem(EMAIL_KEY); } catch (_) {}
    history.replaceState(null, "", "/"); // drop the one-time code from the address bar
  }

  let booted = null; // uid the app booted as
  authMod.onAuthStateChanged(auth, async (fbUser) => {
    if (booted) {
      // Signed out (or switched accounts) in another tab: start over cleanly.
      if (!fbUser || fbUser.uid !== booted) location.reload();
      return;
    }
    if (!fbUser) return showLogin(redirectError);
    if (fbUser.email && !fbUser.emailVerified) return showVerify(fbUser);
    showGate("checking", spinner("Checking your invite…"));
    try {
      const ok = await admit(fbUser);
      if (ok) booted = fbUser.uid;
    } catch (e) {
      console.error(e);
      showGate("error", `<p class="sbgate-err">Something went wrong: ${esc(e && e.message || e)}</p>
        <button type="button" class="sbgate-btn ghost" onclick="location.reload()">Try again</button>
        <button type="button" class="sbgate-btn ghost" data-sbsignout>Sign out</button>`);
      wireSignOut();
    }
  });

  function wireSignOut() {
    gateBody.querySelectorAll("[data-sbsignout]").forEach((b) => b.addEventListener("click", () => window.SB_SIGNOUT()));
  }

  const PW_EYE = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const pwField = (id, ac, ph) => `<div class="sbgate-pw">
        <label class="sbgate-vh" for="${id}">${esc(ph)}</label>
        <input id="${id}" class="sbgate-input sbgate-email" type="password" autocomplete="${ac}" placeholder="${esc(ph)}" required autocapitalize="off" autocorrect="off" spellcheck="false">
        <button type="button" class="sbgate-eye" data-pweye="${id}" aria-label="Show password" aria-pressed="false">${PW_EYE}</button>
      </div>`;
  function wireEyes(root) {
    root.querySelectorAll("[data-pweye]").forEach((b) => b.addEventListener("click", () => {
      const inp = document.getElementById(b.dataset.pweye); if (!inp) return;
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", String(show));
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }));
  }

  // mode: "signin" | "create". Password sign-in works entirely inside the home-screen
  // app; an emailed link opens in Safari on iPhone (separate storage), so it's a fallback.
  function showLogin(err, mode, presetEmail) {
    mode = mode === "create" ? "create" : "signin";
    const invited = !!peekPendingInvite();
    const home = standalone();
    const create = mode === "create";
    showGate("login", `
      <button type="button" class="sbgate-btn" id="sbSignIn">${GOOGLE_G}<span>Sign in with Google</span></button>
      <div class="sbgate-or"><span>or</span></div>
      <form class="sbgate-form" id="sbPwForm" data-mode="${mode}">
        <p class="sbgate-h sbgate-h2">${create ? "Create your account" : "Sign in with email &amp; password"}</p>
        <label class="sbgate-vh" for="sbPwEmail">Email address</label>
        <input id="sbPwEmail" class="sbgate-input sbgate-email" type="email" name="username" autocomplete="username" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com" required value="${esc(presetEmail || "")}">
        ${pwField("sbPw", create ? "new-password" : "current-password", create ? "New password (" + MIN_PW + "+ characters)" : "Password")}
        <button type="submit" class="sbgate-btn" id="sbPwBtn">${create ? "Create account" : "Sign in"}</button>
        <div class="sbgate-links">
          ${create ? `<button type="button" class="sbgate-link" id="sbPwMode">I already have an account</button>`
            : `<button type="button" class="sbgate-link" id="sbForgot">Forgot password?</button><button type="button" class="sbgate-link" id="sbPwMode">New player? Create account</button>`}
        </div>
      </form>
      <p class="sbgate-err" id="sbSignErr" role="alert">${err ? esc(friendlyAuthError(err)) : ""}</p>
      ${create ? `<p class="sbgate-note">You'll need your invite code from the commish next. We'll email you a link to confirm your address first.</p>` : ""}
      <details class="sbgate-more" id="sbLinkBox">
        <summary>Email me a sign-in link instead</summary>
        ${home ? `<p class="sbgate-note sbgate-warn">Heads up: on iPhone the link opens in Safari, so you'd be signed in there, not in this home-screen app. Use email &amp; password above to sign in here. (Never set a password? Tap "Forgot password?" to make one.)</p>` : ""}
        <form class="sbgate-form" id="sbEmailForm">
          <label class="sbgate-vh" for="sbEmail">Email address</label>
          <input id="sbEmail" class="sbgate-input sbgate-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
          <button type="submit" class="sbgate-btn ghost" id="sbEmailBtn">Email me a sign-in link</button>
        </form>
      </details>
      <p class="sbgate-note">${invited ? "You've got an invite! Sign in to claim your spot." : "Invite-only. You'll need an invite code from the commish."}</p>`);
    wireEyes(gateBody);
    const btn = document.getElementById("sbSignIn");
    btn.addEventListener("click", () => signIn(btn));
    const pwEmail = document.getElementById("sbPwEmail"), pw = document.getElementById("sbPw");
    document.getElementById("sbPwMode").addEventListener("click", () => showLogin(null, create ? "signin" : "create", pwEmail.value.trim()));
    const forgot = document.getElementById("sbForgot");
    if (forgot) forgot.addEventListener("click", async () => {
      const errEl = document.getElementById("sbSignErr");
      const addr = pwEmail.value.trim();
      errEl.textContent = "";
      if (!addr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { errEl.textContent = "Type your email address above first, then tap Forgot password."; pwEmail.focus(); return; }
      forgot.disabled = true;
      try {
        await authMod.sendPasswordResetEmail(auth, addr);
        showGate("pw-reset-sent", `<div class="sbgate-lock" aria-hidden="true">🔑</div>
          <p class="sbgate-h">Check your email</p>
          <p>If there's an account for</p><span class="sbgate-who">${esc(addr)}</span>
          <p>a link to set a new password is on its way (check spam too). It opens a Firebase page where you choose the password. Then come back here and sign in with it.</p>
          <button type="button" class="sbgate-btn" id="sbBack">Back to sign in</button>`);
        document.getElementById("sbBack").addEventListener("click", () => showLogin(null, "signin", addr));
      } catch (e) {
        forgot.disabled = false;
        errEl.textContent = friendlyAuthError(e, "password");
      }
    });
    document.getElementById("sbPwForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const errEl = document.getElementById("sbSignErr"), pb = document.getElementById("sbPwBtn");
      const addr = pwEmail.value.trim(), pass = pw.value;
      errEl.textContent = "";
      if (create && pass.length < MIN_PW) { errEl.textContent = `Use at least ${MIN_PW} characters for your password.`; pw.focus(); return; }
      pb.disabled = true; pb.textContent = create ? "Creating…" : "Signing in…";
      try {
        if (create) {
          const cred = await authMod.createUserWithEmailAndPassword(auth, addr, pass);
          try { await authMod.sendEmailVerification(cred.user, { url: siteOrigin() + "/" }); }
          catch (e) { try { await authMod.sendEmailVerification(cred.user); } catch (_) {} }
          markHasPw(cred.user.uid);
          showVerify(cred.user);
        } else {
          const cred = await authMod.signInWithEmailAndPassword(auth, addr, pass);
          markHasPw(cred.user.uid);
        }
        // onAuthStateChanged takes it from here.
      } catch (e) {
        pb.disabled = false; pb.textContent = create ? "Create account" : "Sign in";
        errEl.textContent = friendlyAuthError(e, create ? "create" : "password");
      }
    });
    document.getElementById("sbEmailForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const addr = document.getElementById("sbEmail").value.trim();
      const eb = document.getElementById("sbEmailBtn"), errEl = document.getElementById("sbSignErr");
      errEl.textContent = ""; eb.disabled = true; eb.textContent = "Sending…";
      // Carry the invite code in the link: it may be opened in the mail app's browser.
      const code = peekPendingInvite();
      const url = location.origin + "/" + (code ? "?invite=" + encodeURIComponent(code) : "");
      try {
        await authMod.sendSignInLinkToEmail(auth, addr, { url, handleCodeInApp: true });
        try { localStorage.setItem(EMAIL_KEY, addr); } catch (_) {}
        showGate("email-sent", `<div class="sbgate-lock" aria-hidden="true">📬</div>
          <p class="sbgate-h">Check your email</p>
          <p>We sent a sign-in link to</p><span class="sbgate-who">${esc(addr)}</span>
          <p>Open it on this device to sign in. It can take a minute; check spam too.</p>
          ${home ? `<p class="sbgate-note sbgate-warn">The link opens in Safari, not this home-screen app. Once you're signed in there, tap your name → <strong>Set password</strong>, then come back here and sign in with email &amp; password.</p>` : ""}
          <button type="button" class="sbgate-btn ghost" id="sbBack">Back</button>`);
        document.getElementById("sbBack").addEventListener("click", () => showLogin(null));
      } catch (e) {
        eb.disabled = false; eb.textContent = "Email me a sign-in link";
        errEl.textContent = friendlyAuthError(e, "link");
      }
    });
    if (err) { try { document.getElementById("sbLinkBox").open = (err.code || "").includes("action-code"); } catch (_) {} }
  }

  // Password accounts must confirm their email before the rules let them in
  // (request.auth.token.email_verified). Verification is per account, not per
  // device: the link can open in Safari, then "I've verified" here picks it up.
  function showVerify(fbUser, msg) {
    showGate("verify", `<div class="sbgate-lock" aria-hidden="true">✉️</div>
      <p class="sbgate-h">Confirm your email</p>
      <p>We sent a link to</p><span class="sbgate-who">${esc(fbUser.email || "")}</span>
      <p>Open it (it's fine if it opens in Safari), then come back here and tap <strong>I've verified</strong>. Check spam if it isn't there in a minute.</p>
      <button type="button" class="sbgate-btn" id="sbVerified">I've verified</button>
      <p class="sbgate-err" id="sbVerifyErr" role="alert">${esc(msg || "")}</p>
      <button type="button" class="sbgate-btn ghost" id="sbResend">Send the email again</button>
      <button type="button" class="sbgate-btn ghost" data-sbsignout>Use a different account</button>`);
    wireSignOut();
    const errEl = document.getElementById("sbVerifyErr");
    const vb = document.getElementById("sbVerified");
    vb.addEventListener("click", async () => {
      errEl.textContent = ""; vb.disabled = true; vb.textContent = "Checking…";
      try {
        const u = auth.currentUser || fbUser;
        await u.reload();
        if (!u.emailVerified) { vb.disabled = false; vb.textContent = "I've verified"; errEl.textContent = "Not verified yet. Open the link in the email first (check spam), then tap again."; return; }
        await u.getIdToken(true); // new token carries email_verified for the Firestore rules
        showGate("checking", spinner("Checking your invite…"));
        if (await admit(u)) booted = u.uid;
      } catch (e) {
        console.warn(e);
        vb.disabled = false; vb.textContent = "I've verified";
        errEl.textContent = friendlyAuthError(e);
      }
    });
    const rb = document.getElementById("sbResend");
    rb.addEventListener("click", async () => {
      errEl.textContent = ""; rb.disabled = true;
      try {
        await authMod.sendEmailVerification(auth.currentUser || fbUser, { url: siteOrigin() + "/" }).catch(() => authMod.sendEmailVerification(auth.currentUser || fbUser));
        rb.textContent = "Sent! Check your email";
      } catch (e) { rb.disabled = false; errEl.textContent = friendlyAuthError(e); }
    });
  }

  const standalone = () => {
    try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (_) { return false; }
  };

  async function signIn(btn) {
    const errEl = document.getElementById("sbSignErr");
    errEl.textContent = "";
    btn.disabled = true;
    // Home-screen apps can't use popups (the popup opens in a separate browser), so
    // they go through a full-page redirect. Everywhere else a popup is quickest; if
    // the browser blocks it we fall back to the redirect too.
    if (standalone()) {
      try { await authMod.signInWithRedirect(auth, provider); } catch (e) { btn.disabled = false; errEl.textContent = friendlyAuthError(e); }
      return;
    }
    try {
      await authMod.signInWithPopup(auth, provider);
    } catch (e) {
      const code = e && e.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/web-storage-unsupported") {
        try { await authMod.signInWithRedirect(auth, provider); return; } catch (e2) { e = e2; }
      }
      btn.disabled = false;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") errEl.textContent = friendlyAuthError(e);
    }
  }

  // kind: "password" (email + password sign-in), "create", "link", "setpw", or none.
  function friendlyAuthError(e, kind) {
    const code = (e && e.code) || "";
    if (code === "auth/unauthorized-domain") return "This web address isn't on the Firebase authorized domains list yet.";
    if (code === "auth/network-request-failed") return "Network problem. Check your connection and try again.";
    if (code === "auth/invalid-email") return "That email address doesn't look right.";
    if (code === "auth/missing-password") return "Type your password.";
    if (code === "auth/operation-not-allowed") {
      if (kind === "password" || kind === "create" || kind === "setpw") return "Email & password sign-in isn't switched on yet. Tell the commish, and use Google or an email link for now.";
      return "Email sign-in isn't switched on yet. Use Google, or ask the commish.";
    }
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-login-credentials")
      return "Wrong email or password. Never set a password (you used email links before)? Tap \u201cForgot password?\u201d to make one.";
    if (code === "auth/email-already-in-use") return "There's already an account for that email. Tap \u201cI already have an account\u201d and sign in. Never set a password? Use \u201cForgot password?\u201d to make one.";
    if (code === "auth/weak-password") return `Pick a stronger password (at least ${MIN_PW} characters).`;
    if (code === "auth/user-disabled") return "This account has been switched off. Ask the commish.";
    if (code === "auth/requires-recent-login") return "For security, sign in again first.";
    if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") return "That sign-in link has expired or was already used. Ask for a new one.";
    if (code === "auth/too-many-requests") return "Too many tries. Wait a minute and try again.";
    if (kind === "setpw") return "Couldn't save the password. Please try again.";
    return "Couldn't sign in. Please try again.";
  }

  /* ---------- passwords for email-link players ---------- */
  // On iPhone the home-screen app has its own storage, and emailed links open in
  // Safari, so link-only players could never sign in inside the app. Letting them
  // add a password fixes that. "Has a password" isn't on the client User object,
  // so ask the Auth REST API (accounts:lookup) and remember the answer per device.
  const pwKey = (uid) => "sb-haspw-" + uid;
  function markHasPw(uid) { try { localStorage.setItem(pwKey(uid), "1"); } catch (_) {} PW.has = true; }
  const PW = { has: null, google: false, linkish: false, email: "" };
  async function lookupHasPw(u) {
    try { if (localStorage.getItem(pwKey(u.uid)) === "1") return true; } catch (_) {}
    try {
      const tok = await u.getIdToken();
      const base = (emu ? AUTH_EMU + "/" : "https://") + "identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(firebaseConfig.apiKey);
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: tok }) });
      if (!r.ok) return null;
      const j = await r.json();
      const x = j && j.users && j.users[0];
      if (!x) return null;
      const has = !!(x.passwordHash || x.passwordUpdatedAt);
      if (has) markHasPw(u.uid);
      return has;
    } catch (_) { return null; }
  }
  const needsPw = () => PW.linkish && PW.has === false;
  window.SB_PWROW = () => {
    const u = auth.currentUser;
    if (!u || !u.email) return "";
    const set = !PW.has;
    return `<div class="sbpw-row">${needsPw() ? `<p class="small" style="margin:0;color:var(--gold,#ffcf2f)">Using the home-screen app? Set a password so you can sign in there.</p>` : ""}
      <button class="btn ghost" data-act="setPassword">${set ? "Set password" : "Change password"}</button></div>`;
  };
  window.SB_SETPW = () => openPwSheet();

  function closePwSheet() { const o = document.getElementById("sbPwSheet"); if (o) o.remove(); }
  function openPwSheet(note) {
    const u = auth.currentUser;
    if (!u) return;
    closePwSheet();
    const change = !!PW.has;
    const o = document.createElement("div");
    o.id = "sbPwSheet";
    o.className = "sbgate sbpw";
    o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-labelledby", "sbPwTitle");
    o.innerHTML = `<div class="sbgate-card"><div class="sbgate-body">
      <p class="sbgate-h" id="sbPwTitle">${change ? "Change password" : "Set a password"}</p>
      ${note ? `<p class="sbgate-note" style="color:var(--g-gold)">${esc(note)}</p>` : ""}
      <p>${change ? "Your sign-in email stays the same." : "Then sign in anywhere, including the home-screen app, with your email and this password."}</p>
      <form class="sbgate-form" id="sbPwSet">
        <input type="email" name="username" autocomplete="username" value="${esc(u.email)}" readonly class="sbgate-input sbgate-email sbgate-ro" aria-label="Email">
        ${change ? pwField("sbPwCur", "current-password", "Current password") : ""}
        ${pwField("sbPwNew", "new-password", "New password (" + MIN_PW + "+ characters)")}
        <button type="submit" class="sbgate-btn" id="sbPwSave">Save password</button>
      </form>
      <p class="sbgate-err" id="sbPwErr" role="alert"></p>
      <div id="sbPwRelog"></div>
      <button type="button" class="sbgate-btn ghost" id="sbPwClose">${change ? "Cancel" : "Not now"}</button>
    </div></div>`;
    document.body.appendChild(o);
    wireEyes(o);
    o.addEventListener("click", (ev) => { if (ev.target === o) closePwSheet(); });
    document.getElementById("sbPwClose").addEventListener("click", closePwSheet);
    setTimeout(() => { try { document.getElementById(change ? "sbPwCur" : "sbPwNew").focus(); } catch (_) {} }, 50);
    document.getElementById("sbPwSet").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const errEl = document.getElementById("sbPwErr"), sb = document.getElementById("sbPwSave");
      const nw = document.getElementById("sbPwNew").value, cur = change ? document.getElementById("sbPwCur").value : "";
      errEl.textContent = "";
      if (nw.length < MIN_PW) { errEl.textContent = `Use at least ${MIN_PW} characters.`; return; }
      sb.disabled = true; sb.textContent = "Saving…";
      try {
        if (change) await authMod.reauthenticateWithCredential(u, authMod.EmailAuthProvider.credential(u.email, cur));
        await authMod.updatePassword(u, nw);
        markHasPw(u.uid);
        try { localStorage.setItem("sb-pwnag-" + u.uid, "1"); } catch (_) {}
        o.querySelector(".sbgate-body").innerHTML = `<div class="sbgate-lock" aria-hidden="true">✅</div>
          <p class="sbgate-h">Password saved</p>
          <p>In the home-screen app, sign in with</p><span class="sbgate-who">${esc(u.email)}</span><p>and your new password.</p>
          <button type="button" class="sbgate-btn" id="sbPwDone">Done</button>`;
        document.getElementById("sbPwDone").addEventListener("click", closePwSheet);
        refreshApp();
      } catch (e) {
        sb.disabled = false; sb.textContent = "Save password";
        if (e && e.code === "auth/requires-recent-login") {
          errEl.textContent = "For security, Firebase needs a fresh sign-in before adding a password.";
          const box = document.getElementById("sbPwRelog");
          box.innerHTML = `<button type="button" class="sbgate-btn" id="sbPwLink">Email me a fresh sign-in link</button>
            <p class="sbgate-note">Open it, and this password screen comes right back up. Or sign out, sign in again, and set the password straight away.</p>`;
          const lb = document.getElementById("sbPwLink");
          lb.addEventListener("click", async () => {
            lb.disabled = true;
            try {
              await authMod.sendSignInLinkToEmail(auth, u.email, { url: location.origin + "/?setpw=1", handleCodeInApp: true });
              try { localStorage.setItem(EMAIL_KEY, u.email); } catch (_) {}
              lb.textContent = "Sent! Check your email";
            } catch (e2) { lb.disabled = false; errEl.textContent = friendlyAuthError(e2, "link"); }
          });
        } else if (change && (e && (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/invalid-login-credentials"))) {
          errEl.textContent = "Current password is wrong. Forgot it? Sign out and use \u201cForgot password?\u201d.";
        } else errEl.textContent = friendlyAuthError(e, "setpw");
      }
    });
  }
  function refreshApp() { try { if (typeof window.SB_RENDER === "function") window.SB_RENDER(); } catch (_) {} }

  // A small one-time nudge after sign-in in a normal browser tab (that's where
  // link-only players end up): set a password to use the home-screen app.
  function showPwNag(u) {
    if (document.getElementById("sbPwNag") || document.getElementById("sbPwSheet")) return;
    const d = document.createElement("div");
    d.id = "sbPwNag"; d.className = "sbpw-nag"; d.setAttribute("role", "status");
    d.innerHTML = `<p><strong>Using the home-screen app?</strong> Set a password so you can sign in there.</p>
      <div class="sbpw-nag-row"><button type="button" class="sbgate-btn" id="sbPwNagGo">Set password</button><button type="button" class="sbgate-btn ghost" id="sbPwNagNo">Not now</button></div>`;
    document.body.appendChild(d);
    try { localStorage.setItem("sb-pwnag-" + u.uid, "1"); } catch (_) {}
    document.getElementById("sbPwNagGo").addEventListener("click", () => { d.remove(); openPwSheet(); });
    document.getElementById("sbPwNagNo").addEventListener("click", () => d.remove());
  }
  async function afterAdmit(u) {
    const ids = (u.providerData || []).map((p) => p.providerId);
    PW.google = ids.includes("google.com");
    PW.linkish = ids.includes("password"); // email-link and password accounts both show up as "password"
    PW.has = PW.linkish ? await lookupHasPw(u) : false;
    refreshApp();
    let wantSheet = false;
    try { wantSheet = sessionStorage.getItem("sb-setpw") === "1"; sessionStorage.removeItem("sb-setpw"); } catch (_) {}
    if (wantSheet) return setTimeout(() => openPwSheet(PW.has ? "" : "You're signed in again. Set your password now."), 1200);
    let nagged = false;
    try { nagged = localStorage.getItem("sb-pwnag-" + u.uid) === "1"; } catch (_) {}
    if (needsPw() && !standalone() && !nagged) setTimeout(() => { if (auth.currentUser && auth.currentUser.uid === u.uid) showPwNag(u); }, 2500);
  }

  /* ---------- invite check + identity ---------- */
  // links/{firebase uid} = {oldId, email, code} is your "membership card". It is
  // created by redeeming an invite code (or automatically for the bootstrap admin)
  // and says which player id you are in the app. Rules treat "has a link doc" as
  // "invited".
  async function admit(fbUser) {
    const email = String(fbUser.email || "").trim().toLowerCase();
    const linkRef = fsMod.doc(fs, "links/" + fbUser.uid);
    let link = await fsMod.getDoc(linkRef);

    if (!link.exists() && email === BOOTSTRAP_ADMIN_EMAIL && fbUser.emailVerified !== false) {
      // The owner's first sign-in: link straight to their old artifact player.
      await fsMod.setDoc(linkRef, { oldId: BOOTSTRAP_ADMIN_OLD_ID, email, code: "bootstrap", at: Date.now() });
      link = await fsMod.getDoc(linkRef);
    }
    if (!link.exists()) {
      showRedeem(fbUser, email);
      return false;
    }
    takePendingInvite(); // already in: forget any code from the URL
    const me = String(link.data().oldId || fbUser.uid);

    let isAdmin = email === BOOTSTRAP_ADMIN_EMAIL;
    try {
      const a = await fsMod.getDoc(fsMod.doc(fs, "config/admins"));
      const list = a.exists() && Array.isArray(a.data().emails) ? a.data().emails.map((x) => String(x).trim().toLowerCase()) : [];
      if (list.includes(email)) isAdmin = true;
    } catch (_) {}

    const db = makeDb(fsMod, fs);
    const user = makeUser(fsMod, fs, me, isAdmin, fbUser);

    // Keep a display name the rest of the league can see (the old artifact got names from claude.ai).
    const name = (fbUser.displayName || email.split("@")[0] || "").trim().slice(0, 60);
    try {
      const pref = fsMod.doc(fs, "profiles/" + me);
      const cur = await fsMod.getDoc(pref);
      if (!cur.exists() || cur.data().name !== name) await fsMod.setDoc(pref, { name, at: Date.now(), wv: "v2." + Math.random().toString(36).slice(2, 10) }, { merge: true });
    } catch (e) { console.warn("profile name not saved", e); }

    if (isAdmin) {
      try { (await import("./invites-admin.js")).installInvitesAdmin(fsMod, fs, { me, email, uid: fbUser.uid, site: siteOrigin() }); }
      catch (e) { console.warn("invite admin not loaded", e); }
    }

    window.SB_INFO = { me, email, isAdmin, firebaseUid: fbUser.uid };
    hideGate();
    window.__sbResolve({ db, user });
    afterAdmit(fbUser).catch((e) => console.warn("password check", e));
    return true;
  }

  function showRedeem(fbUser, email, msg) {
    const pre = peekPendingInvite();
    showGate("redeem", `
      <p class="sbgate-h">BiggieCheese's Sportsbook is invite-only</p>
      <p><strong>Enter your invite code.</strong> The commish sends each player one. Got a link instead? Open it and the code fills in.</p>
      <form class="sbgate-form" id="sbRedeem" autocomplete="off">
        <label class="sbgate-vh" for="sbCode">Invite code</label>
        <input id="sbCode" class="sbgate-input" name="code" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false"
          maxlength="16" placeholder="ABCD2345" value="${esc(pre)}" required>
        <button type="submit" class="sbgate-btn" id="sbRedeemBtn">Join the league</button>
      </form>
      <p class="sbgate-err" id="sbRedeemErr" role="alert">${esc(msg || "")}</p>
      <p class="sbgate-note">Signed in as</p><span class="sbgate-who">${esc(fbUser.email || "an account with no email")}</span>
      <button type="button" class="sbgate-btn ghost" data-sbsignout>Use a different account</button>`);
    wireSignOut();
    const form = document.getElementById("sbRedeem"), input = document.getElementById("sbCode"), btn = document.getElementById("sbRedeemBtn");
    if (!pre) setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const errEl = document.getElementById("sbRedeemErr");
      errEl.textContent = "";
      const code = normCode(input.value);
      if (code.length < 6) { errEl.textContent = "That code looks too short."; return; }
      btn.disabled = true; btn.textContent = "Checking…";
      try {
        await redeem(fbUser, email, code);
        takePendingInvite();
        showGate("checking", spinner("You're in! Loading the board…"));
        await admit(fbUser);
      } catch (e) {
        console.warn(e);
        btn.disabled = false; btn.textContent = "Join the league";
        errEl.textContent = e && e.userMessage ? e.userMessage : "Couldn't use that code. Check it and try again.";
      }
    });
  }

  async function redeem(fbUser, email, code) {
    const fail = (m) => Object.assign(new Error(m), { userMessage: m });
    if (!email || fbUser.emailVerified === false) throw fail("Your account needs a verified email first.");
    const invRef = fsMod.doc(fs, "invites/" + code);
    let inv;
    try { inv = await fsMod.getDoc(invRef); } catch (e) { throw fail("That code doesn't work. Check it with the commish."); }
    if (!inv.exists()) throw fail("That code doesn't work. Check it with the commish.");
    const d = inv.data();
    if (d.revoked) throw fail("That code was cancelled. Ask the commish for a new one.");
    if (d.used) throw fail("That code has already been used. Ask the commish for a new one.");
    const now = Date.now();
    const batch = fsMod.writeBatch(fs);
    batch.update(invRef, { used: true, claimedBy: fbUser.uid, claimedEmail: email, claimedAt: now });
    batch.set(fsMod.doc(fs, "links/" + fbUser.uid), { oldId: d.oldId || fbUser.uid, email, code, at: now });
    try { await batch.commit(); }
    catch (e) { throw fail("That code was just used or cancelled. Ask the commish for a new one."); }
  }

}

/* ======================================================================
 * db: the artifact store API on top of Firestore
 * ====================================================================== */
function wrapError(e) {
  if (!e || typeof e !== "object") return e;
  const map = { "permission-denied": "not_granted", "not-found": "invalid_argument", "invalid-argument": "invalid_argument",
    "failed-precondition": "invalid_argument", "resource-exhausted": "resource_exhausted", unavailable: "unavailable", unauthenticated: "not_granted" };
  const out = new Error(e.message || String(e));
  out.code = map[e.code] || e.code || "unavailable";
  out.firebaseCode = e.code;
  return out;
}
const rethrow = (e) => { throw wrapError(e); };

/* ----------------------------------------------------------------------
 * Usage meter: a client-side estimate of the Firestore reads and writes this
 * page is billed for (free plan: 50k reads / 20k writes a day). It counts a
 * read per document a get returns (at least one), per document a listener
 * receives from the server (the first snapshot included, at least one), and
 * one per listener of ours that covers a document we write (the server echoes
 * our own writes back to our listeners). One write per set/update/delete/add.
 * Look at it in the console: SB_USAGE.r, SB_USAGE.w, SB_USAGE.by.
 * ---------------------------------------------------------------------- */
const USAGE = (window.SB_USAGE = window.SB_USAGE || { r: 0, w: 0, by: {} });
const collOf = (path) => String(path || "").split("/")[0];
function meter(coll, r, w) {
  const b = USAGE.by[coll] || (USAGE.by[coll] = { r: 0, w: 0 });
  b.r += r; b.w += w; USAGE.r += r; USAGE.w += w;
}
const LISTENERS = new Set(); // {doc: "coll/id"} or {coll: "coll"}
function echo(path) {
  const c = collOf(path);
  let n = 0;
  for (const l of LISTENERS) if (l.doc === path || l.coll === c) n++;
  if (n) meter(c, n, 0);
}

function makeDb(F, fs) {
  const wrapDocSnap = (s) => {
    let cached;
    return {
      id: s.id,
      exists: s.exists(),                // artifact: boolean property (Firestore: method)
      data: () => {
        if (!s.exists()) return undefined;
        if (cached === undefined) cached = decode(s.data());
        return cached;
      },
      metadata: s.metadata,
      ref: docRef(s.ref),
    };
  };
  const wrapQuerySnap = (qs) => {
    const docs = qs.docs.map(wrapDocSnap);
    return {
      docs, size: qs.size, empty: qs.empty, metadata: qs.metadata,
      docChanges: () => qs.docChanges().map((c) => ({ type: c.type, doc: wrapDocSnap(c.doc), oldIndex: c.oldIndex, newIndex: c.newIndex })),
      forEach: (fn) => docs.forEach(fn),
    };
  };

  // Artifact update(): nested objects merge recursively; anything else (arrays
  // included) replaces the field. Firestore update() replaces a whole map when
  // given one, so nested objects are flattened into field paths instead:
  // {cards:{lm1:2}} becomes the field path cards.lm1 = 2.
  const updatePairs = (data) => {
    const pairs = [];
    const walk = (obj, prefix) => {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v === undefined) continue;
        const path = prefix.concat(k);
        if (isPlainObject(v)) {
          // Merging {} into a map changes nothing, so there is nothing to write.
          if (Object.keys(v).length) walk(v, path);
        } else {
          pairs.push(new F.FieldPath(...path), encode(v));
        }
      }
    };
    walk(data || {}, []);
    return pairs;
  };

  // Oct 23: every write carries a fresh random "wv" (write version). The Firestore rules refuse writes without a new wv,
  // so a tab still running an older copy of the app (which doesn't know about the deflation) can't change money.
  const WV = () => "v2." + Math.random().toString(36).slice(2, 10);
  function docRef(ref) {
    return {
      id: ref.id,
      path: ref.path,
      get: () => { meter(collOf(ref.path), 1, 0); return F.getDoc(ref).then(wrapDocSnap, rethrow); },
      set: (data) => { meter(collOf(ref.path), 0, 1); echo(ref.path); return F.setDoc(ref, { ...encode(data || {}), wv: WV() }).catch(rethrow); },
      update: async (data) => {
        const pairs = updatePairs(data);
        if (!pairs.length) {
          // Nothing to change; still honour "update requires the document to exist".
          meter(collOf(ref.path), 1, 0);
          const s = await F.getDoc(ref).catch(rethrow);
          if (!s.exists()) throw Object.assign(new Error("No document to update: " + ref.path), { code: "invalid_argument" });
          return;
        }
        meter(collOf(ref.path), 0, 1); echo(ref.path);
        pairs.push(new F.FieldPath("wv"), WV());
        return F.updateDoc(ref, ...pairs).catch(rethrow);
      },
      delete: () => { meter(collOf(ref.path), 0, 1); echo(ref.path); return F.deleteDoc(ref).catch(rethrow); },
      onSnapshot: (next, error) => {
        const l = { doc: ref.path };
        LISTENERS.add(l);
        const un = F.onSnapshot(ref, (s) => { if (!s.metadata.hasPendingWrites && !s.metadata.fromCache) meter(collOf(ref.path), 1, 0); next(wrapDocSnap(s)); },
          (e) => { LISTENERS.delete(l); if (error) error(wrapError(e)); else console.error(e); });
        return () => { LISTENERS.delete(l); un(); };
      },
      collection: (p) => collRef(F.collection(ref, p)),
    };
  }

  function queryRef(q, coll) {
    return {
      where: (f, op, v) => queryRef(F.query(q, F.where(f, op, encode(v))), coll),
      orderBy: (f, dir) => queryRef(F.query(q, F.orderBy(f, dir || "asc")), coll),
      limit: (n) => queryRef(F.query(q, F.limit(n)), coll),
      get: () => F.getDocs(q).then((s) => { meter(coll, Math.max(1, s.size), 0); return wrapQuerySnap(s); }, rethrow),
      onSnapshot: (next, error) => {
        const l = { coll };
        LISTENERS.add(l);
        let first = true;
        const un = F.onSnapshot(q, (s) => {
          if (!s.metadata.fromCache) {
            let n = 0;
            for (const c of s.docChanges()) if (!c.doc.metadata.hasPendingWrites) n++;
            if (first && !n) n = 1; // an empty result still costs one read
            if (n) meter(coll, n, 0);
            first = false;
          }
          next(wrapQuerySnap(s));
        }, (e) => { LISTENERS.delete(l); if (error) error(wrapError(e)); else console.error(e); });
        return () => { LISTENERS.delete(l); un(); };
      },
    };
  }

  function collRef(c) {
    return Object.assign(queryRef(c, collOf(c.path)), {
      path: c.path,
      doc: (id) => docRef(id ? F.doc(c, id) : F.doc(c)),
      add: (data) => { const r = id0(c); meter(collOf(c.path), 0, 1); echo(r.path); return F.setDoc(r, { ...encode(data || {}), wv: WV() }).then(() => docRef(r), rethrow); },
    });
  }
  const id0 = (c) => F.doc(c);

  return Object.freeze({
    doc: (path) => docRef(F.doc(fs, path)),
    collection: (path) => collRef(F.collection(fs, path)),
  });
}

/* ======================================================================
 * user: the artifact `user` capability on top of Firebase Auth
 * ====================================================================== */
function makeUser(F, fs, me, isAdmin, fbUser) {
  const cache = new Map(); // id -> {name, t}
  return Object.freeze({
    id: async () => me,
    me: async () => ({ id: me, name: fbUser.displayName || "" }),
    isOwner: async () => isAdmin,
    canEdit: async () => isAdmin,
    can: async () => true,          // every invited player can play; Firestore rules have the final say
    profiles: async (ids) => {
      const out = {};
      const now = Date.now();
      await Promise.all([...new Set(ids || [])].filter(Boolean).map(async (id) => {
        const c = cache.get(id);
        if (c && now - c.t < 5 * 60e3) { out[id] = { id, name: c.name }; return; }
        let name = "";
        try {
          const s = await F.getDoc(F.doc(fs, "profiles/" + id));
          if (s.exists()) name = String(s.data().name || "");
        } catch (_) {}
        cache.set(id, { name, t: now });
        out[id] = { id, name };
      }));
      return out;
    },
  });
}
