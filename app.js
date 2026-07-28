const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

let news = [];
let releases = [];
let deferredPrompt = null;
let favorites = store.get("favoriteBands", ["Ozzy Osbourne", "Black Sabbath", "Dio", "Candlemass", "Judas Priest", "Iron Maiden"]);
let savedNewsIds = store.get("savedNews", []);
let savedReleaseIds = store.get("savedReleases", []);
let readNewsIds = store.get("readNews", []);
let settings = store.get("settings", { prioritizeFavorites: true, hideRead: false });

const escapeHtml = (s="") => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = (s="") => s.toLocaleLowerCase("no");
const newsId = item => item.id || btoa(unescape(encodeURIComponent(item.url || item.title))).slice(0, 24);
const releaseId = item => item.id || `${item.artist}|${item.title}|${item.releaseDate}`;
const dateText = value => {
  if (!value) return "Ukjent dato";
  const d = new Date(`${value.length === 10 ? value + "T12:00:00" : value}`);
  return Number.isNaN(d.valueOf()) ? value : new Intl.DateTimeFormat("no-NO", { day:"numeric", month:"short", year:"numeric" }).format(d);
};
const isFavoriteHit = item => favorites.some(b => normalize(`${item.title} ${item.artist || ""}`).includes(normalize(b)));

function setTab(name) {
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $$(".panel").forEach(p => p.classList.remove("active"));
  $(`#${name}Panel`).classList.add("active");
  if (name === "favorites") renderFavorites();
  scrollTo({ top: $(".tabs").offsetTop - 2, behavior: "smooth" });
}

function renderNews() {
  const q = normalize($("#newsSearch").value.trim());
  const source = $("#sourceFilter").value;
  let items = news.filter(n => (!q || normalize(`${n.title} ${n.summary || ""} ${n.artist || ""}`).includes(q)) && (!source || n.source === source));
  if (settings.hideRead) items = items.filter(n => !readNewsIds.includes(newsId(n)));
  if (settings.prioritizeFavorites) items.sort((a,b) => Number(isFavoriteHit(b)) - Number(isFavoriteHit(a)) || new Date(b.published) - new Date(a.published));
  $("#newsCount").textContent = `${items.length} saker`;
  $("#newsEmpty").classList.toggle("hidden", items.length > 0);
  $("#newsList").innerHTML = items.map(n => {
    const id = newsId(n), saved = savedNewsIds.includes(id), fav = isFavoriteHit(n);
    return `<article class="news-card ${fav ? "favorite-hit":""}">
      <div>
        <div class="meta"><span>${escapeHtml(n.source || "Ukjent kilde")}</span><span>•</span><time>${dateText(n.published)}</time>${fav ? "<span>• FAVORITT</span>":""}</div>
        <h4>${escapeHtml(n.title)}</h4>
        ${n.summary ? `<p>${escapeHtml(n.summary)}</p>` : ""}
        <a class="open-link" href="${encodeURI(n.url)}" target="_blank" rel="noopener" data-read="${id}">Les originalartikkel →</a>
      </div>
      <div class="card-actions"><button class="icon-button ${saved ? "saved":""}" data-save-news="${id}" title="Lagre">${saved ? "★":"☆"}</button></div>
    </article>`;
  }).join("");
}

function renderReleases() {
  const q = normalize($("#releaseSearch").value.trim());
  const period = $("#releasePeriod").value;
  const now = new Date(); now.setHours(0,0,0,0);
  const days = n => new Date(now.getTime() + n*86400000);
  const inPeriod = r => {
    const d = new Date(`${r.releaseDate}T12:00:00`);
    if (period === "past30") return d >= days(-30) && d <= now;
    if (period === "next30") return d >= now && d <= days(30);
    if (period === "next90") return d >= now && d <= days(90);
    return true;
  };
  const items = releases.filter(r => (!q || normalize(`${r.artist} ${r.title} ${r.genre || ""}`).includes(q)) && inPeriod(r))
    .sort((a,b) => (a.releaseDate || "").localeCompare(b.releaseDate || ""));
  $("#releaseCount").textContent = `${items.length} utgivelser`;
  $("#releaseEmpty").classList.toggle("hidden", items.length > 0);
  $("#releaseList").innerHTML = items.map(releaseCard).join("");
}

function releaseCard(r) {
  const id = releaseId(r), saved = savedReleaseIds.includes(id);
  return `<article class="release-card">
    <time class="release-date">${dateText(r.releaseDate)}</time>
    <h4>${escapeHtml(r.artist)}</h4>
    <p class="album">${escapeHtml(r.title)}</p>
    <div class="release-foot">
      <span class="badge">${escapeHtml(r.type || "Album")}${r.source ? ` · ${escapeHtml(r.source)}`:""}</span>
      <button class="icon-button ${saved ? "saved":""}" data-save-release="${escapeHtml(id)}" title="Hør senere">${saved ? "★":"☆"}</button>
    </div>
    ${r.url ? `<a class="open-link" href="${encodeURI(r.url)}" target="_blank" rel="noopener">Se utgivelsen →</a>`:""}
  </article>`;
}

