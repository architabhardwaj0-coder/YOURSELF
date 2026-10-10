// Yourself — main entry. Pages: auth, home, account, sets, tools (pronunciation/concept/vocabulary/translation), recap, improve.
import { state, pages, $, uid, esc, toast, go, render, expose, shuffle, getUsers, saveUsers, currentUser, saveCurrentUser, SESSION_KEY, shell } from "./core.js";
import { askAI, parseJSON, aiAvailable, errorHTML, errorText } from "./ai.js";
import { readFile, validateFile } from "./docreader.js";
import { parseDocument } from "./parser.js";
import "./docs.js";
import "./groups.js";

/* ================= AUTH =================
   Static-site prototype: accounts live in this browser's localStorage. Passwords are salted + PBKDF2-hashed.
   For real cross-device accounts use a backend (see README → Limitations). */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function pbkdf2(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256));
}
const legacySha = async v => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const needCrypto = () => { if (!window.crypto?.subtle) { toast("Secure sign-in needs HTTPS or localhost."); return false; } return true; };

async function signup() {
  if (!needCrypto()) return;
  const username = $("suUser").value.trim(), email = $("suEmail").value.trim().toLowerCase(), password = $("suPass").value, confirm = $("suConfirm").value;
  if (!username || !email || !password || !confirm) return toast("Please complete all fields.");
  if (password !== confirm) return toast("Passwords do not match.");
  if (password.length < 6) return toast("Password must be at least 6 characters.");
  const users = getUsers();
  if (users[username]) return toast("That username is already registered. Please sign in.");
  if (Object.values(users).some(u => u.email === email)) return toast("That email is already registered.");
  const salt = newSalt();
  users[username] = { username, email, salt, passwordHash: await pbkdf2(password, salt), avatar: "", sets: [], pronunciation: [], vocabulary: [], translation: [], recapHistory: [], documents: [], groups: [], createdAt: new Date().toISOString() };
  if (!saveUsers(users)) return;
  localStorage.setItem(SESSION_KEY, username); toast("Account created."); go("home");
}
async function signin() {
  if (!needCrypto()) return;
  const username = $("siUser").value.trim(), password = $("siPass").value, users = getUsers(), user = users[username];
  if (!user) return toast("Username or password is incorrect.");
  let ok;
  if (user.salt) ok = (await pbkdf2(password, user.salt)) === user.passwordHash;
  else if ((ok = (await legacySha(password)) === user.passwordHash)) { user.salt = newSalt(); user.passwordHash = await pbkdf2(password, user.salt); saveUsers(users); } // upgrade old accounts
  if (!ok) return toast("Username or password is incorrect.");
  localStorage.setItem(SESSION_KEY, username); toast("Signed in successfully."); go("home");
}
function logout() { localStorage.removeItem(SESSION_KEY); go("landing"); }
function togglePassword(id, btn) { const el = $(id); el.type = el.type === "password" ? "text" : "password"; btn.setAttribute("aria-pressed", el.type !== "password"); }

pages.landing = () => `<div class="auth-wrap"><div class="auth"><div class="auth-brand">YOURSELF</div>
  <p style="text-align:center;color:#737b8c;line-height:1.55">Test yourself without needing anyone to ask you questions.</p>
  <div class="row" style="justify-content:center;margin-top:35px;gap:40px"><button class="btn btn-outline" onclick="go('signup')">Sign Up</button><button class="btn btn-outline" onclick="go('signin')">Sign In</button></div></div></div>`;
const pwField = (id, label, auto) => `<div><label class="field-label" for="${id}">${label}</label><div class="password-wrap"><input id="${id}" class="input" type="password" autocomplete="${auto}"><button class="eye" type="button" onclick="togglePassword('${id}',this)" aria-label="Show or hide password">◉</button></div></div>`;
pages.signup = () => `<div class="auth-wrap"><div class="auth"><div class="auth-brand">Yourself</div><h1 class="auth-title">Sign Up</h1><div class="stack">
  <div><label class="field-label" for="suUser">Username</label><input id="suUser" class="input" autocomplete="username"></div>
  <div><label class="field-label" for="suEmail">Email</label><input id="suEmail" class="input" type="email" autocomplete="email"></div>
  ${pwField("suPass", "Password", "new-password")}${pwField("suConfirm", "Confirm Password", "new-password")}
  <button class="btn btn-dark" onclick="signup()">Sign Up</button></div>
  <div class="auth-links">Already have an account? <button onclick="go('signin')">Sign In</button></div></div></div>`;
pages.signin = () => `<div class="auth-wrap"><div class="auth"><div class="auth-brand">Yourself</div><h1 class="auth-title">Sign In</h1><div class="stack">
  <div><label class="field-label" for="siUser">Username</label><input id="siUser" class="input" autocomplete="username"></div>
  ${pwField("siPass", "Password", "current-password")}<button class="btn btn-dark" onclick="signin()">Sign In</button></div>
  <div class="auth-links">New here? <button onclick="go('signup')">Sign Up</button></div></div></div>`;

