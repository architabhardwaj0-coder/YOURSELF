// Groups: members, spin wheel, random questions from a Question Set, leaderboard.
import { pages, afterRender, state, $, uid, esc, toast, go, render, expose, currentUser, saveCurrentUser, shell } from "./core.js";

const RIGHT = 5, WRONG = -5;
const gs = { angle: 0, spinning: false, picked: null, question: null, showAnswer: false };

const group = () => currentUser().groups.find(g => g.id === state.selectedGroupId);
const withGroup = fn => { const u = currentUser(), g = u.groups.find(x => x.id === state.selectedGroupId); if (!g) return; const r = fn(g, u); saveCurrentUser(u); return r; };

/* ---- list / create ---- */
pages.groups = () => {
  const u = currentUser();
  return shell(`<div class="page-title">Groups</div>
    <div class="set-form"><label class="field-label" for="newGroupName">Name of group</label>
      <div class="row"><input id="newGroupName" class="input" placeholder="e.g. Class 10-A"><button class="btn btn-primary" onclick="addGroup()">Create</button></div></div>
    <div class="set-list">${u.groups.length ? u.groups.map(g => `<button class="set-item" onclick="openGroup('${g.id}')"><span>${esc(g.name)}<br><small>${g.members.length} member(s)</small></span><span class="arrow">›</span></button>`).join("") : `<div class="empty">No groups yet. Create one, add members, then spin the wheel.</div>`}</div>`);
};
function addGroup() {
  const name = $("newGroupName").value.trim(); if (!name) return toast("Enter a group name.");
  const u = currentUser();
  if (u.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) return toast("A group with that name already exists.");
  const g = { id: uid("grp"), name, members: [], setId: "", askedIds: [], safeMode: true };
  u.groups.push(g); if (saveCurrentUser(u)) openGroup(g.id);
}
function openGroup(id) { Object.assign(gs, { picked: null, question: null, showAnswer: false }); go("groupDetail", { selectedGroupId: id }); }
function deleteGroup() {
  if (!confirm("Delete this group and its scores?")) return;
  const u = currentUser(); u.groups = u.groups.filter(g => g.id !== state.selectedGroupId); saveCurrentUser(u); go("groups");
}

/* ---- members ---- */
function addMembers(names) {
  const added = withGroup(g => {
    let n = 0;
    for (const raw of names) {
      const name = raw.trim(); if (!name) continue;
      if (g.members.some(m => m.name.toLowerCase() === name.toLowerCase())) continue;
      g.members.push({ id: uid("m"), name, score: 0, safe: false }); n++;
    }
    return n;
  });
  if (!added) return toast("No new names were added (empty or already in the group).");
  render(); toast(`Added ${added} member(s).`);
}
const addMember = () => addMembers([$("memberName").value]);
const addMemberList = () => addMembers($("memberList").value.split(/\r?\n|,/));
function removeMember(id) { withGroup(g => { g.members = g.members.filter(m => m.id !== id); }); if (gs.picked === id) gs.picked = null; render(); }
function resetRound() { withGroup(g => { g.members.forEach(m => (m.safe = false)); g.askedIds = []; }); gs.picked = null; gs.question = null; render(); toast("Round reset. Everyone is back on the wheel."); }
function resetScores() { if (!confirm("Reset all scores to 0?")) return; withGroup(g => g.members.forEach(m => { m.score = 0; m.safe = false; })); render(); }
function setSet(id) { withGroup(g => { g.setId = id; g.askedIds = []; }); gs.question = null; render(); }
function setSafeMode(on) { withGroup(g => { g.safeMode = on; }); render(); }

/* ---- questions ---- */
function randomQuestion() {
  const u = currentUser(), g = group(); const set = u.sets.find(s => s.id === g.setId);
  if (!set || !set.questions.length) return toast("Choose a Question Set that has questions.");
  let pool = set.questions.filter(q => !g.askedIds.includes(q.id));
  if (!pool.length) { pool = set.questions; withGroup(x => { x.askedIds = []; }); toast("All questions used — starting over."); }
  const q = pool[Math.floor(Math.random() * pool.length)];
  withGroup(x => { x.askedIds.push(q.id); });
  gs.question = q; gs.showAnswer = false; render();
}
const toggleAnswer = () => { gs.showAnswer = !gs.showAnswer; render(); };
function mark(delta) {
  withGroup(g => { const m = g.members.find(x => x.id === gs.picked); if (!m) return; m.score += delta; if (delta > 0 && g.safeMode) m.safe = true; });
  gs.picked = null; render();
}

