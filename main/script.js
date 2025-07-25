let lastPrompt = "";
let lastSeed = "";
let lastImageUrl = "";
let historyList = [];
let currentHistoryPage = 1;
const HISTORY_PAGE_SIZE = 21;
const MAX_HISTORY = 250;

// --- base64 helpers ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Storage ---
function saveHistoryToStorage() {
  localStorage.setItem("imgHistory", JSON.stringify(historyList));
}

function loadHistoryFromStorage() {
  const saved = localStorage.getItem("imgHistory");
  if (!saved) return;
  try {
    historyList = JSON.parse(saved);
  } catch {
    historyList = [];
  }
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
  const enhanceSVG = `<svg height="800px" width="800px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 431.661 431.661" xml:space="preserve" fill="#ffffff" stroke="#ffffff">

<g id="SVGRepo_bgCarrier" stroke-width="0"/>

<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>

<g id="SVGRepo_iconCarrier"> <g> <path style="fill:#ffffff;" d="M180.355,213.668l40.079,40.085L42.526,431.661L2.446,391.576L180.355,213.668z M228.877,245.316 l-40.079-40.085l68.905-68.911l40.091,40.079L228.877,245.316z"/> <polygon style="fill:#ffffff;" points="380.066,218.525 391.999,218.519 391.999,181.309 429.215,181.309 429.215,169.376 391.999,169.376 391.999,132.166 380.066,132.166 380.066,169.376 342.862,169.376 342.862,181.309 380.066,181.309 "/> <polygon style="fill:#ffffff;" points="393.282,260.424 393.282,248.49 356.073,248.49 356.073,211.281 344.145,211.281 344.145,248.49 306.93,248.49 306.93,260.424 344.145,260.424 344.145,297.633 356.073,297.633 356.073,260.424 "/> <polygon style="fill:#ffffff;" points="302.956,37.209 265.741,37.209 265.741,0 253.807,0 253.807,37.209 216.603,37.209 216.603,49.143 253.807,49.143 253.807,86.353 265.741,86.353 265.741,49.143 302.956,49.143 "/> <polygon style="fill:#ffffff;" points="223.853,73.148 186.638,73.148 186.638,35.932 174.71,35.932 174.71,73.148 137.495,73.148 137.495,85.076 174.71,85.076 174.71,122.291 186.638,122.291 186.638,85.076 223.853,85.076 "/> </g> </g>

</svg>`;
  const downloadSVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill="#ffffff" fill-rule="evenodd" d="M11 2a1 1 0 10-2 0v7.74L5.173 6.26a1 1 0 10-1.346 1.48l5.5 5a1 1 0 001.346 0l5.5-5a1 1 0 00-1.346-1.48L11 9.74V2zm-7.895 9.204A1 1 0 001.5 12v3.867a2.018 2.018 0 002.227 2.002c1.424-.147 3.96-.369 6.273-.369 2.386 0 5.248.236 6.795.383a2.013 2.013 0 002.205-2V12a1 1 0 10-2 0v3.884l-13.895-4.68zm0 0L2.5 11l.605.204zm0 0l13.892 4.683a.019.019 0 01-.007.005h-.006c-1.558-.148-4.499-.392-6.984-.392-2.416 0-5.034.23-6.478.38h-.009a.026.026 0 01-.013-.011V12a.998.998 0 00-.394-.796z"></path> </g></svg>`;

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
      addToHistory(item);
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

function addToHistory(item) {
  historyList.unshift(item);
  if (historyList.length > MAX_HISTORY)
    historyList = historyList.slice(0, MAX_HISTORY);
  saveHistoryToStorage();
  renderHistory();
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
        ${item.data ? `<img src="data:image/png;base64,${item.data}" draggable="true" alt="Сгенерированное изображение" style="max-width:100%;border-radius:5px;" title="Перетащите или откройте в новой вкладке">` : '<span style="color:#e53935;">Ошибка загрузки</span>'}
      </div>
      <p><strong>Prompt:</strong> ${item.prompt}</p>
      <p><strong>Сид:</strong> ${item.seed}${item.enhanced ? " (улучшено)" : ""}</p>
    `;
    div.querySelector("button").onclick = () => {
      historyList = historyList.filter(x => x.id != item.id);
      saveHistoryToStorage();
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

window.addEventListener("DOMContentLoaded", () => {
  loadHistoryFromStorage();
  renderHistory();
});