/* ================= HOME / ACCOUNT ================= */
pages.home = () => shell(`
  <section class="hero"><div><h1>Hey there! 👋</h1><p>Small steps make big progress<br>Keep going! 💙</p></div><div class="hero-art">💡📚</div></section>
  <section class="feature-grid">
    <button class="feature blue" onclick="go('pronunciation')"><span class="feature-icon">📣</span><span>Pronunciation</span></button>
    <button class="feature purple" onclick="go('concept')"><span class="feature-icon">💡</span><span>Concept</span></button>
    <button class="feature mint" onclick="go('vocabulary')"><span class="feature-icon">📖</span><span>Vocabulary</span></button>
    <button class="feature peach" onclick="go('translation')"><span class="feature-icon">🔤</span><span>Translation</span></button>
    <button class="feature blue" onclick="go('docs')"><span class="feature-icon">📄</span><span>Documents</span></button>
    <button class="feature mint" onclick="go('groups')"><span class="feature-icon">🎡</span><span>Group Spin</span></button>
  </section>
  <section class="bottom-promo"><div class="promo-text">Better<br>Learning<br>Brighter Future ✦</div><div class="promo-art">✏️📚🛩️</div></section>`);

pages.account = () => {
  const u = currentUser();
  return shell(`<div class="page-title">Account</div><div class="profile-card card">
    <div class="row"><div class="avatar-big">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : "👤"}</div><div><h2 style="margin:0">${esc(u.username)}</h2><div class="muted small">Profile</div></div></div><hr>
    <label class="field-label" for="avatarInput">Profile Photo</label><input id="avatarInput" class="input" type="file" accept="image/*" onchange="updateAvatar(this)">
    <div class="stack" style="margin-top:16px"><div><label class="field-label">Username</label><input class="input" value="${esc(u.username)}" readonly></div>
      <div><label class="field-label">Email</label><input class="input" value="${esc(u.email)}" readonly></div></div>
    <div class="settings-panel"><div class="row-between"><b>AI status</b><span class="language-pill">Secure backend</span></div>
      <p class="small muted">AI runs through a backend that holds the Gemini key. You never enter a key here.</p>
      ${aiAvailable() ? `<div class="row-wrap"><button class="btn btn-light btn-small" onclick="testAI()">Test AI connection</button><span id="aiTest" class="small muted"></span></div>` : `<div class="notice warn">Not connected. Set <b>AI_ENDPOINT</b> (see README).</div>`}</div>
    <button class="btn btn-danger" style="width:100%;margin-top:18px" onclick="logout()">Log Out</button></div>`);
};
async function testAI() {
  const el = $("aiTest"); el.textContent = "Testing…";
  try { await askAI("Reply with the single word: OK"); el.textContent = "✓ Connected"; } catch (e) { el.textContent = "✗ " + errorText(e); }
}
function updateAvatar(input) {
  const file = input.files?.[0]; if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Please select an image.");
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement("canvas"), k = Math.min(1, 256 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); const u = currentUser(); u.avatar = c.toDataURL("image/jpeg", 0.85);
    if (saveCurrentUser(u)) { render(); toast("Profile photo updated."); }
  };
  img.onerror = () => toast("That image could not be read.");
  img.src = url;
}

