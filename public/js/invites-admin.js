/*
 * Admin tab: invite codes.
 *
 * Loaded by firebase-shim.js for admins only. The app's Admin tab calls
 * window.SB_INVITES.html(S.prefs, nm) while it renders, and this module keeps
 * the section up to date as invites/links change.
 *
 *   invites/{CODE} {oldId, team, createdAt, createdBy, used, revoked,
 *                   claimedBy, claimedEmail, claimedAt}
 *       oldId = the existing player (prefs doc id) the code unlocks, or null
 *               for a brand-new player.
 *   links/{firebase uid} {oldId, email, code, at}
 *       one per signed-in account that redeemed a code.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function newCode(len = 8) {
  const r = new Uint32Array(len);
  crypto.getRandomValues(r);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[r[i] % ALPHABET.length];
  return s;
}

export function installInvitesAdmin(F, fs, ctx) {
  const st = { invites: [], links: [], prefs: {}, nm: (id) => id, err: "", busy: false, flash: "" };
  const link = (code) => `${ctx.site}/?invite=${encodeURIComponent(code)}`;
  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

  F.onSnapshot(F.collection(fs, "invites"), (s) => { st.invites = s.docs.map((d) => ({ code: d.id, ...d.data() })); paint(); },
    (e) => { st.err = "Couldn't load invites: " + (e && e.code); paint(); });
  F.onSnapshot(F.collection(fs, "links"), (s) => { st.links = s.docs.map((d) => ({ uid: d.id, ...d.data() })); paint(); },
    (e) => { st.err = "Couldn't load linked accounts: " + (e && e.code); paint(); });

  function inviteRow(inv) {
    const status = inv.revoked ? `<span class="muted">cancelled</span>`
      : inv.used ? `<span>used by <b>${esc(inv.claimedEmail || "someone")}</b> · ${esc(when(inv.claimedAt))}</span>`
      : `<span class="sbinv-open">unused</span>`;
    return `<div class="sbinv-code">
      <code>${esc(inv.code)}</code> ${status}
      <span class="sbinv-acts">
        ${!inv.used && !inv.revoked ? `<button type="button" class="btn ghost small" data-sbinv-copy="${esc(inv.code)}">Copy link</button>` : ""}
        ${!inv.used && !inv.revoked && navigator.share ? `<button type="button" class="btn ghost small" data-sbinv-share="${esc(inv.code)}">Share</button>` : ""}
        ${!inv.used && !inv.revoked ? `<button type="button" class="btn danger small" data-sbinv-revoke="${esc(inv.code)}">Revoke</button>` : ""}
        ${inv.used && !inv.revoked && inv.claimedBy ? `<button type="button" class="btn danger small" data-sbinv-unlink="${esc(inv.claimedBy)}" data-code="${esc(inv.code)}">Remove access</button>` : ""}
      </span>
      ${!inv.used && !inv.revoked ? `<div class="small muted sbinv-url">${esc(link(inv.code))}</div>` : ""}
    </div>`;
  }

  function html() {
    const ids = Object.keys(st.prefs || {}).sort((a, b) => String(st.nm(a)).localeCompare(String(st.nm(b))));
    const byOld = {};
    for (const inv of st.invites) (byOld[inv.oldId || ""] = byOld[inv.oldId || ""] || []).push(inv);
    for (const k in byOld) byOld[k].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const linksBy = {};
    for (const l of st.links) (linksBy[l.oldId] = linksBy[l.oldId] || []).push(l);

    const teamRows = ids.map((id) => {
      const ls = linksBy[id] || [];
      const invs = (byOld[id] || []).filter((i) => !i.revoked || i.used).slice(0, 4);
      return `<div class="sbinv-team">
        <div class="sbinv-head"><span><b>${esc(st.nm(id))}</b><small class="muted"> ${esc(id)}</small></span>
          <button type="button" class="btn gold small" data-sbinv-make="${esc(id)}" ${st.busy ? "disabled" : ""}>Make invite code</button></div>
        ${ls.length ? `<div class="small">Signed in: ${ls.map((l) => `<b>${esc(l.email)}</b>`).join(", ")}</div>` : `<div class="small muted">Nobody has signed in as this team yet.</div>`}
        ${invs.map(inviteRow).join("")}
      </div>`;
    }).join("");

    const fresh = (byOld[""] || []).filter((i) => !i.revoked || i.used).slice(0, 12);
    return `<div id="sbInvites"><section class="card sbinv">
      <h3>Invite codes</h3>
      <p class="small muted">Each code works once. Send a player the link for their team; when they sign in and use it, their Google or email account takes over that team's balance, bets and cards. "Remove access" signs that account out of the team for good (make a new code to re-invite).</p>
      ${st.err ? `<p class="note">${esc(st.err)}</p>` : ""}
      ${st.flash ? `<p class="note sbinv-flash">${esc(st.flash)}</p>` : ""}
      <div class="sbinv-list">${teamRows || `<p class="small muted">No teams yet.</p>`}</div>
      <div class="sbinv-team">
        <div class="sbinv-head"><span><b>New player</b><small class="muted"> starts fresh with the normal starting balance</small></span>
          <button type="button" class="btn gold small" data-sbinv-make="" ${st.busy ? "disabled" : ""}>New player invite</button></div>
        ${fresh.map(inviteRow).join("")}
      </div>
    </section></div>`;
  }

  function paint() {
    const el = document.getElementById("sbInvites");
    if (el) el.outerHTML = html();
  }

  async function make(oldId) {
    st.busy = true; st.flash = ""; paint();
    try {
      let code;
      for (let i = 0; i < 5; i++) {
        code = newCode();
        const ex = await F.getDoc(F.doc(fs, "invites/" + code));
        if (!ex.exists()) break;
        code = null;
      }
      if (!code) throw new Error("couldn't pick a free code");
      await F.setDoc(F.doc(fs, "invites/" + code), {
        oldId: oldId || null, team: oldId ? String(st.nm(oldId)) : "New player",
        createdAt: Date.now(), createdBy: ctx.email, used: false, revoked: false,
      });
      st.flash = `New code ${code} for ${oldId ? st.nm(oldId) : "a new player"}. Copy the link and send it.`;
    } catch (e) {
      st.flash = "Couldn't make a code: " + (e && (e.code || e.message));
    }
    st.busy = false; paint();
  }

  async function copy(code) {
    const url = link(code);
    try { await navigator.clipboard.writeText(url); st.flash = "Link copied: " + url; }
    catch (_) { window.prompt("Copy this invite link:", url); }
    paint();
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-sbinv-make],[data-sbinv-copy],[data-sbinv-share],[data-sbinv-revoke],[data-sbinv-unlink]");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-sbinv-make")) return make(t.getAttribute("data-sbinv-make"));
    if (t.dataset.sbinvCopy) return copy(t.dataset.sbinvCopy);
    if (t.dataset.sbinvShare) {
      try { await navigator.share({ title: "BiggieCheese's Sportsbook invite", text: "Your invite to the league's sportsbook:", url: link(t.dataset.sbinvShare) }); } catch (_) {}
      return;
    }
    if (t.dataset.sbinvRevoke) {
      if (!confirm(`Revoke code ${t.dataset.sbinvRevoke}? It will stop working.`)) return;
      try { await F.updateDoc(F.doc(fs, "invites/" + t.dataset.sbinvRevoke), { revoked: true }); st.flash = "Code revoked."; }
      catch (err) { st.flash = "Couldn't revoke: " + (err && err.code); }
      return paint();
    }
    if (t.dataset.sbinvUnlink) {
      const uid = t.dataset.sbinvUnlink, code = t.dataset.code;
      if (uid === ctx.uid) { st.flash = "That's you. You can't remove your own access here."; return paint(); }
      if (!confirm("Remove this account's access? They'll be signed out of the team and need a new code.")) return;
      try {
        const b = F.writeBatch(fs);
        b.delete(F.doc(fs, "links/" + uid));
        if (code) b.update(F.doc(fs, "invites/" + code), { revoked: true });
        await b.commit();
        st.flash = "Access removed.";
      } catch (err) { st.flash = "Couldn't remove access: " + (err && err.code); }
      return paint();
    }
  });

  window.SB_INVITES = Object.freeze({
    html(prefs, nm) {
      st.prefs = prefs || {};
      if (typeof nm === "function") st.nm = nm;
      return html();
    },
  });
}
