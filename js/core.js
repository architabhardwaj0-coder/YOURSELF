// Shared state, storage, helpers and the page registry.
export const STORAGE_KEY = "yourself_users_v3";
export const SESSION_KEY = "yourself_session_v3";

export const state = {
  page: "landing", selectedSetId: null, selectedGroupId: null,
  recapMode: null, recapIndex: 0, recapOrder: [], recapAnswerVisible: false, recapLastResult: null, recapCondition: "",
  conceptLanguage: "English", translationFrom: "English", translationTo: "Hindi",
};
export const pages = {};
export const afterRender = [];

export const $ = id => document.getElementById(id);
export const uid = (p = "id") => p + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
export const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
export const expose = obj => Object.assign(window, obj);
export function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function toast(msg) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(window.__toast); window.__toast = setTimeout(() => t.classList.add("hidden"), 3600);
}

export function getUsers() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
export function saveUsers(users) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); return true; }
  catch { toast("Could not save: browser storage is full or blocked. Delete old documents and try again."); return false; }
}
export const currentUsername = () => localStorage.getItem(SESSION_KEY) || "";
export function currentUser() {
  const u = getUsers()[currentUsername()];
  if (!u) return null;
  for (const k of ["sets", "pronunciation", "vocabulary", "translation", "recapHistory", "documents", "groups"]) u[k] ??= [];
  return u;
}
export function saveCurrentUser(user) { const users = getUsers(); users[user.username] = user; return saveUsers(users); }

export function go(page, extra = {}) { state.page = page; Object.assign(state, extra); render(); window.scrollTo({ top: 0 }); }

export function render() {
  const publicPages = ["landing", "signup", "signin"];
  if (!publicPages.includes(state.page) && !currentUser()) state.page = "signin";
  $("app").innerHTML = (pages[state.page] || pages.home)();
  afterRender.forEach(f => f());
}

/* ---- common layout ---- */
export function topbar() {
  const u = currentUser();
  return `<header class="topbar">
    <button class="logo" style="border:0;background:none" onclick="go('home')"><span class="logo-y">Y</span><span>Yourself</span></button>
    <button class="profile-btn" onclick="go('account')" aria-label="Account">${u?.avatar ? `<img src="${esc(u.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">` : "👤"}</button>
  </header>`;
}
function navItem(page, icon, label) {
  const active = state.page === page || (["recapSets", "recapMode", "recap"].includes(state.page) && page === "recapSets");
  return `<button class="nav-item ${active ? "active" : ""}" onclick="go('${page}')"><span>${icon}</span><span>${label}</span></button>`;
}
export const shell = content => `<div class="screen">${topbar()}<main class="narrow">${content}</main>
  <nav class="bottom-nav">${navItem("home", "⌂", "Home")}${navItem("sets", "▣", "Question Set")}${navItem("recapSets", "⟳", "Recap")}${navItem("improve", "✧", "Improve")}</nav></div>`;

export function toggleMenu(id) { $(id)?.classList.toggle("hidden"); }
expose({ go, toggleMenu });