/* ================= QUESTION SETS ================= */
const selectedSet = () => currentUser()?.sets.find(s => s.id === state.selectedSetId);
pages.sets = () => {
  const u = currentUser();
  return shell(`<div class="page-title">Question Set</div>
    <div class="set-form"><label class="field-label" for="newSetName">Name of Set</label><div class="row"><input id="newSetName" class="input" placeholder="Add Set Name"><button class="btn btn-primary" onclick="addSet()">Add</button></div></div>
    <div class="row-between"><h2 style="margin:0 0 12px">Saved Sets</h2><span class="small muted">${u.sets.length} set(s)</span></div>
    <div class="set-list">${u.sets.length ? u.sets.map(s => `<button class="set-item" onclick="go('setDetail',{selectedSetId:'${s.id}'})"><span>${esc(s.name)}<br><small>${s.questions.length} question(s)</small></span><span class="arrow">›</span></button>`).join("") : `<div class="empty">No question sets yet. Add your first set above.</div>`}</div>`);
};
function addSet() {
  const name = $("newSetName").value.trim(); if (!name) return toast("Enter a set name.");
  const u = currentUser(); if (u.sets.some(s => s.name.toLowerCase() === name.toLowerCase())) return toast("A set with that name already exists.");
  u.sets.push({ id: uid("set"), name, questions: [] }); if (saveCurrentUser(u)) { go("sets"); toast("Question set created."); }
}
let lastAttachment = null;
pages.setDetail = () => {
  const s = selectedSet(); if (!s) return shell(`<div class="empty">Set not found.</div>`);
  return shell(`<button class="back" onclick="go('sets')">← Back</button><div class="page-title">${esc(s.name)}</div>
    <div class="card" style="padding:17px"><div class="stack">
      <div><label class="field-label" for="qInput">Add the Question</label><textarea id="qInput" class="textarea"></textarea></div>
      <div><label class="field-label" for="aInput">Add the Answer</label><textarea id="aInput" class="textarea"></textarea></div>
      <button class="btn btn-primary" onclick="saveQuestion()">Save Question</button></div><hr>
      <b>Add Attachments</b> <span class="small muted">(text is read automatically)</span>
      <div class="attach-row" style="margin-top:10px">
        <label class="attach">🖼️<br>Gallery<input type="file" accept="image/jpeg,image/png,image/webp" onchange="processAttachment(this)"></label>
        <label class="attach">📷<br>Camera<input type="file" accept="image/*" capture="environment" onchange="processAttachment(this)"></label>
        <label class="attach">📄<br>PDF<input type="file" accept="application/pdf" onchange="processAttachment(this)"></label></div>
      <div id="attachmentArea" style="margin-top:12px"></div>
      <p class="small muted">For whole papers with many questions, use <a href="#" onclick="go('docs');return false">Documents</a>.</p></div>
    <div style="margin-top:18px" class="stack"><div class="row-between"><h3 style="margin:0">Questions</h3><span class="small muted">${s.questions.length}</span></div>
      ${s.questions.length ? s.questions.map((q, i) => `<div class="file-box"><div class="row-between"><b>Question ${i + 1}</b><button class="btn btn-danger btn-small" onclick="deleteQuestion('${s.id}','${q.id}')">Delete</button></div>
        <p class="output"><b>Q:</b> ${esc(q.question)}</p><p class="output"><b>A:</b> ${esc(q.answer)}</p>${q.sourceText ? `<details><summary>Extracted text</summary><div class="extracted">${esc(q.sourceText)}</div></details>` : ""}</div>`).join("") : `<div class="empty">No questions saved yet.</div>`}</div>`);
};
function saveQuestion() {
  const q = $("qInput")?.value.trim(), a = $("aInput")?.value.trim();
  if (!q || !a) return toast("Add both question and answer.");
  const u = currentUser(), s = u.sets.find(x => x.id === state.selectedSetId); if (!s) return toast("Question Set not found. Please open the set again.");
  s.questions.push({ id: uid("q"), question: q, answer: a, sourceText: lastAttachment?.text || "", attachment: lastAttachment ? { name: lastAttachment.name, type: lastAttachment.type } : null, createdAt: new Date().toISOString() });
  if (!saveCurrentUser(u)) return;
  lastAttachment = null; toast("Question saved successfully."); render();
}
function deleteQuestion(setId, qid) { const u = currentUser(), s = u.sets.find(x => x.id === setId); if (!s) return; s.questions = s.questions.filter(q => q.id !== qid); saveCurrentUser(u); render(); toast("Question deleted."); }

/** Shared reader for Set + Concept attachments. Returns text or throws. */
async function readToText(file, area) {
  const bad = validateFile(file); if (bad) throw new Error(bad);
  const res = await readFile(file, { onStatus: m => { const n = area.querySelector(".notice"); if (n) n.textContent = m; } });
  return { res, text: res.pages.map(p => p.text).join("\n\n").trim() };
}
async function processAttachment(input) {
  const file = input.files?.[0]; input.value = ""; if (!file) return;
  const area = $("attachmentArea"); area.innerHTML = `<div class="notice">Reading <b>${esc(file.name)}</b>…</div>`;
  try {
    const { res, text } = await readToText(file, area);
    lastAttachment = { name: file.name, type: res.kind, text };
    area.innerHTML = `<div class="file-box"><b>${esc(file.name)}</b> <span class="chip ${text ? "ok" : "warn"}">${text ? "read" : "no text found"}</span>
      ${res.pages[0].image ? `<img class="file-preview" src="${res.pages[0].image}" alt="Preview">` : ""}
      ${res.warnings.map(w => `<div class="notice warn" style="margin-top:6px">⚠ ${esc(w)}</div>`).join("")}
      <div class="extracted">${esc(text || "No readable text detected. Type the question manually or upload a clearer file.")}</div>
      ${text ? `<button class="btn btn-primary btn-small" style="margin-top:10px" onclick="useExtractedText()">Use extracted text as question</button>` : ""}</div>`;
    if (text) toast(`Read ${parseDocument(res.pages).questions.length || "the"} question text successfully.`);
  } catch (e) { lastAttachment = null; area.innerHTML = `<div class="notice error">${esc(e.message)} You can still type the question manually.</div>`; }
}
function useExtractedText() { if (lastAttachment?.text && $("qInput")) { $("qInput").value = lastAttachment.text; toast("Extracted text placed in the Question field."); } }