function renderFavorites() {
  $("#favoriteBands").innerHTML = favorites.length ? favorites.map((b,i) => `<span class="chip">${escapeHtml(b)}<button data-remove-band="${i}" aria-label="Fjern">×</button></span>`).join("") : `<span class="muted">Ingen band lagt til.</span>`;
  const savedN = news.filter(n => savedNewsIds.includes(newsId(n)));
  $("#savedNews").innerHTML = savedN.length ? savedN.map(n => `<article class="news-card"><div><div class="meta">${escapeHtml(n.source || "")} · ${dateText(n.published)}</div><h4>${escapeHtml(n.title)}</h4><a class="open-link" href="${encodeURI(n.url)}" target="_blank" rel="noopener">Les →</a></div><div class="card-actions"><button class="icon-button saved" data-save-news="${newsId(n)}">★</button></div></article>`).join("") : `<p class="muted">Ingen lagrede saker.</p>`;
  const savedR = releases.filter(r => savedReleaseIds.includes(releaseId(r)));
  $("#savedReleases").innerHTML = savedR.length ? savedR.map(releaseCard).join("") : `<p class="muted">Ingen lagrede plater.</p>`;
}

async function loadData() {
  try {
    const stamp = Date.now();
    const [nRes, rRes, mRes] = await Promise.all([
      fetch(`./data/news.json?v=${stamp}`),
      fetch(`./data/releases.json?v=${stamp}`),
      fetch(`./data/meta.json?v=${stamp}`)
    ]);
    news = await nRes.json();
    releases = await rRes.json();
    const meta = await mRes.json();
    $("#lastUpdated").textContent = meta.updated ? new Intl.DateTimeFormat("no-NO", {dateStyle:"medium",timeStyle:"short"}).format(new Date(meta.updated)) : "Ukjent";
  } catch (err) {
    console.error(err);
    $("#lastUpdated").textContent = "Kunne ikke laste data";
  }
  populateSources(); renderNews(); renderReleases(); renderFavorites();
}

function populateSources() {
  const sources = [...new Set(news.map(n => n.source).filter(Boolean))].sort();
  $("#sourceFilter").innerHTML = `<option value="">Alle kilder</option>` + sources.map(s => `<option>${escapeHtml(s)}</option>`).join("");
}

document.addEventListener("click", e => {
  const tab = e.target.closest("[data-tab]"); if (tab) setTab(tab.dataset.tab);
  const n = e.target.closest("[data-save-news]");
  if (n) { const id=n.dataset.saveNews; savedNewsIds = savedNewsIds.includes(id) ? savedNewsIds.filter(x=>x!==id) : [...savedNewsIds,id]; store.set("savedNews",savedNewsIds); renderNews(); renderFavorites(); }
  const r = e.target.closest("[data-save-release]");
  if (r) { const id=r.dataset.saveRelease; savedReleaseIds = savedReleaseIds.includes(id) ? savedReleaseIds.filter(x=>x!==id) : [...savedReleaseIds,id]; store.set("savedReleases",savedReleaseIds); renderReleases(); renderFavorites(); }
  const rm = e.target.closest("[data-remove-band]");
  if (rm) { favorites.splice(Number(rm.dataset.removeBand),1); store.set("favoriteBands",favorites); renderFavorites(); renderNews(); }
  const read = e.target.closest("[data-read]");
  if (read && !readNewsIds.includes(read.dataset.read)) { readNewsIds.push(read.dataset.read); store.set("readNews",readNewsIds); }
});

$("#newsSearch").addEventListener("input", renderNews);
$("#sourceFilter").addEventListener("change", renderNews);
$("#releaseSearch").addEventListener("input", renderReleases);
$("#releasePeriod").addEventListener("change", renderReleases);
$("#favoriteBandForm").addEventListener("submit", e => {
  e.preventDefault(); const value=$("#favoriteBandInput").value.trim();
  if (value && !favorites.some(x => normalize(x) === normalize(value))) favorites.push(value);
  store.set("favoriteBands",favorites); $("#favoriteBandInput").value=""; renderFavorites(); renderNews();
});
$("#prioritizeFavorites").checked = settings.prioritizeFavorites;
$("#hideRead").checked = settings.hideRead;
$("#prioritizeFavorites").addEventListener("change", e => { settings.prioritizeFavorites=e.target.checked; store.set("settings",settings); renderNews(); });
$("#hideRead").addEventListener("change", e => { settings.hideRead=e.target.checked; store.set("settings",settings); renderNews(); });
$("#refreshBtn").addEventListener("click", loadData);
$("#clearBtn").addEventListener("click", () => {
  if (confirm("Slette alle lokale favoritter, lagrede saker og historikk?")) {
    ["favoriteBands","savedNews","savedReleases","readNews","settings"].forEach(k=>localStorage.removeItem(k)); location.reload();
  }
});
$("#todayLabel").textContent = new Intl.DateTimeFormat("no-NO", {weekday:"long",day:"numeric",month:"long"}).format(new Date());

window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt=e; $("#installBtn").classList.remove("hidden"); });
$("#installBtn").addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("#installBtn").classList.add("hidden"); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
loadData();
