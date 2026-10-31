"use strict";

// Book-style reader: swipe or tap the edges to turn pages, two-page spreads on wide screens.
const Reader = (() => {
  const SPREAD_MIN_WIDTH = 760;
  const EDGE = 0.3;
  const STORE_KEY = "reader:last-page";

  const el = document.getElementById("reader");
  const track = document.getElementById("reader-track");
  const label = document.getElementById("reader-label");
  const range = document.getElementById("reader-range");
  const tocList = document.getElementById("reader-toc-list");
  const toc = document.getElementById("reader-toc");

  let total = 0;
  let current = 1;
  let built = false;
  let frame = 0;
  let turning = null;
  let turnTimer = 0;
  const TURN_MS = 320;
  const TURN_TIMEOUT = 700;

  const isSpread = () => window.innerWidth >= SPREAD_MIN_WIDTH && window.innerWidth > window.innerHeight;

  function sectionOf(n) {
    const sections = window.APP.state.data.toc;
    let name = "";
    for (const s of sections) if (s.p <= n) name = s.s;
    return name;
  }

  function build() {
    const data = window.APP.state.data;
    total = data.pages;
    const leaves = ['<div class="leaf leaf--spacer" aria-hidden="true"></div>'];
    for (let n = 1; n <= total; n++) {
      leaves.push(`<figure class="leaf" data-page="${n}"><img src="pages/${n}.webp" alt="Trang ${n}"
        loading="${n <= 3 ? "eager" : "lazy"}" decoding="async" width="1100" height="1610"></figure>`);
    }
    leaves.push('<div class="leaf leaf--spacer" aria-hidden="true"></div>');
    track.innerHTML = leaves.join("");
    range.max = total;
    tocList.innerHTML = data.toc.map((s) =>
      `<li><button type="button" data-goto="${s.p}"><span>${window.APP.esc(s.s)}</span><span>${s.p}</span></button></li>`).join("");
    built = true;
  }

  // Single page: page n sits in slot n-1 (the spacer is hidden).
  // Spread: the spacer takes slot 0 so odd pages land on the right, like a printed book;
  // each spread starts on an even slot.
  function slotFor(n) {
    if (isSpread()) return n % 2 === 0 ? n : n - 1;
    return n - 1;
  }

  function leafWidth() {
    return track.clientWidth / (isSpread() ? 2 : 1);
  }

  // Native smooth scrolling fights scroll-snap in some browsers, so turns animate by hand with snap paused.
  let animation = 0;
  function animateTo(x) {
    cancelAnimationFrame(animation);
    const from = track.scrollLeft;
    const start = performance.now();
    track.style.scrollSnapType = "none";
    const finish = () => {
      track.scrollLeft = x;
      track.style.scrollSnapType = "";
      turning = null;
    };
    const tick = (now) => {
      const t = Math.min(1, (now - start) / TURN_MS);
      track.scrollLeft = from + (x - from) * (1 - (1 - t) ** 3);
      if (t < 1) animation = requestAnimationFrame(tick);
      else finish();
    };
    animation = requestAnimationFrame(tick);
    clearTimeout(turnTimer);
    turnTimer = setTimeout(() => { cancelAnimationFrame(animation); finish(); }, TURN_TIMEOUT);
  }

  // While a turn animates, intermediate scroll positions must not overwrite the target page.
  function goTo(n, smooth = true) {
    current = Math.min(Math.max(1, n), total);
    turning = slotFor(current);
    const x = turning * leafWidth();
    if (smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches) animateTo(x);
    else { track.scrollLeft = x; turning = null; }
    update();
  }

  function step(dir) {
    if (!isSpread()) return goTo(current + dir);
    goTo(Math.max(1, slotFor(current) + dir * 2));
  }

  function visiblePages() {
    if (!isSpread()) return [current, current];
    const slot = slotFor(current);
    return [Math.max(1, slot), Math.min(slot + 1, total)];
  }

  function update() {
    const [left, right] = visiblePages();
    const pages = left === right ? `${left}` : `${left}–${right}`;
    label.textContent = `Trang ${pages}/${total} · ${sectionOf(left)}`;
    range.value = current;
    try { localStorage.setItem(STORE_KEY, String(current)); } catch { /* private mode: no resume */ }
    if (location.hash !== `#/doc/${current}`) history.replaceState(null, "", `#/doc/${current}`);
  }

  function onScroll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const slot = Math.round(track.scrollLeft / leafWidth());
      if (turning !== null) return;
      const page = isSpread() ? Math.max(1, slot) : slot + 1;
      if (slotFor(page) !== slotFor(current)) {
        current = Math.min(page, total);
        update();
      }
    });
  }

  function toggleChrome(force) {
    el.classList.toggle("is-bare", force ?? !el.classList.contains("is-bare"));
  }

  function open(n) {
    if (!window.APP.state.data) return;
    if (!built) build();
    el.hidden = false;
    document.body.classList.add("is-reading");
    el.classList.toggle("is-spread", isSpread());
    toggleChrome(false);
    requestAnimationFrame(() => goTo(n || lastPage(), false));
    track.focus({ preventScroll: true });
  }

  function close() {
    el.hidden = true;
    toc.hidden = true;
    document.body.classList.remove("is-reading");
  }

  function lastPage() {
    try { return Number(localStorage.getItem(STORE_KEY)) || 1; } catch { return 1; }
  }

  track.addEventListener("scroll", onScroll, { passive: true });

  track.addEventListener("click", (e) => {
    const x = e.clientX / window.innerWidth;
    if (x < EDGE) step(-1);
    else if (x > 1 - EDGE) step(1);
    else toggleChrome();
  });

  track.addEventListener("dblclick", (e) => {
    const leaf = e.target.closest("[data-page]");
    if (leaf) location.hash = `#/p/${leaf.dataset.page}`;
  });

  range.addEventListener("input", () => goTo(Number(range.value), false));

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-reader-close]")) { location.hash = "#/"; return; }
    if (e.target.closest("[data-reader-toc]")) { toc.hidden = !toc.hidden; return; }
    if (e.target.closest("[data-reader-zoom]")) { location.hash = `#/p/${current}`; return; }
    const target = e.target.closest("[data-goto]");
    if (target) { toc.hidden = true; goTo(Number(target.dataset.goto), false); }
  });

  document.addEventListener("keydown", (e) => {
    if (el.hidden) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Escape") { if (!toc.hidden) toc.hidden = true; else location.hash = "#/"; }
  });

  window.addEventListener("resize", () => {
    if (el.hidden) return;
    el.classList.toggle("is-spread", isSpread());
    goTo(current, false);
  });

  return { open, close, lastPage, isOpen: () => !el.hidden };
})();
