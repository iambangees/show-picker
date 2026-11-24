"use strict";

/* ================= pure helpers (unit-tested in Node) ================= */
/*CORE-START*/
function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWords(text, max) {
  const t = String(text || "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function storyline(show, max) {
  return truncateWords(stripHtml(show && show.summary), max || 230);
}

function yearOf(show) {
  if (!show || !show.premiered) return "";
  return String(show.premiered).slice(0, 4);
}

function ratingOf(show) {
  const r = show && show.rating && show.rating.average;
  return typeof r === "number" ? r : null;
}

function isEligible(show) {
  return !!(show && show.id && show.name && show.image && show.image.medium && show.summary && stripHtml(show.summary).length > 30);
}

function dedupeById(shows) {
  const seen = new Set();
  const out = [];
  for (const s of shows || []) {
    if (s && s.id && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

function shuffle(arr, rnd) {
  const rand = rnd || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function keyOf(show) {
  return show && show.key ? show.key : "tv:" + (show && show.id);
}

function deckFromPool(pool, excludedIds, genre, rnd) {
  const ex = excludedIds || new Set();
  let c = (pool || []).filter(s => isEligible(s) && !ex.has(keyOf(s)));
  if (genre && genre !== "All") c = c.filter(s => (s.genres || []).indexOf(genre) !== -1);
  c.sort((a, b) => ((b.weight || 0) - (a.weight || 0)) || ((ratingOf(b) || 0) - (ratingOf(a) || 0)));
  return shuffle(c.slice(0, 140), rnd);
}

function seasonMap(episodes) {
  const map = {};
  for (const ep of episodes || []) {
    if (!ep || typeof ep.season !== "number" || ep.season < 1 || typeof ep.number !== "number") continue;
    if (!map[ep.season] || ep.number > map[ep.season]) map[ep.season] = ep.number;
  }
  return map;
}

function clampProgress(season, episode, map) {
  let s = Math.max(1, Math.floor(season) || 1);
  let e = Math.max(0, Math.floor(episode) || 0);
  if (map && Object.keys(map).length) {
    const seasons = Object.keys(map).map(Number);
    const maxSeason = Math.max.apply(null, seasons);
    if (s > maxSeason) s = maxSeason;
    const maxEp = map[s];
    if (typeof maxEp === "number" && e > maxEp) e = maxEp;
  }
  return { season: s, episode: e };
}

function progressText(entry) {
  if (!entry) return "";
  if (entry.status === "finished") return "Finished ✓";
  if (entry.status === "want") return "Not started yet";
  if (entry.media === "movie") return "In progress";
  if ((entry.episode || 0) > 0) return "Stopped at S" + entry.season + " · E" + entry.episode;
  return "Season " + entry.season + " · not started yet";
}

const TMDB_IMG = "https://image.tmdb.org/t/p/";
const TMDB_GENRES = { 28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western" };

function normalizeTmdbMovie(m) {
  if (!m || !m.id || !m.title) return null;
  return {
    id: "tm:" + m.id,
    key: "tm:" + m.id,
    _media: "movie",
    name: m.title,
    image: m.poster_path ? { medium: TMDB_IMG + "w342" + m.poster_path, original: TMDB_IMG + "w780" + m.poster_path } : null,
    summary: m.overview || "",
    genres: (m.genre_ids || []).map(g => TMDB_GENRES[g]).filter(Boolean),
    premiered: m.release_date || "",
    rating: { average: typeof m.vote_average === "number" && m.vote_average > 0 ? m.vote_average : null },
    weight: Math.min(100, Math.round(m.popularity || 0)),
    status: "",
    network: null,
    webChannel: null
  };
}

function entryFromShow(show, status) {
  return {
    id: show.id,
    key: keyOf(show),
    media: show._media || "show",
    name: show.name,
    img: show.image ? show.image.medium : "",
    imgBig: show.image ? (show.image.original || show.image.medium) : "",
    year: yearOf(show),
    rating: ratingOf(show),
    genres: (show.genres || []).slice(0, 3),
    story: storyline(show, 300),
    status: status || "want",
    season: 1,
    episode: 0,
    addedAt: Date.now(),
    updatedAt: Date.now()
  };
}
/*CORE-END*/

/* ================= browser app ================= */
if (typeof document !== "undefined") {
  const API = "https://api.tvmaze.com";
  const TMDB = "https://api.themoviedb.org/3";
  const TMDB_KEY = "ded2e623b03b83fafb50ffd6545186a6";
  const LS_SAVED = "sp-saved", LS_PASSED = "sp-passed", LS_EPS = "sp-eps";

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked: app keeps working in memory */ }
  }

  let saved = load(LS_SAVED, []);
  saved.forEach(e => { if (!e.key) { e.key = "tv:" + e.id; e.media = e.media || "show"; } });
  let passedIds = new Set(load(LS_PASSED, []).map(x => typeof x === "number" ? "tv:" + x : x));
  let epsCache = load(LS_EPS, {});
  const epsFetching = new Set();

  let pool = [];
  let moviePool = [];
  let media = "shows";
  let moviePage = 0;
  let moviesLoaded = false;
  let deck = [];
  let genre = "All";
  let nextPage = 0;
  let loadingMore = false;
  let lastAction = null;
  let currentView = "pick";

  const $ = id => document.getElementById(id);
  const deckEl = $("deck"), deckMsg = $("deck-msg"), deckActions = $("deck-actions");
  const chipsEl = $("genre-chips"), listBody = $("list-body"), listCount = $("list-count");

  function currentPool() { return media === "movies" ? moviePool : pool; }
  function savedIds() { return new Set(saved.map(e => e.key || "tv:" + e.id)); }
  function excludedIds() { const s = savedIds(); passedIds.forEach(id => s.add(id)); return s; }
  function persistPassed() { store(LS_PASSED, Array.from(passedIds).slice(-600)); }
  function persistSaved() { store(LS_SAVED, saved); listCount.textContent = saved.length; }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("TVMaze " + res.status);
    return res.json();
  }

  async function loadMorePages(count) {
    if (loadingMore) return 0;
    loadingMore = true;
    let added = 0;
    try {
      for (let i = 0; i < count; i++) {
        const page = await fetchJson(API + "/shows?page=" + nextPage);
        nextPage++;
        page.forEach(s => { s.key = "tv:" + s.id; s._media = "show"; });
        const before = pool.length;
        pool = dedupeById(pool.concat(page));
        added += pool.length - before;
        if (!page.length) break;
      }
    } finally { loadingMore = false; }
    return added;
  }

  let loadingMovies = false;
  async function loadMovies(count) {
    if (loadingMovies) return 0;
    loadingMovies = true;
    let added = 0;
    try {
      for (let i = 0; i < count; i++) {
        moviePage++;
        const data = await fetchJson(TMDB + "/discover/movie?api_key=" + TMDB_KEY + "&sort_by=popularity.desc&include_adult=false&page=" + moviePage);
        const before = moviePool.length;
        moviePool = dedupeById(moviePool.concat((data.results || []).map(normalizeTmdbMovie).filter(Boolean)));
        added += moviePool.length - before;
        if (!data.results || !data.results.length) break;
      }
    } finally { loadingMovies = false; }
    return added;
  }

  function buildChips() {
    const counts = {};
    currentPool().forEach(s => (s.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 9);
    chipsEl.innerHTML = "";
    ["All"].concat(top).forEach(g => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (g === genre ? " active" : "");
      b.textContent = g;
      b.addEventListener("click", () => {
        genre = g;
        buildChips();
        deck = deckFromPool(currentPool(), excludedIds(), genre);
        renderDeck();
        maybeRefill();
      });
      chipsEl.appendChild(b);
    });
  }

  function cardEl(show, behind) {
    const el = document.createElement("div");
    el.className = "card" + (behind ? " behind" : "");
    const r = ratingOf(show);
    const meta = [
      yearOf(show),
      show.status ? show.status : "",
      (show.network && show.network.name) || (show.webChannel && show.webChannel.name) || ""
    ].filter(Boolean).join(" · ");
    el.innerHTML =
      '<div class="stamp like">SAVE</div><div class="stamp pass">PASS</div>' +
      '<img class="poster" alt="" draggable="false">' +
      '<div class="info"><h2></h2>' +
      '<div class="meta">' + (r !== null ? '<span class="star">★ ' + r.toFixed(1) + "</span>" : "") + "<span>" + meta + "</span></div>" +
      '<div class="genres">' + (show.genres || []).join(" · ") + "</div>" +
      '<p class="story"></p></div>';
    el.querySelector("img.poster").src = (show.image && (behind ? show.image.medium : (show.image.original || show.image.medium))) || "";
    el.querySelector("h2").textContent = show.name;
    el.querySelector(".story").textContent = storyline(show);
    return el;
  }

  function renderDeck() {
    deckEl.querySelectorAll(".card").forEach(c => c.remove());
    if (!deck.length) {
      deckMsg.style.display = "block";
      deckMsg.innerHTML = 'That\'s everything in this pile for now.<br><button type="button" id="btn-more">Load more ' + (media === "movies" ? "movies" : "shows") + "</button>";
      const b = $("btn-more");
      if (b) b.addEventListener("click", async () => {
        deckMsg.textContent = media === "movies" ? "Loading more movies…" : "Loading more shows…";
        if (media === "movies") { await loadMovies(3); moviesLoaded = true; }
        else await loadMorePages(3);
        buildChips();
        deck = deckFromPool(currentPool(), excludedIds(), genre);
        renderDeck();
      });
      deckActions.style.display = "none";
      return;
    }
    deckMsg.style.display = "none";
    deckActions.style.display = "flex";
    if (deck.length > 1) deckEl.appendChild(cardEl(deck[1], true));
    const top = cardEl(deck[0], false);
    deckEl.appendChild(top);
    attachDrag(top);
  }

  function maybeRefill() {
    const busy = media === "movies" ? loadingMovies : loadingMore;
    if (deck.length < 12 && !busy) {
      const loader = media === "movies" ? loadMovies(2) : loadMorePages(2);
      loader.then(() => {
        const fresh = deckFromPool(currentPool(), excludedIds(), genre).filter(s => !deck.some(d => keyOf(d) === keyOf(s)));
        deck = deck.concat(fresh.slice(0, 60));
        buildChips();
        if (deck.length && deckEl.querySelectorAll(".card").length === 0) renderDeck();
      }).catch(() => { /* refill is best-effort */ });
    }
  }

  function commitSwipe(type) {
    const show = deck.shift();
    if (!show) return;
    if (type === "like") {
      saved.unshift(entryFromShow(show, "want"));
      persistSaved();
    } else {
      passedIds.add(keyOf(show));
      persistPassed();
    }
    lastAction = { type: type, show: show };
    $("btn-undo").disabled = false;
    renderDeck();
    maybeRefill();
  }

  function flyOut(dir, type) {
    const top = deckEl.querySelector(".card:not(.behind)");
    if (!top || !deck.length) return;
    top.style.transition = "transform .28s ease-in, opacity .28s";
    top.style.transform = "translateX(" + dir * 130 + "%) rotate(" + dir * 14 + "deg)";
    top.style.opacity = "0.4";
    setTimeout(() => commitSwipe(type), 270);
  }

  function attachDrag(card) {
    let startX = 0, dx = 0, dragging = false;
    const likeStamp = card.querySelector(".stamp.like");
    const passStamp = card.querySelector(".stamp.pass");
    card.addEventListener("pointerdown", e => {
      dragging = true; startX = e.clientX; dx = 0;
      card.style.transition = "none";
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });
    card.addEventListener("pointermove", e => {
      if (!dragging) return;
      dx = e.clientX - startX;
      card.style.transform = "translateX(" + dx + "px) rotate(" + dx / 16 + "deg)";
      likeStamp.style.opacity = dx > 0 ? Math.min(1, dx / 90) : 0;
      passStamp.style.opacity = dx < 0 ? Math.min(1, -dx / 90) : 0;
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (dx > 95) { flyOut(1, "like"); return; }
      if (dx < -95) { flyOut(-1, "pass"); return; }
      card.style.transition = "transform .25s ease";
      card.style.transform = "";
      likeStamp.style.opacity = 0;
      passStamp.style.opacity = 0;
    }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  $("btn-like").addEventListener("click", () => flyOut(1, "like"));
  $("btn-pass").addEventListener("click", () => flyOut(-1, "pass"));
  $("btn-undo").addEventListener("click", () => {
    if (!lastAction) return;
    const { type, show } = lastAction;
    if (type === "like") { saved = saved.filter(e => (e.key || "tv:" + e.id) !== keyOf(show)); persistSaved(); }
    else { passedIds.delete(keyOf(show)); persistPassed(); }
    deck.unshift(show);
    lastAction = null;
    $("btn-undo").disabled = true;
    renderDeck();
    if (currentView === "list") renderList();
  });

  /* ---------- search ---------- */
  $("search-form").addEventListener("submit", async e => {
    e.preventDefault();
    const q = $("search-input").value.trim();
    const box = $("search-results");
    if (!q) return;
    box.innerHTML = '<div class="empty">Searching…</div>';
    const boost = list => {
      const ql = q.toLowerCase();
      const score = n => { const s = (n || "").toLowerCase(); return s === ql ? 0 : s.startsWith(ql) ? 1 : s.includes(ql) ? 2 : 3; };
      return list.map((x, i) => [score(x.name), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(t => t[2]);
    };
    const [tvRes, tmRes] = await Promise.allSettled([
      fetchJson(API + "/search/shows?q=" + encodeURIComponent(q)),
      fetchJson(TMDB + "/search/movie?api_key=" + TMDB_KEY + "&include_adult=false&query=" + encodeURIComponent(q))
    ]);
    let shows = [], movies = [];
    if (tvRes.status === "fulfilled") {
      shows = dedupeById(tvRes.value.map(x => x.show).filter(s => s && s.id));
      shows.forEach(s => { s.key = "tv:" + s.id; s._media = "show"; });
      shows = boost(shows);
    }
    if (tmRes.status === "fulfilled") {
      movies = boost((tmRes.value.results || []).map(normalizeTmdbMovie).filter(Boolean));
    }
    if (!shows.length && !movies.length) {
      box.innerHTML = tvRes.status === "rejected" && tmRes.status === "rejected"
        ? '<div class="empty">Search could not reach the databases just now.<br>Check your connection and try again.</div>'
        : '<div class="empty">Nothing found for that search.<br>Check the spelling and try again.</div>';
      return;
    }
    box.innerHTML = "";
    if (shows.length) {
      const h = document.createElement("div");
      h.className = "group-title"; h.textContent = "📺 Shows";
      box.appendChild(h);
      shows.forEach(show => box.appendChild(searchRow(show)));
    }
    if (movies.length) {
      const h = document.createElement("div");
      h.className = "group-title"; h.textContent = "🎬 Movies";
      box.appendChild(h);
      movies.forEach(mv => box.appendChild(searchRow(mv)));
    }
  });

  function searchRow(show) {
    const row = document.createElement("div");
    row.className = "row";
    const r = ratingOf(show);
    const already = saved.some(e => (e.key || "tv:" + e.id) === keyOf(show));
    row.innerHTML =
      (show.image ? '<img alt="">' : "") +
      '<div class="rinfo"><h3></h3><div class="meta">' +
      (r !== null ? '<span class="star" style="color:var(--accent);font-weight:700;">★ ' + r.toFixed(1) + "</span>" : "") +
      "<span>" + [yearOf(show), (show.genres || []).slice(0, 2).join(" · ")].filter(Boolean).join(" · ") + "</span></div>" +
      '<p class="story"></p></div>' +
      '<button type="button" class="savebtn' + (already ? " saved" : "") + '">' + (already ? "Saved ✓" : "+ Save") + "</button>";
    if (show.image) row.querySelector("img").src = show.image.medium;
    row.querySelector("h3").textContent = show.name;
    row.querySelector(".story").textContent = storyline(show, 140);
    const btn = row.querySelector(".savebtn");
    if (!already) btn.addEventListener("click", () => {
      saved.unshift(entryFromShow(show, "want"));
      persistSaved();
      btn.textContent = "Saved ✓";
      btn.classList.add("saved");
    });
    return row;
  }

  /* ---------- my list ---------- */
  const GROUPS = [
    { key: "watching", title: "👀 Watching" },
    { key: "want", title: "🔖 Want to watch" },
    { key: "finished", title: "✅ Finished" }
  ];

  function ensureEpisodeMap(id) {
    if (epsCache[id] || epsFetching.has(id)) return;
    epsFetching.add(id);
    fetchJson(API + "/shows/" + id + "/episodes")
      .then(eps => { epsCache[id] = seasonMap(eps); store(LS_EPS, epsCache); epsFetching.delete(id); if (currentView === "list") renderList(); })
      .catch(() => { epsFetching.delete(id); });
  }

  function listRow(entry) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = entry.id;
    const map = epsCache[entry.id];
    const maxSeason = map ? Math.max.apply(null, Object.keys(map).map(Number).concat([1])) : null;
    const maxEp = map && map[entry.season] ? map[entry.season] : null;
    const chips = GROUPS.map(g =>
      '<button type="button" data-act="status" data-status="' + g.key + '" class="' + (entry.status === g.key ? "on-" + g.key : "") + '">' +
      g.title.replace(/^[^ ]+ /, "") + "</button>").join("");
    let html =
      (entry.img ? '<img alt="">' : "") +
      '<div class="rinfo"><h3></h3>' +
      '<div class="meta"><span>' + [entry.year, entry.rating !== null && entry.rating !== undefined ? "★ " + Number(entry.rating).toFixed(1) : "", (entry.genres || []).join(" · ")].filter(Boolean).join(" · ") + "</span></div>" +
      '<div class="statuschips">' + chips + "</div>";
    if (entry.status === "watching" && entry.media !== "movie") {
      html +=
        '<div class="progress"><span class="lab">Season</span>' +
        '<span class="stepper"><button type="button" data-act="s-">−</button><span class="val">' + entry.season + '</span><button type="button" data-act="s+">+</button></span>' +
        (maxSeason ? '<span class="of">of ' + maxSeason + "</span>" : "") +
        '<span class="lab">Episode</span>' +
        '<span class="stepper"><button type="button" data-act="e-">−</button><span class="val">' + entry.episode + '</span><button type="button" data-act="e+">+</button></span>' +
        (maxEp !== null ? '<span class="of">of ' + maxEp + "</span>" : "") +
        "</div>";
    }
    html += '<div class="progress-text">' + progressText(entry) + "</div></div>" +
      '<button type="button" class="remove" data-act="remove" aria-label="Remove">✕</button>';
    row.innerHTML = html;
    if (entry.img) row.querySelector("img").src = entry.img;
    row.querySelector("h3").textContent = entry.name;
    return row;
  }

  function renderList() {
    listCount.textContent = saved.length;
    if (!saved.length) {
      listBody.innerHTML = '<div class="empty">Nothing here yet.<br>Swipe through the deck and tap ♥ on anything that catches your eye.<br><button type="button" id="go-pick">Start picking</button></div>';
      const b = $("go-pick");
      if (b) b.addEventListener("click", () => switchView("pick"));
      return;
    }
    listBody.innerHTML = "";
    GROUPS.forEach(g => {
      const items = saved.filter(e => e.status === g.key).sort((a, b) => b.updatedAt - a.updatedAt);
      if (!items.length) return;
      const h = document.createElement("div");
      h.className = "group-title";
      h.textContent = g.title + " (" + items.length + ")";
      listBody.appendChild(h);
      items.forEach(entry => {
        listBody.appendChild(listRow(entry));
        if (entry.status === "watching" && entry.media !== "movie") ensureEpisodeMap(entry.id);
      });
    });
  }

  listBody.addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const row = e.target.closest(".row");
    if (!row) return;
    const entry = saved.find(x => String(x.id) === row.dataset.id);
    if (!entry) return;
    const act = btn.dataset.act;
    const map = epsCache[entry.id];
    if (act === "remove") {
      saved = saved.filter(x => x.id !== entry.id);
      persistSaved(); renderList(); return;
    }
    if (act === "status") {
      entry.status = btn.dataset.status;
    } else if (act === "s-" || act === "s+") {
      const c = clampProgress(entry.season + (act === "s+" ? 1 : -1), entry.episode, map);
      entry.season = c.season; entry.episode = c.episode;
    } else if (act === "e-" || act === "e+") {
      const c = clampProgress(entry.season, entry.episode + (act === "e+" ? 1 : -1), map);
      entry.episode = c.episode;
    }
    entry.updatedAt = Date.now();
    persistSaved();
    renderList();
  });

  /* ---------- media toggle (shows / movies) ---------- */
  async function switchMedia(m) {
    if (media === m && (m === "shows" || moviesLoaded)) return;
    media = m;
    genre = "All";
    $("media-shows").classList.toggle("active", m === "shows");
    $("media-movies").classList.toggle("active", m === "movies");
    if (m === "movies" && !moviesLoaded) {
      deck = [];
      deckEl.innerHTML = "";
      deckActions.style.display = "none";
      deckMsg.style.display = "block";
      deckMsg.textContent = "Loading movies…";
      try {
        await loadMovies(3);
        moviesLoaded = true;
      } catch (err) {
        deckMsg.innerHTML = 'Movies could not load from TMDB just now.<br><button type="button" id="btn-more">Try again</button>';
        const b = $("btn-more");
        if (b) b.addEventListener("click", () => { moviesLoaded = false; media = "shows"; switchMedia("movies"); });
        return;
      }
    }
    buildChips();
    deck = deckFromPool(currentPool(), excludedIds(), genre);
    renderDeck();
    maybeRefill();
  }
  $("media-shows").addEventListener("click", () => switchMedia("shows"));
  $("media-movies").addEventListener("click", () => switchMedia("movies"));

  /* ---------- tabs ---------- */
  function switchView(name) {
    currentView = name;
    ["pick", "search", "list"].forEach(v => {
      $("view-" + v).classList.toggle("active", v === name);
      $("tab-" + v).classList.toggle("active", v === name);
    });
    if (name === "list") renderList();
  }
  $("tab-pick").addEventListener("click", () => switchView("pick"));
  $("tab-search").addEventListener("click", () => switchView("search"));
  $("tab-list").addEventListener("click", () => switchView("list"));

  /* ---------- init ---------- */
  persistSaved();
  (async () => {
    try {
      await loadMorePages(1);
      buildChips();
      deck = deckFromPool(pool, excludedIds(), genre);
      renderDeck();
      // Widen the pool in the background so genre filters and refills have more to draw on.
      loadMorePages(2).then(() => {
        buildChips();
        if (media !== "shows") return;
        const fresh = deckFromPool(pool, excludedIds(), genre).filter(s => !deck.some(d => keyOf(d) === keyOf(s)));
        deck = deck.concat(fresh.slice(0, 60));
        if (deck.length && deckEl.querySelectorAll(".card").length === 0) renderDeck();
      }).catch(() => { /* background widening is best-effort */ });
    } catch (err) {
      deckMsg.innerHTML = 'Could not load shows from TVMaze.<br>Check your connection, then reload this page.';
    }
  })();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { stripHtml, truncateWords, storyline, yearOf, ratingOf, isEligible, dedupeById, shuffle, deckFromPool, seasonMap, clampProgress, progressText, entryFromShow, keyOf, normalizeTmdbMovie, TMDB_GENRES };
}