/* ================= PRONUNCIATION ================= */
pages.pronunciation = () => shell(`<div class="page-title">Pronunciation</div>
  <div class="tool-input-row"><input id="pronInput" class="input" aria-label="Word" placeholder="Type or speak a word"><button class="icon-btn" onclick="startSpeech()" aria-label="Speak">🎙️</button></div>
  <div class="result-card"><div id="pronResult">Your typed or spoken word will appear here.</div><button class="icon-btn" style="margin-top:10px" onclick="speakPronunciation()" aria-label="Listen">🔊</button></div>
  <div class="action-row"><button class="square-action" onclick="savePronunciation()">🔖<br>Save</button><button class="square-action delete" onclick="deletePronunciation()">🗑️<br>Delete</button></div>`);
async function startSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast("Speech recognition is not supported in this browser. Try Chrome or Edge over HTTPS.");
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); }
  catch { return toast("Microphone permission is blocked. Allow the microphone for this site and try again."); }
  const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
  rec.onstart = () => toast("Listening… speak now");
  rec.onresult = e => { let t = ""; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; if ($("pronInput")) $("pronInput").value = t.trim(); if ($("pronResult")) $("pronResult").textContent = t.trim() || "Listening…"; };
  rec.onerror = e => toast(e.error === "not-allowed" ? "Microphone permission was denied." : e.error === "no-speech" ? "No speech detected. Tap the mic and speak clearly." : "Microphone recognition failed.");
  try { rec.start(); } catch { toast("Could not start the microphone."); }
}
function speakPronunciation() { const t = $("pronInput")?.value.trim(); if (!t) return toast("Enter a word first."); speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); }
function savePronunciation() { const t = $("pronInput").value.trim(); if (!t) return toast("Enter a word first."); const u = currentUser(); u.pronunciation.push({ id: uid("p"), text: t }); if (saveCurrentUser(u)) toast("Pronunciation saved."); }
function deletePronunciation() { $("pronInput").value = ""; $("pronResult").textContent = "Your typed or spoken word will appear here."; toast("Cleared."); }

/* ================= CONCEPT ================= */
pages.concept = () => shell(`<div class="tool-header"><div class="page-title" style="margin:20px 0">Concept</div>
  <div class="dropdown"><button class="btn btn-light btn-small" onclick="toggleMenu('conceptLangMenu')">${esc(state.conceptLanguage)} ▾</button>
    <div id="conceptLangMenu" class="dropdown-menu hidden"><button onclick="setConceptLang('English')">English</button><button onclick="setConceptLang('Hindi')">Hindi</button><button onclick="setConceptLang('Hinglish')">Hinglish</button></div></div></div>
  <div class="camera-wrap"><textarea id="conceptInput" class="textarea" aria-label="Concept or question" style="padding-right:55px;min-height:105px"></textarea>
    <button class="icon-btn" style="position:absolute;right:8px;top:8px" onclick="toggleMenu('conceptCameraMenu')" aria-label="Attach">📷</button>
    <div id="conceptCameraMenu" class="camera-menu hidden"><button onclick="triggerHiddenFile('conceptCameraInput')">📷 On-the-spot Photo Capture</button><button onclick="triggerHiddenFile('conceptGalleryInput')">🖼️ Upload Image from Gallery</button><button onclick="triggerHiddenFile('conceptPdfInput')">📄 Upload PDF File</button></div></div>
  <input id="conceptCameraInput" class="hidden" type="file" accept="image/*" capture="environment" onchange="conceptAttachment(this)">
  <input id="conceptGalleryInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" onchange="conceptAttachment(this)">
  <input id="conceptPdfInput" class="hidden" type="file" accept="application/pdf" onchange="conceptAttachment(this)">
  <div id="conceptFileArea" style="margin-top:10px"></div>
  <div class="action-row"><button class="btn btn-primary" onclick="askConcept()">DONE — EXPLAIN</button></div>
  <div id="conceptOutput" class="ai-box ai-response"><div class="ai-title">Explanation</div><div class="muted">Your answer will appear here after you click DONE — EXPLAIN.</div></div>`);
