"use strict";

const RESULT_PAGE = 40;
const PAGE_HITS = 9;
const KEY_SPECS = ["Công suất (W)", "Quang thông (lm)", "Nhiệt độ màu (K)"];

const $ = (sel) => document.querySelector(sel);
const view = $("#view");
const input = $("#q");
const chipsEl = $("#chips");
const sheet = $("#sheet");

const state = { data: null, products: [], section: "", sort: "rel", limit: RESULT_PAGE };

function fold(text) {
  return String(text).replace(/Đ/g, "D").replace(/đ/g, "d")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const compact = (text) => fold(text).replace(/[^a-z0-9]/g, "");

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function priceLabel(p) {
  if (p.n) return p.n.toLocaleString("vi-VN") + "đ";
  return p.price || "Xem trang";
}

function prepare(data) {
  return data.products.map((p, i) => {
    const specText = p.v.map(([, v]) => v).join(" ");
    return { ...p, i, hay: fold(`${p.m} ${p.s} ${specText}`), key: compact(p.m) };
  });
}

function score(product, tokens, allowedMisses = 0) {
  let total = 0;
  let misses = 0;
  for (const token of tokens) {
    const flat = token.replace(/[^a-z0-9]/g, "");
    if (product.key.startsWith(flat) && flat) total += 12;
    else if (flat && product.key.includes(flat)) total += 7;
    else if (product.hay.includes(token)) total += 2;
    else if (++misses > allowedMisses) return 0;
  }
  return total;
}

function rank(list, tokens, allowedMisses) {
  return list.map((p) => ({ p, s: score(p, tokens, allowedMisses) })).filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.p.p - b.p.p).map((r) => r.p);
}

// Spoken queries often carry an extra word; with three or more words, allow one to miss.
function search(query) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  let list = state.products.filter((p) => !state.section || p.s === state.section);
  let loose = false;
  if (tokens.length) {
    const exact = rank(list, tokens, 0);
    loose = !exact.length && tokens.length >= 3;
    list = loose ? rank(list, tokens, 1) : exact;
  }
  if (state.sort !== "rel") {
    const dir = state.sort === "asc" ? 1 : -1;
    const priced = list.filter((p) => p.n).sort((a, b) => (a.n - b.n) * dir);
    list = [...priced, ...list.filter((p) => !p.n)];
  }
  const pages = tokens.length ? state.data.pageList.filter((pg) =>
    (!state.section || pg.s === state.section) && tokens.every((t) => pg.f.includes(t))) : [];
  return { list, pages, tokens, loose };
}

function highlight(model, tokens) {
  const safe = esc(model);
  const words = tokens.filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
}

function itemHTML(p, tokens = []) {
  const tags = KEY_SPECS.map((k) => p.v.find(([label]) => label === k))
    .filter(Boolean).map(([k, v]) => `<span class="tag">${esc(v)} ${esc(k.match(/\((.+)\)/)?.[1] || "")}</span>`).join("");
  return `<li><button class="item" type="button" data-product="${p.i}">
    <span class="item__model">${highlight(p.m, tokens)}</span>
    <span class="item__price${p.n ? "" : " is-ask"}">${esc(priceLabel(p))}</span>
    <span class="item__meta"><span>${esc(p.s)}</span><span>Trang ${p.p}</span></span>
    ${tags ? `<span class="tags">${tags}</span>` : ""}
  </button></li>`;
}

function renderChips() {
  const all = [{ s: "" }, ...state.data.toc];
  chipsEl.innerHTML = all.map((t) =>
    `<button class="chip" type="button" data-section="${esc(t.s)}" aria-pressed="${t.s === state.section}">${esc(t.s || "Tất cả")}</button>`).join("");
}

