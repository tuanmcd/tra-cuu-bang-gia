"use strict";

// Voice search in Vietnamese, TV-remote style: tap the mic, speak, results appear.
const Voice = (() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById("mic");
  const overlay = document.getElementById("voice");
  const status = document.getElementById("voice-status");
  const heard = document.getElementById("voice-heard");
  const retry = document.getElementById("voice-retry");

  const UNITS = /(\d+)\s*(?:oát|oat|wát|wat|watt|óat|w)\b/giu;
  const FILLER = ["tìm kiếm", "tìm giúp", "tìm cho tôi", "tìm cho mình", "tìm", "cho tôi xem", "cho tôi", "cho mình",
    "giúp tôi", "xem giá", "giá của", "giá bao nhiêu", "bao nhiêu tiền", "bao nhiêu", "giá", "loại", "mẫu"];
  const LETTERS = { "a": "a", "bê": "b", "bờ": "b", "xê": "c", "cờ": "c", "dê": "d", "đê": "d", "ép": "f", "gờ": "g",
    "hát": "h", "ca": "k", "lờ": "l", "mờ": "m", "nờ": "n", "pê": "p", "quy": "q", "rờ": "r", "ét": "s", "tê": "t",
    "vê": "v", "ích": "x" };
  const DIGITS = { "không": "0", "một": "1", "hai": "2", "ba": "3", "bốn": "4", "năm": "5", "sáu": "6", "bảy": "7",
    "tám": "8", "chín": "9" };

  let recognizer = null;
  let gotResult = false;

  const isCode = (t) => /^[a-z0-9]$/i.test(t) || /^\d+$/.test(t);

  // Speech arrives as words ("a tê không bốn mười oát"); turn it into something the search understands.
  function normalise(text) {
    let q = ` ${text.toLowerCase().replace(/[.,!?]/g, " ")} `;
    for (const f of FILLER) {
      const next = q.replace(new RegExp(`\\s${f}\\s`, "gu"), " ");
      if (next.trim()) q = next;
    }
    q = q.replace(UNITS, "$1w");
    const words = q.trim().split(/\s+/);
    const mapped = words.map((w, i) => {
      const near = (j) => words[j] !== undefined && (isCode(words[j]) || words[j] in LETTERS || words[j] in DIGITS);
      if ((w in LETTERS || w in DIGITS) && (near(i - 1) || near(i + 1))) return LETTERS[w] ?? DIGITS[w];
      return w;
    });
    const merged = [];
    for (const w of mapped) {
      const prev = merged[merged.length - 1];
      if (prev !== undefined && /^[a-z0-9]+$/.test(prev) && isCode(w) && /^[a-z]$|\d$/.test(prev.slice(-1))
          && (prev.length <= 6)) merged[merged.length - 1] = prev + w;
      else merged.push(w);
    }
    return merged.join(" ").replace(/\s+/g, " ").trim();
  }

  function pickBest(alternatives) {
    let best = { q: normalise(alternatives[0]), hits: -1 };
    for (const alt of alternatives) {
      const q = normalise(alt);
      const hits = window.APP.search(q).list.length;
      if (hits > best.hits) best = { q, hits };
    }
    return best.q;
  }

  function show(state, text = "") {
    overlay.dataset.state = state;
    const messages = {
      listening: "Đang nghe… hãy nói tên hoặc mã sản phẩm",
      denied: "Chưa được phép dùng micro. Bật quyền micro cho trang này trong cài đặt trình duyệt.",
      silent: "Không nghe thấy gì. Chạm để thử lại.",
      error: "Có lỗi khi nhận giọng nói. Chạm để thử lại.",
      offline: "Tìm bằng giọng nói cần có mạng.",
    };
    status.textContent = messages[state] || "";
    heard.textContent = text;
    retry.hidden = state === "listening";
  }

  function start() {
    if (!navigator.onLine) { overlay.hidden = false; show("offline"); return; }
    stop();
    gotResult = false;
    recognizer = new Recognition();
    recognizer.lang = "vi-VN";
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 4;
    recognizer.continuous = false;

    recognizer.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      heard.textContent = `“${result[0].transcript}”`;
      if (!result.isFinal) return;
      gotResult = true;
      const alternatives = Array.from(result, (alt) => alt.transcript);
      window.APP.setQuery(pickBest(alternatives));
      close();
    };
    recognizer.onerror = (e) => {
      gotResult = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") show("denied");
      else if (e.error === "no-speech") show("silent");
      else if (e.error !== "aborted") show("error", e.error);
    };
    recognizer.onend = () => { if (!gotResult && !overlay.hidden) show("silent"); };

    overlay.hidden = false;
    show("listening");
    if (navigator.vibrate) navigator.vibrate(25);
    try { recognizer.start(); } catch (err) { show("error", err.message); }
  }

  function stop() {
    if (recognizer) { recognizer.onend = null; recognizer.abort(); recognizer = null; }
  }

  function close() {
    stop();
    overlay.hidden = true;
  }

  if (!Recognition) {
    button.hidden = true;
  } else {
    button.hidden = false;
    button.addEventListener("click", start);
    retry.addEventListener("click", start);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-voice-close]")) close();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  }

  return { normalise, supported: Boolean(Recognition) };
})();
