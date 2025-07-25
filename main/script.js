let lastPrompt = "";
let lastSeed = "";
let lastImageUrl = "";
let historyList = [];
let currentHistoryPage = 1;
const HISTORY_PAGE_SIZE = 21;
const MAX_HISTORY = 250;

// --- IndexedDB helpers ---
const DB_NAME = "imgGenDB";
const STORE_NAME = "history";
const DB_VERSION = 1;
let db = null;

// Открытие/создание базы
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function (event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };
    request.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

// Сохранить всё в IndexedDB (перезаписывает всю историю)
async function saveHistoryToDB(historyArr) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await clearHistoryDB();
  for (const item of historyArr) {
    store.put(item);
  }
  return tx.complete || tx.done || tx;
}

// Получить всю историю из IndexedDB
async function loadHistoryFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const items = [];
    const cursorReq = store.openCursor(null, "prev");
    cursorReq.onsuccess = function (e) {
      const cursor = e.target.result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorReq.onerror = function (e) {
      reject(e.target.error);
    };
  });
}

// Добавить элемент в IndexedDB (и обрезать лишнее)
async function addToHistoryDB(item) {
  let arr = await loadHistoryFromDB();
  arr.unshift(item);
  if (arr.length > MAX_HISTORY) arr = arr.slice(0, MAX_HISTORY);
  await saveHistoryToDB(arr);
  historyList = arr;
  renderHistory();
}

// Удалить элемент из IndexedDB
async function removeFromHistoryDB(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  await tx.complete || tx.done || tx;
  historyList = await loadHistoryFromDB();
  renderHistory();
}

// Очистить всё хранилище IndexedDB
async function clearHistoryDB() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return tx.complete || tx.done || tx;
}

// --- base64 helpers ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Main logic ---

function getRandomSeed() {
  const length = Math.floor(Math.random() * 15) + 1;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const digits = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  return sign * parseInt(digits, 10);
}

async function translateIfCyrillic(text) {
  if (!/[А-Яа-яЁё]/.test(text)) return text;
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
  );
  if (!res.ok) return text;
  const data = await res.json();
  return data[0].map(part => part[0]).join(" ").trim();
}

function buildImageUrl(prompt, seed, enhance = false) {
  const encoded = encodeURIComponent(prompt);
  let url = `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&nologo=true&private=true`;
  if (enhance) url += "&enhance=true";
  return url;
}

function createOverlayBtns(enhanced = false, disabledEnhance = false) {
  const enhanceSVG = `<svg height="800px" width="800px" ...></svg>`;
  const downloadSVG = `<svg viewBox="0 0 20 20" ...></svg>`;

  const enhanceBtn = document.createElement("button");
  enhanceBtn.className = "overlay-btn";
  enhanceBtn.id = "enhanceBtnOverlay";
  enhanceBtn.innerHTML = enhanceSVG;
  enhanceBtn.title = "Улучшить";
  enhanceBtn.disabled = disabledEnhance;

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "overlay-btn";
  downloadBtn.id = "downloadBtnOverlay";
  downloadBtn.innerHTML = downloadSVG;
  downloadBtn.title = "Скачать PNG";

  const container = document.createElement("div");
  container.className = "result-overlay-btns";
  container.appendChild(enhanceBtn);
  container.appendChild(downloadBtn);

  return container;
}