function renderHome() {
  const d = state.data;
  const counts = {};
  state.products.forEach((p) => { counts[p.s] = (counts[p.s] || 0) + 1; });
  const priced = state.products.filter((p) => p.n).length;
  const resume = Math.min(Reader.lastPage(), d.pages);
  view.innerHTML = `
    <section class="hero">
      <h1>Tìm model, xem giá trong vài giây.</h1>
      <p>Gõ mã hoặc tên sản phẩm, không cần dấu. Dùng được cả khi mất mạng.</p>
      <div class="stats">
        <div><b>${state.products.length}</b>model</div>
        <div><b>${priced}</b>có giá niêm yết</div>
        <div><b>${d.pages}</b>trang gốc</div>
      </div>
      <a class="book" href="#/doc/${resume}">
        <img src="thumbs/${resume}.webp" alt="" width="320" height="468">
        <span><b>${resume > 1 ? `Đọc tiếp trang ${resume}` : "Đọc như sách"}</b>
        Lật trang bằng cách vuốt hoặc chạm mép màn hình</span>
        <span class="book__go" aria-hidden="true">›</span>
      </a>
    </section>
    <h2 class="eyebrow">Nhóm sản phẩm</h2>
    <div class="sections">${d.toc.map((t, i) => {
      const end = (d.toc[i + 1]?.p || d.pages + 1) - 1;
      return `<a class="section" href="#/doc/${t.p}" data-pick="${esc(t.s)}">
        <img src="thumbs/${t.p}.webp" alt="" loading="lazy" width="320" height="286">
        <div><h3>${esc(t.s)}</h3><span>${counts[t.s] || 0} model · trang ${t.p}–${end}</span></div></a>`;
    }).join("")}</div>`;
}

function renderResults() {
  const query = input.value.trim();
  if (!query && !state.section) return renderHome();
  const { list, pages, tokens, loose } = search(query);
  const shown = list.slice(0, state.limit);
  const sortBtn = (key, label) => `<button type="button" data-sort="${key}" aria-pressed="${state.sort === key}">${label}</button>`;
  view.innerHTML = list.length || pages.length ? `
    <div class="summary">
      <p>${list.length} model${state.section ? ` trong <b>${esc(state.section)}</b>` : ""}</p>
      <div class="sort" role="group" aria-label="Sắp xếp">${sortBtn("rel", "Phù hợp")}${sortBtn("asc", "Giá ↑")}${sortBtn("desc", "Giá ↓")}</div>
    </div>
    ${loose ? `<p class="loose">Không có model khớp đủ mọi từ trong “${esc(query)}”. Đây là các kết quả gần nhất.</p>` : ""}
    <ul class="results">${shown.map((p) => itemHTML(p, tokens)).join("")}</ul>
    ${list.length > shown.length ? `<button class="more" type="button" data-more>Xem thêm ${Math.min(RESULT_PAGE, list.length - shown.length)} model</button>` : ""}
    ${pages.length ? `<h2 class="eyebrow">Trang có nhắc tới “${esc(query)}”</h2>
      <div class="pages">${pages.slice(0, PAGE_HITS).map((pg) =>
        `<a class="thumb" href="#/p/${pg.n}"><img src="thumbs/${pg.n}.webp" alt="Trang ${pg.n}" loading="lazy" width="320" height="468">Trang ${pg.n}</a>`).join("")}</div>` : ""}`
    : `<div class="empty"><b>Không tìm thấy “${esc(query)}”</b>Thử bỏ bớt từ, hoặc gõ phần đầu của mã model, ví dụ “at04”.</div>`;
}

function renderPage(n) {
  const d = state.data;
  const page = d.pageList[n - 1];
  if (!page) return renderHome();
  const models = state.products.filter((p) => p.p === n);
  view.innerHTML = `<div class="viewer">
    <div class="viewer__bar">
      <a href="#/p/${n - 1}" aria-disabled="${n <= 1}" aria-label="Trang trước">‹</a>
      <span class="viewer__title">${esc(page.s)} · Trang ${n}/${d.pages}</span>
      <a href="#/doc/${n}" class="viewer__book">Đọc dạng sách</a>
      <a href="#/p/${n + 1}" aria-disabled="${n >= d.pages}" aria-label="Trang sau">›</a>
    </div>
    <div class="viewer__page"><img src="pages/${n}.webp" alt="Trang ${n} của catalogue" width="1100" height="1610"></div>
    ${models.length ? `<div class="viewer__models"><h2 class="eyebrow">Model trên trang này</h2>
      <ul class="results">${models.map((p) => itemHTML(p)).join("")}</ul></div>` : ""}
  </div>`;
  window.scrollTo(0, 0);
}