let conceptImages = [];
async function conceptAttachment(input) {
  const file = input.files?.[0]; input.value = ""; if (!file) return;
  $("conceptCameraMenu")?.classList.add("hidden");
  const area = $("conceptFileArea"); area.innerHTML = `<div class="notice">Reading <b>${esc(file.name)}</b>…</div>`;
  try {
    const { res, text } = await readToText(file, area);
    conceptImages = res.pages.slice(0, 3).map(p => p.image).filter(Boolean);
    area.innerHTML = `<div class="file-box"><b>${esc(file.name)}</b> ${res.pages[0].image ? `<img class="file-preview" src="${res.pages[0].image}" alt="Preview">` : ""}${res.warnings.map(w => `<div class="notice warn">⚠ ${esc(w)}</div>`).join("")}<div class="extracted">${esc(text || "No readable text detected.")}</div></div>`;
    $("conceptInput").value = text; toast(text ? "File read. Review the text, then press Explain." : "No text found. The AI can still look at the picture when you press Explain.");
  } catch (e) { conceptImages = []; area.innerHTML = `<div class="notice error">${esc(e.message)}</div>`; }
}
async function askConcept() {
  const text = $("conceptInput").value.trim();
  if (!text && !conceptImages.length) return toast("Enter or upload a concept/question.");
  const out = $("conceptOutput"); out.innerHTML = `<div class="ai-title">Explanation</div><div class="muted">AI is thinking…</div>`;
  try {
    const prompt = `You are the AI tutor inside an educational app called Yourself. Explain the following user input in ${state.conceptLanguage}. It may be mathematics, reasoning, science, history, English, a paragraph, a diagram, or any study question. Give a clear answer, then a step-by-step explanation, simple example(s), and important points. If it is a question, solve it. If the input is ambiguous, state the assumption briefly. If page images are attached they are authoritative over the text.\nUser input:\n${text || "(see attached image)"}`;
    const ans = await askAI(prompt, { images: conceptImages.map(d => ({ mime: "image/jpeg", data: d.split(",")[1] })) });
    out.innerHTML = `<div class="ai-title">Explanation · ${esc(state.conceptLanguage)}</div><div class="output">${esc(ans)}</div>`;
  } catch (e) { out.innerHTML = errorHTML(e); }
}

/* ================= VOCABULARY ================= */
pages.vocabulary = () => shell(`<div class="tool-header"><div class="page-title" style="margin:20px 0">Vocabulary</div>
  <div class="dropdown"><button class="btn btn-outline btn-small" onclick="toggleMenu('vocabAddMenu')">＋ Add</button>
    <div id="vocabAddMenu" class="dropdown-menu hidden"><button onclick="openVocabAdd()">Add Word &amp; Meaning</button><button onclick="openVocabRequest()">Ask AI for Words</button></div></div></div>
  <div id="vocabWorkspace" class="stack"><div class="ai-box"><div class="ai-title">Ask for vocabulary</div>
    <p class="small muted">Example: “Give me 30 advanced GRE words” or “Give me 20 daily food and cooking words.”</p>
    <div class="chat-row"><input id="vocabRequest" class="input" aria-label="Vocabulary request"><button class="btn btn-primary" onclick="generateVocabulary()">Get Words</button></div></div>
    <div class="notice">AI stays focused on English vocabulary: meanings, synonyms, antonyms, usage, pronunciation, roots and examples.</div></div>`);
function openVocabAdd() {
  $("vocabAddMenu").classList.add("hidden");
  $("vocabWorkspace").innerHTML = `<div class="card" style="padding:17px"><div class="stack">
    <div><label class="field-label" for="vWord">Word</label><input id="vWord" class="input"></div>
    <div><label class="field-label" for="vMeaning">Meaning</label><textarea id="vMeaning" class="textarea"></textarea></div>
    <div><label class="field-label" for="vExample">Example</label><textarea id="vExample" class="textarea"></textarea></div>
    <div class="row"><button class="btn btn-primary" onclick="saveVocabulary('save')">Save</button><button class="btn btn-outline" onclick="saveVocabulary('saveas')">Save As</button></div></div></div>`;
}
function openVocabRequest() { $("vocabAddMenu").classList.add("hidden"); go("vocabulary"); }
async function generateVocabulary() {
  const request = $("vocabRequest").value.trim(); if (!request) return toast("Tell AI what vocabulary you want.");
  $("vocabAI")?.remove();
  $("vocabWorkspace").insertAdjacentHTML("beforeend", `<div id="vocabAI" class="ai-box"><div class="muted">Generating vocabulary…</div></div>`);
  try {
    const ans = await askAI(`You are an English vocabulary tutor. User asks: ${request}. Give only English-vocabulary learning material. If they request a specific number of words, provide exactly that number. For each word include: the word, pronunciation, simple English meaning, Hinglish meaning, 2 synonyms, 1 antonym where natural, one example sentence, and a short root/prefix/suffix note when useful. Keep it practical and study-friendly.`);
    $("vocabAI").innerHTML = `<div class="ai-title">AI Vocabulary</div><div class="output">${esc(ans)}</div>`;
  } catch (e) { $("vocabAI").innerHTML = errorHTML(e); }
}
function saveVocabulary(type) {
  const w = $("vWord").value.trim(), m = $("vMeaning").value.trim(), ex = $("vExample").value.trim();
  if (!w || !m) return toast("Add the word and meaning.");
  const u = currentUser(), item = { id: uid("v"), word: w, meaning: m, example: ex }; u.vocabulary.push(item);
  if (!saveCurrentUser(u)) return;
  if (type !== "saveas") return toast("Vocabulary saved.");
  $("vocabWorkspace").insertAdjacentHTML("beforeend", `<div class="card" style="padding:16px"><b>Save As Question Set</b><div class="stack" style="margin-top:10px">${u.sets.length ? u.sets.map(s => `<button class="set-item" onclick="saveVocabToSet('${s.id}','${item.id}')">${esc(s.name)} <span>›</span></button>`).join("") : `<div class="empty">Create a Question Set first.</div>`}</div></div>`);
}
function saveVocabToSet(setId, itemId) {
  const u = currentUser(), s = u.sets.find(x => x.id === setId), v = u.vocabulary.find(x => x.id === itemId); if (!s || !v) return;
  s.questions.push({ id: uid("q"), question: v.word, answer: v.meaning + (v.example ? `\nExample: ${v.example}` : ""), sourceText: "", attachment: null });
  if (saveCurrentUser(u)) { toast("Saved to Question Set."); go("sets"); }
}