async function showImage(url, seed, prompt, enhanced) {
  const resDiv = document.getElementById("result");
  resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? " (улучшено)" : ""}</p><p>Загрузка...</p>`;

  const oldBtns = document.querySelector(".result-overlay-btns");
  if (oldBtns) oldBtns.remove();

  const overlayBtns = createOverlayBtns(enhanced, true);
  resDiv.appendChild(overlayBtns);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Image fetch failed");
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    const imgSrc = "data:image/png;base64," + base64;

    const img = new Image();
    img.src = imgSrc;

    img.onload = () => {
      resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? " (улучшено)" : ""}</p>`;
      resDiv.appendChild(img);
      resDiv.appendChild(overlayBtns);

      document.getElementById("enhanceBtnOverlay").disabled = enhanced;

      document.getElementById("downloadBtnOverlay").onclick = async () => {
        const a = document.createElement("a");
        a.href = imgSrc;
        a.download = "image.png";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
        }, 100);
      };

      document.getElementById("enhanceBtnOverlay").onclick = () => {
        if (!lastPrompt || !lastSeed) return;
        const enhancedUrl = buildImageUrl(lastPrompt, lastSeed, true);
        showImage(enhancedUrl, lastSeed, lastPrompt, true);
      };

      lastImageUrl = url;
      lastPrompt = prompt;
      lastSeed = seed;

      const item = { url, seed, prompt, enhanced, id: Date.now(), data: base64 };
      addToHistoryDB(item);
    };

    img.onerror = () => {
      resDiv.innerHTML = "Ошибка при загрузке изображения.";
      const oldBtns = document.querySelector(".result-overlay-btns");
      if (oldBtns) oldBtns.remove();
    };
  } catch (e) {
    resDiv.innerHTML = "Ошибка при загрузке изображения.";
    const oldBtns = document.querySelector(".result-overlay-btns");
    if (oldBtns) oldBtns.remove();
  }
}

function renderHistoryPagination(totalPages) {
  const paginationDiv = document.createElement("div");
  paginationDiv.className = "history-pagination";
  for (let page = 1; page <= totalPages; page++) {
    const btn = document.createElement("button");
    btn.textContent = page;
    if (page === currentHistoryPage) btn.classList.add("active");
    btn.onclick = () => {
      currentHistoryPage = page;
      renderHistory();
    };
    paginationDiv.appendChild(btn);
  }
  return paginationDiv;
}

function renderHistory() {
  const histDiv = document.getElementById("history");
  histDiv.innerHTML = "";

  const totalItems = historyList.length;
  const totalPages = Math.ceil(totalItems / HISTORY_PAGE_SIZE) || 1;
  currentHistoryPage = Math.min(currentHistoryPage, totalPages);

  const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const end = start + HISTORY_PAGE_SIZE;
  const pageItems = historyList.slice(start, end);

  pageItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.id = item.id;
    div.innerHTML = `
      <button title="Удалить">×</button>
      <div class="history-img-wrap" style="width:100%;text-align:center;">
        ${item.data ? `<img src="data:image/png;base64,${item.data}" draggable="true" alt="Сгенерированное изображение" style="max-width:100%;border-radius:5px;" title="Пе�[...]
      </div>
      <p><strong>Prompt:</strong> ${item.prompt}</p>
      <p><strong>Сид:</strong> ${item.seed}${item.enhanced ? " (улучшено)" : ""}</p>
    `;
    div.querySelector("button").onclick = async () => {
      await removeFromHistoryDB(item.id);
      const maxPagesNow = Math.ceil(historyList.length / HISTORY_PAGE_SIZE) || 1;
      if (currentHistoryPage > maxPagesNow) currentHistoryPage = maxPagesNow;
      renderHistory();
    };
    histDiv.appendChild(div);
  });

  if (totalPages > 1) {
    const pagDiv = renderHistoryPagination(totalPages);
    histDiv.appendChild(pagDiv);
  }
}

document.getElementById("generateBtn").addEventListener("click", async () => {
  const raw = document.getElementById("prompt").value.trim();
  if (!raw) return;
  const seed = document.getElementById("seed").value.trim() || getRandomSeed();
  const promptTranslated = await translateIfCyrillic(raw);
  const url = buildImageUrl(promptTranslated, seed);
  showImage(url, seed, promptTranslated, false);
});

window.addEventListener("DOMContentLoaded", async () => {
  historyList = await loadHistoryFromDB();
  renderHistory();
});