function openProduct(i) {
  const p = state.products[i];
  const rows = p.v.filter(([label]) => label).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  $("#sheet-body").innerHTML = `<div class="detail">
    <p class="detail__section">${esc(p.s)}</p>
    <h2 id="sheet-title">${esc(p.m)}</h2>
    <div class="detail__price"><span>Giá bán lẻ</span><b>${esc(priceLabel(p))}</b></div>
    ${rows ? `<table class="specs"><tbody>${rows}</tbody></table>` : `<p class="note">Thông số của model này nằm trong hình ở trang ${p.p}.</p>`}
    <div class="actions">
      <a class="btn btn--primary" href="#/p/${p.p}" data-close>Xem trang ${p.p}</a>
      <button class="btn" type="button" data-share="${p.i}">Chia sẻ</button>
    </div>
    <p class="note">Dữ liệu tách tự động từ catalogue. Đối chiếu trang gốc trước khi báo giá.</p>
  </div>`;
  sheet.showModal();
}

async function share(i) {
  const p = state.products[i];
  const text = `${p.m} · ${priceLabel(p)} · ${p.s} (trang ${p.p})`;
  try {
    if (navigator.share) await navigator.share({ title: p.m, text });
    else { await navigator.clipboard.writeText(text); alert("Đã chép: " + text); }
  } catch (err) {
    if (err.name !== "AbortError") alert("Không chia sẻ được: " + err.message);
  }
}

function route() {
  const book = location.hash.match(/^#\/doc\/(\d+)/);
  if (book) {
    if (!view.innerHTML) renderResults();
    return Reader.open(Number(book[1]));
  }
  if (Reader.isOpen()) Reader.close();
  const m = location.hash.match(/^#\/p\/(\d+)/);
  if (m) return renderPage(Number(m[1]));
  renderResults();
}

function setQuery(query) {
  input.value = query;
  input.dispatchEvent(new Event("input"));
  if (location.hash.startsWith("#/doc/")) location.hash = "#/";
}

window.APP = { state, esc, search, setQuery };

let timer;
input.addEventListener("input", () => {
  $("#clear").hidden = !input.value;
  state.limit = RESULT_PAGE;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (location.hash.startsWith("#/p/")) history.replaceState(null, "", "#/");
    renderResults();
    window.scrollTo(0, 0);
  }, 120);
});
$("#clear").addEventListener("click", () => { input.value = ""; $("#clear").hidden = true; input.focus(); renderResults(); });

chipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-section]");
  if (!chip) return;
  state.section = chip.dataset.section;
  state.limit = RESULT_PAGE;
  renderChips();
  chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  history.replaceState(null, "", "#/");
  renderResults();
});

document.addEventListener("click", (e) => {
  const product = e.target.closest("[data-product]");
  if (product) return openProduct(Number(product.dataset.product));
  if (e.target.closest("[data-more]")) { state.limit += RESULT_PAGE; return renderResults(); }
  const sort = e.target.closest("[data-sort]");
  if (sort) { state.sort = sort.dataset.sort; return renderResults(); }
  const shareBtn = e.target.closest("[data-share]");
  if (shareBtn) return share(Number(shareBtn.dataset.share));
  if (e.target.closest("[data-close]")) sheet.close();
});
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

function syncHeaderHeight() {
  document.documentElement.style.setProperty("--top-h", $(".top").offsetHeight + "px");
}
function syncNetwork() { $("#net").hidden = navigator.onLine; }

async function start() {
  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    view.innerHTML = `<div class="empty"><b>Chưa tải được dữ liệu</b>${esc(err.message)}. Kiểm tra mạng rồi mở lại.</div>`;
    return;
  }
  state.products = prepare(state.data);
  $("#doc-title").textContent = state.data.title;
  document.title = `RD products · ${state.data.title}`;
  renderChips();
  syncHeaderHeight();
  route();
}

window.addEventListener("hashchange", route);
window.addEventListener("resize", syncHeaderHeight);
window.addEventListener("online", syncNetwork);
window.addEventListener("offline", syncNetwork);
syncNetwork();
start();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker:", err.message));
}