/* ================= TRANSLATION ================= */
const langOpts = cur => ["English", "Hindi", "Hinglish"].map(l => `<option ${l === cur ? "selected" : ""}>${l}</option>`).join("");
pages.translation = () => shell(`<div class="page-title">Translation</div>
  <div class="row" style="margin-bottom:12px"><select id="transFrom" class="select" aria-label="From" onchange="state.translationFrom=this.value">${langOpts(state.translationFrom)}</select><span>→</span>
  <select id="transTo" class="select" aria-label="To" onchange="state.translationTo=this.value">${langOpts(state.translationTo)}</select></div>
  <textarea id="transInput" class="textarea" aria-label="Text to translate"></textarea>
  <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="translateText()">TRANSLATE</button>
  <div id="transOutput" class="result-card"><div class="muted">Translation will appear here.</div></div>`);
async function translateText() {
  const text = $("transInput").value.trim(); if (!text) return toast("Enter text to translate.");
  const out = $("transOutput"); out.innerHTML = "<div class='muted'>Translating…</div>";
  try {
    const ans = await askAI(`Translate the following text from ${state.translationFrom} to ${state.translationTo}. Preserve the meaning and tone. If the target is Hinglish, write natural Roman Hindi mixed with English. Return the translation first, then a very short note only if needed.\nText:\n${text}`);
    out.innerHTML = `<div class="output">${esc(ans)}</div>`;
  } catch (e) { out.innerHTML = errorHTML(e); }
}

/* ================= RECAP ================= */
pages.recapSets = () => { const u = currentUser();
  return shell(`<button class="back" onclick="go('home')">← Back</button><div class="recap-line">Let's recap with Yourself</div><div class="recap-small">Recap</div>
    <div class="set-list">${u.sets.length ? u.sets.map(s => `<button class="set-item" onclick="go('recapMode',{selectedSetId:'${s.id}'})"><span>${esc(s.name)}</span><span class="arrow">›</span></button>`).join("") : `<div class="empty">Your saved Question Sets will appear here.</div>`}</div>`); };
pages.recapMode = () => { const s = selectedSet();
  return shell(`<button class="back" onclick="go('recapSets')">← Back</button><div class="page-title">${esc(s?.name || "Recap")}</div>
    <div class="card" style="padding:16px"><div class="row" style="justify-content:center"><button class="btn btn-primary" onclick="startRecap('individual')">Individual</button><button class="btn btn-light" onclick="startRecap('group')">Group</button></div></div>`); };