/* ---- wheel ---- */
const active = g => (g.safeMode ? g.members.filter(m => !m.safe) : g.members);
function drawWheel() {
  const cv = $("wheel"); if (!cv || state.page !== "groupDetail") return;
  const g = group(); if (!g) return;
  const list = active(g), size = 340, dpr = window.devicePixelRatio || 1;
  cv.width = size * dpr; cv.height = size * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  const c = size / 2, r = c - 6;
  ctx.clearRect(0, 0, size, size);
  if (!list.length) {
    ctx.fillStyle = "#eef3ff"; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#657087"; ctx.font = "600 15px Inter,system-ui,sans-serif"; ctx.textAlign = "center";
    ctx.fillText(g.members.length ? "Everyone is safe" : "Add members to begin", c, c - 56); return;
  }
  const seg = (Math.PI * 2) / list.length;
  list.forEach((m, i) => {
    const a0 = gs.angle + i * seg;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, a0, a0 + seg); ctx.closePath();
    ctx.fillStyle = `hsl(${(i * 360) / Math.max(list.length, 6) + 215} 62% ${i % 2 ? 62 : 70}%)`; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(c, c); ctx.rotate(a0 + seg / 2); ctx.textAlign = "right"; ctx.fillStyle = "#172033";
    ctx.font = `700 ${Math.max(11, Math.min(17, 190 / list.length + 8))}px Inter,system-ui,sans-serif`;
    ctx.fillText(m.name.length > 14 ? m.name.slice(0, 13) + "…" : m.name, r - 14, 5); ctx.restore();
  });
}
function spin() {
  const g = group(), list = active(g);
  if (gs.spinning) return;
  if (!g.members.length) return toast("Add members first.");
  if (!list.length) return toast("Everyone is safe. Reset the round to spin again.");
  const rnd = new Uint32Array(1); crypto.getRandomValues(rnd);
  const win = rnd[0] % list.length, seg = (Math.PI * 2) / list.length, TAU = Math.PI * 2;
  const target = -Math.PI / 2 - (win + 0.5) * seg;
  const delta = (((target - gs.angle) % TAU) + TAU) % TAU + TAU * (5 + (rnd[0] % 3));
  const start = gs.angle, dur = 4200, t0 = performance.now();
  gs.spinning = true; gs.picked = null; const st = $("spinStatus"); if (st) st.textContent = "Spinning…";
  (function frame(now) {
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
    gs.angle = start + delta * e; drawWheel();
    if (t < 1) return requestAnimationFrame(frame);
    gs.spinning = false; gs.picked = list[win].id; render();
  })(t0);
}

