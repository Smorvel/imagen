let lastPrompt = "";
let lastSeed = "";
let lastImageUrl = "";
let historyList = [];

function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

async function translateIfCyrillic(text) {
  if (!/[А-Яа-яЁё]/.test(text)) return text;
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
  );
  if (!res.ok) return text;
  const data = await res.json();
  return data[0]?.[0]?.[0] || text;
}

function buildImageUrl(prompt, seed, enhance = false) {
  const encoded = encodeURIComponent(prompt);
  let url = `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&nologo=true`;
  if (enhance) url += "&enhance=true";
  return url;
}

async function showImage(url, seed, prompt, enhanced) {
  const resDiv = document.getElementById("result");
  const enhBtn = document.getElementById("enhanceBtn");

  resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? " (улучшено)" : ""}</p><p>Загрузка...</p>`;
  enhBtn.disabled = true;

  const img = new Image();
  img.src = url;

  img.onload = () => {
    resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? " (улучшено)" : ""}</p>`;
    resDiv.appendChild(img);

    const overlay = document.createElement("div");
    overlay.className = "download-overlay";
    overlay.textContent = "Скачать PNG";
    overlay.onclick = async () => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "image.png";
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        alert("Не удалось скачать изображение.");
      }
    };
    resDiv.appendChild(overlay);

    lastImageUrl = url;
    enhBtn.disabled = false;
    lastPrompt = prompt;
    lastSeed = seed;

    const item = { url, seed, prompt, enhanced, id: Date.now() };
    addToHistory(item);
    saveHistoryToStorage();
  };

  img.onerror = async () => {
    try {
      const resp = await fetch(url);
      if (resp.status === 502) {
        resDiv.innerHTML = "Превышен лимит Cloudflare (502)";
      } else {
        resDiv.innerHTML = "Ошибка при загрузке изображения.";
      }
    } catch {
      resDiv.innerHTML = "Ошибка при загрузке изображения.";
    }
  };
}

function addToHistory(item) {
  historyList.unshift(item);
  renderHistory();
}

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

function renderHistory() {
  const histDiv = document.getElementById("history");
  histDiv.innerHTML = "";
  historyList.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.id = item.id;
    div.innerHTML = `
      <button title="Удалить">×</button>
      <img src="${item.url}">
      <p><strong>Prompt:</strong> ${item.prompt}</p>
      <p><strong>Сид:</strong> ${item.seed}${item.enhanced ? " (улучшено)" : ""}</p>
    `;
    div.querySelector("button").onclick = () => {
      historyList = historyList.filter(x => x.id != item.id);
      saveHistoryToStorage();
      renderHistory();
    };
    histDiv.prepend(div);
  });
}

document.getElementById("generateBtn").addEventListener("click", async () => {
  const raw = document.getElementById("prompt").value.trim();
  if (!raw) return;
  const seed = document.getElementById("seed").value.trim() || getRandomSeed();
  const promptTranslated = await translateIfCyrillic(raw);
  const url = buildImageUrl(promptTranslated, seed);
  showImage(url, seed, promptTranslated, false);
});

document.getElementById("enhanceBtn").addEventListener("click", () => {
  if (!lastPrompt || !lastSeed) return;
  const url = buildImageUrl(lastPrompt, lastSeed, true);
  showImage(url, lastSeed, lastPrompt, true);
});

window.addEventListener("DOMContentLoaded", () => {
  loadHistoryFromStorage();
  renderHistory();
});