async function startRecap(mode) {
  const s = selectedSet(); if (!s || !s.questions.length) return toast("Add questions to this set first.");
  state.recapMode = mode;
  let order = s.questions.map((_, i) => i); if (mode === "group") order = shuffle(order);
  if (state.recapCondition) {
    try {
      const list = s.questions.map((q, i) => `${i}: ${q.question.slice(0, 140)}`).join("\n");
      const r = parseJSON(await askAI(`A student wants to practise a subset of their questions. Condition: "${state.recapCondition}". Choose the matching question indexes and order them as the condition asks (default: keep original order). Return JSON only: {"indices":[0,1]}. If none match return {"indices":[]}.\nQuestions:\n${list}`, { json: true }));
      const idx = [...new Set((r.indices || []).map(Number))].filter(i => Number.isInteger(i) && i >= 0 && i < s.questions.length);
      if (!idx.length) return toast("No questions match that condition. Remove or change it.");
      order = idx;
    } catch (e) { return toast("Condition could not be applied: " + errorText(e)); }
  }
  Object.assign(state, { recapOrder: order, recapIndex: 0, recapAnswerVisible: false, recapLastResult: null }); go("recap");
}
const curQ = () => { const s = selectedSet(); return s && state.recapOrder.length ? s.questions[state.recapOrder[state.recapIndex]] : null; };
pages.recap = () => {
  const s = selectedSet(), q = curQ(); if (!s || !q) return shell(`<div class="empty">No recap question available.</div>`);
  const r = state.recapLastResult;
  return shell(`<button class="back" onclick="go('recapMode')">← Back</button><div class="recap-title">${esc(s.name)} Recap</div>
    <div class="control-row"><div class="row"><button class="btn btn-primary btn-small" onclick="startRecap('${state.recapMode || "individual"}')">START</button>
      <div class="dropdown"><button class="btn btn-light btn-small" onclick="toggleMenu('conditionMenu')">Condition</button>
        <div id="conditionMenu" class="dropdown-menu hidden" style="right:auto;left:0;width:300px;padding:10px"><textarea id="conditionInput" class="textarea" style="min-height:80px" placeholder="Describe how questions should be selected or asked">${esc(state.recapCondition)}</textarea>
          <button class="btn btn-primary btn-small" style="margin-top:7px" onclick="saveCondition()">Add Condition</button> <button class="btn btn-danger btn-small" style="margin-top:7px" onclick="removeCondition()">Remove Condition</button></div></div></div>
      <span class="small muted">${state.recapCondition ? `Condition: ${esc(state.recapCondition)} (applies on START)` : "No condition"}</span></div>
    <div class="control-row"><div class="mode-box"><button class="${state.recapMode === "group" ? "active" : ""}" onclick="setRecapMode('group')">Random</button><button class="${state.recapMode === "individual" ? "active" : ""}" onclick="setRecapMode('individual')">Series</button></div>
      <button class="btn btn-outline" onclick="toggleRecapAnswer()">${state.recapAnswerVisible ? "HIDE" : "UNHIDE"}</button></div>
    <div class="question-card"><div class="row-between"><span class="user-chip">User: ${esc(currentUser().username)}</span><span class="small muted">Question ${state.recapIndex + 1}/${state.recapOrder.length}</span></div>
      <p class="question-text output">${esc(q.question)}</p>
      <div class="answer-area"><label class="field-label" for="recapUserAnswer">Your Answer</label><textarea id="recapUserAnswer" class="textarea" placeholder="Write your answer here"></textarea>
        <button class="btn btn-primary" style="margin-top:9px" onclick="submitRecapAnswer()">DONE — SUBMIT ANSWER</button></div>
      ${state.recapAnswerVisible ? `<div class="notice" style="margin-top:12px"><b>Correct Answer:</b><br><span class="output">${esc(q.answer)}</span></div>` : ""}
      ${r ? `<div class="notice" style="margin-top:12px"><span class="${r.correct ? "correct" : "wrong"}"><b>${r.correct ? "Correct" : "Incorrect"}</b></span> · <span class="score">Score: ${r.score}</span><br>${esc(r.feedback || "")}</div>` : ""}</div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-light" onclick="nextRecapQuestion()">NEXT QUESTION</button></div>
    <div class="ai-box" style="margin-top:14px"><div class="ai-title">AI Condition Helper</div><div class="chat-row"><input id="conditionAIInput" class="input" aria-label="Ask AI for a condition" placeholder="Ask AI to create/refine a condition"><button class="btn btn-outline" onclick="askRecapConditionAI()">Ask AI</button></div><div id="conditionAIOutput" class="small muted" style="margin-top:9px"></div></div>`);
};
const saveCondition = () => { const v = $("conditionInput")?.value.trim(); if (!v) return toast("Write a condition first."); state.recapCondition = v; toast("Condition added. Press START to apply it."); render(); };
const removeCondition = () => { state.recapCondition = ""; toast("Condition removed."); render(); };
function setRecapMode(mode) {
  const s = selectedSet(); state.recapMode = mode; const o = s.questions.map((_, i) => i);
  Object.assign(state, { recapOrder: mode === "group" ? shuffle(o) : o, recapIndex: 0, recapLastResult: null, recapAnswerVisible: false }); render();
}
const toggleRecapAnswer = () => { state.recapAnswerVisible = !state.recapAnswerVisible; render(); };
async function submitRecapAnswer() {
  const answer = $("recapUserAnswer")?.value.trim(), q = curQ(); if (!answer) return toast("Write your answer before submitting.");
  try {
    const out = await askAI(`Act as a strict but helpful quiz evaluator. Compare the student's answer with the correct answer. Return JSON only: {"correct":true,"score":5,"feedback":"short explanation"}. Use score 5 for substantively correct and -5 for substantively incorrect; equivalent meaning counts as correct.\nQuestion: ${q.question}\nCorrect answer: ${q.answer}\nStudent answer: ${answer}`, { json: true });
    let r; try { r = parseJSON(out); } catch { r = { correct: false, score: 0, feedback: "The answer could not be graded automatically. Compare it with the correct answer." }; }
    r.correct = r.correct === true; r.score = Number(r.score) || (r.correct ? 5 : -5);
    state.recapLastResult = r; state.recapAnswerVisible = true;
    const u = currentUser(); u.recapHistory.push({ id: uid("rh"), setId: selectedSet().id, questionId: q.id, question: q.question, correctAnswer: q.answer, userAnswer: answer, correct: r.correct, score: r.score, feedback: r.feedback || "", time: new Date().toISOString() });
    saveCurrentUser(u); render();
  } catch (e) { toast(errorText(e)); }
}
function nextRecapQuestion() { if (state.recapIndex < state.recapOrder.length - 1) { state.recapIndex++; state.recapLastResult = null; state.recapAnswerVisible = false; render(); } else toast("This recap is complete."); }
async function askRecapConditionAI() {
  const text = $("conditionAIInput").value.trim(); if (!text) return toast("Tell AI what you want.");
  const out = $("conditionAIOutput"); out.textContent = "Thinking…";
  try {
    const ans = (await askAI(`Create a concise quiz-selection condition for a study recap. User request: ${text}. Return only one condition sentence that can be applied to the questions of a saved question set.`)).trim();
    window.__aiCondition = ans; out.innerHTML = `${esc(ans)} <button class="btn btn-light btn-small" style="margin-left:6px" onclick="useAICondition()">Use</button>`;
  } catch (e) { out.innerHTML = errorHTML(e); }
}
const useAICondition = () => { state.recapCondition = window.__aiCondition || ""; toast("AI condition added. Press START to apply it."); render(); };