pages.groupDetail = () => {
  const u = currentUser(), g = group();
  if (!g) return shell(`<div class="empty">Group not found.</div>`);
  const set = u.sets.find(s => s.id === g.setId), picked = g.members.find(m => m.id === gs.picked);
  const board = [...g.members].sort((a, b) => b.score - a.score);
  return shell(`<button class="back" onclick="go('groups')">← Back</button>
    <div class="page-title" style="margin-top:6px">${esc(g.name)}</div>
    <div class="stat-row"><div class="stat"><b>${set ? set.questions.length : 0}</b><span class="small muted">Questions</span></div><div class="stat"><b>${g.members.length}</b><span class="small muted">Students</span></div><div class="stat"><b>${g.members.filter(m => m.safe).length}</b><span class="small muted">Safe</span></div></div>

    <div class="card" style="padding:16px;margin-top:16px"><div class="stack">
      <label class="field-label" for="grpSet" style="margin:0">Question Set for this group</label>
      <select id="grpSet" class="select" onchange="groupSetSet(this.value)"><option value="">— choose a set —</option>${u.sets.map(s => `<option value="${s.id}" ${s.id === g.setId ? "selected" : ""}>${esc(s.name)} (${s.questions.length})</option>`).join("")}</select>
      ${gs.question ? `<div class="question-card" style="margin-top:0"><div class="question-text output">${esc(gs.question.question)}</div>${gs.showAnswer ? `<div class="notice" style="margin-top:10px"><b>Answer:</b><br><span class="output">${esc(gs.question.answer)}</span></div>` : ""}</div>` : `<div class="empty">Press “Random question” to draw one.</div>`}
      <div class="row-wrap"><button class="btn btn-primary" onclick="groupRandomQ()">🎲 Random question</button><button class="btn btn-light" ${gs.question ? "" : "disabled"} onclick="groupToggleAnswer()">${gs.showAnswer ? "Hide answer" : "Show answer"}</button></div>
    </div></div>

    <div class="card" style="padding:16px;margin-top:16px;text-align:center">
      <div class="wheel-wrap"><div class="wheel-pointer"></div><canvas id="wheel" aria-label="Spin wheel"></canvas><button class="spin-btn" onclick="groupSpin()" ${gs.spinning ? "disabled" : ""}>SPIN</button></div>
      <div id="spinStatus" style="font-weight:800;color:var(--deep);min-height:26px;margin-top:8px">${picked ? `🎯 ${esc(picked.name)}, it’s your turn!` : g.members.length ? "Spin the wheel to pick a student" : "Add students and spin!"}</div>
      ${picked ? `<div class="row-wrap" style="justify-content:center;margin-top:8px"><button class="btn btn-primary" onclick="groupMark(${RIGHT})">✓ Correct (+${RIGHT})</button><button class="btn btn-danger" onclick="groupMark(${WRONG})">✗ Wrong (${WRONG})</button><button class="btn btn-light" onclick="groupMark(0)">Skip</button></div>` : ""}
      <label class="row small" style="justify-content:center;margin-top:12px"><input type="checkbox" ${g.safeMode ? "checked" : ""} onchange="groupSafeMode(this.checked)"> Students who answer correctly become safe and leave the wheel</label>
    </div>

    <div class="card" style="padding:16px;margin-top:16px"><div class="stack">
      <h3 style="margin:0">Members</h3>
      <div class="row"><input id="memberName" class="input" placeholder="Enter student name" onkeydown="if(event.key==='Enter')groupAddMember()"><button class="btn btn-primary" onclick="groupAddMember()">Add</button></div>
      <textarea id="memberList" class="textarea" style="min-height:70px" placeholder="Or paste several names, one per line"></textarea>
      <button class="btn btn-light" onclick="groupAddList()">Add list</button>
      ${g.members.map(m => `<div class="member ${m.safe ? "safe" : ""}"><span>${esc(m.name)} ${m.safe ? '<span class="chip ok">safe</span>' : ""}</span><button class="btn btn-danger btn-small" onclick="groupRemoveMember('${m.id}')" aria-label="Remove ${esc(m.name)}">Remove</button></div>`).join("")}
      <div class="row-wrap"><button class="btn btn-outline btn-small" onclick="groupResetRound()">New round</button><button class="btn btn-light btn-small" onclick="groupResetScores()">Reset scores</button></div>
    </div></div>

    <div class="card" style="padding:16px;margin-top:16px"><div class="stack"><h3 style="margin:0">🏆 Leaderboard</h3>
      ${board.length ? board.map((m, i) => `<div class="board-row"><b>${i + 1}</b><span>${esc(m.name)}</span><b class="${m.score < 0 ? "wrong" : ""}">${m.score}</b></div>`).join("") : `<div class="empty">The leaderboard appears after students are added.</div>`}</div></div>
    <button class="btn btn-danger" style="width:100%;margin-top:16px" onclick="groupDelete()">Delete group</button>`);
};

afterRender.push(drawWheel);
expose({ addGroup, openGroup, groupDelete: deleteGroup, groupAddMember: addMember, groupAddList: addMemberList, groupRemoveMember: removeMember,
  groupResetRound: resetRound, groupResetScores: resetScores, groupSetSet: setSet, groupSafeMode: setSafeMode, groupRandomQ: randomQuestion,
  groupToggleAnswer: toggleAnswer, groupMark: mark, groupSpin: spin });