/* ================= IMPROVE ================= */
pages.improve = () => {
  const u = currentUser(), wrong = u.recapHistory.filter(x => !x.correct), by = {}; wrong.forEach(x => (by[x.setId] ??= []).push(x));
  return shell(`<div class="page-title">Improve</div><p class="muted" style="text-align:center">Review the answers you got wrong in Recap and practise them again.</p>
    <div class="set-list" style="margin-top:18px">${u.sets.map(s => `<button class="set-item" onclick="showImproveSet('${s.id}')"><span>${esc(s.name)}<br><small>${(by[s.id] || []).length} incorrect</small></span><span>›</span></button>`).join("") || `<div class="empty">Your saved Question Sets will appear here.</div>`}</div>
    <div id="improveDetail" style="margin-top:16px"></div>`);
};
function showImproveSet(setId) {
  const wrong = currentUser().recapHistory.filter(x => x.setId === setId && !x.correct), box = $("improveDetail"); if (!box) return;
  box.innerHTML = wrong.length ? wrong.map((x, i) => `<div class="improve-item" style="margin-bottom:10px"><h3>Question ${i + 1}</h3><p class="output"><b>Question:</b> ${esc(x.question)}</p><p class="wrong output"><b>Your answer:</b> ${esc(x.userAnswer)}</p>
    <p class="correct output"><b>Correct answer:</b> ${esc(x.correctAnswer)}</p><p><b>Score:</b> ${x.score}</p><p class="muted">${esc(x.feedback)}</p><button class="btn btn-outline btn-small" onclick="askImproveAIByHistoryId('${x.id}')">Explain My Mistake with AI</button></div>`).join("") : `<div class="empty">No incorrect recap answers for this set yet.</div>`;
}
async function askImproveAIByHistoryId(id) {
  const h = currentUser().recapHistory.find(x => x.id === id); if (!h) return toast("Mistake record not found.");
  try {
    const ans = await askAI(`Explain this study mistake simply. Question: ${h.question}. Correct answer: ${h.correctAnswer}. The student answered: ${h.userAnswer}. Give the likely misconception, the correct reasoning, and one short practice tip.`);
    $("improveDetail").insertAdjacentHTML("afterbegin", `<div class="ai-box" style="margin-bottom:10px"><div class="ai-title">AI Explanation</div><div class="output">${esc(ans)}</div></div>`);
  } catch (e) { toast(errorText(e)); }
}

/* ================= wiring ================= */
const setConceptLang = l => { state.conceptLanguage = l; render(); };
const triggerHiddenFile = id => $(id)?.click();
expose({ state, signup, signin, logout, togglePassword, updateAvatar, testAI, addSet, saveQuestion, deleteQuestion, processAttachment, useExtractedText,
  startSpeech, speakPronunciation, savePronunciation, deletePronunciation, setConceptLang, triggerHiddenFile, conceptAttachment, askConcept,
  openVocabAdd, openVocabRequest, generateVocabulary, saveVocabulary, saveVocabToSet, translateText,
  startRecap, saveCondition, removeCondition, setRecapMode, toggleRecapAnswer, submitRecapAnswer, nextRecapQuestion, askRecapConditionAI, useAICondition,
  showImproveSet, askImproveAIByHistoryId });

state.page = currentUser() ? "home" : "landing";
render();
