let lastPrompt = "";
let lastSeed = "";
let lastImageUrl = "";

async function translateIfNeeded(promptRaw) {
  const checkbox = document.getElementById('translate');
  if (!checkbox.checked) return promptRaw;

  // автоматическое определение языка + перевод
  const res = await fetch('https://libretranslate.com/translate', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      q: promptRaw,
      source: 'auto',
      target: 'en',
      format: 'text'
    })
  });
  if (!res.ok) return promptRaw;
  const data = await res.json();
  return data.translatedText;
}

function buildImageUrl(prompt, seed, enhance = false) {
  const encoded = encodeURIComponent(prompt);
  let url = `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&nologo=true`;
  if (enhance) url += '&enhance=true';
  return url;
}

async function showImage(url, seed, prompt, enhanced) {
  const resDiv = document.getElementById('result');
  const enhBtn = document.getElementById('enhanceBtn');
  const dlBtn = document.getElementById('downloadBtn');

  resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? ' (улучшено)' : ''}</p><p>Загрузка...</p>`;
  enhBtn.disabled = true;
  dlBtn.disabled = true;

  const img = new Image();
  img.src = url;
  img.onload = () => {
    resDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${enhanced ? ' (улучшено)' : ''}</p>`;
    resDiv.appendChild(img);
    enhBtn.disabled = false;
    dlBtn.disabled = false;
    lastImageUrl = img.src;
    addToHistory(img.src, seed, prompt, enhanced);
  };
  img.onerror = async () => {
    try {
      const resp = await fetch(url);
      if (resp.status === 502) {
        resDiv.innerHTML = 'Ошибка CloudFlare (502)';
      } else {
        resDiv.innerHTML = 'Ошибка при загрузке изображения.';
      }
    } catch {
      resDiv.innerHTML = 'Ошибка при загрузке изображения.';
    }
  };
}

function addToHistory(url, seed, prompt, enhanced) {
  const hist = document.getElementById('history');
  const div = document.createElement('div');
  div.className = 'history-item';
  div.innerHTML = `<img src="${url}"><p><strong>Prompt:</strong> ${prompt}</p><p><strong>Сид:</strong> ${seed}${enhanced?' (улучшено)':''}</p>`;
  hist.prepend(div);
}

function getRandomSeed() { return Math.floor(Math.random()*1e9); }

document.getElementById('generateBtn').addEventListener('click', async () => {
  const pr = document.getElementById('prompt').value.trim();
  if (!pr) return;
  const seed = document.getElementById('seed').value.trim() || getRandomSeed();
  const promptTranslated = await translateIfNeeded(pr);
  lastPrompt = promptTranslated;
  lastSeed = seed;
  const url = buildImageUrl(promptTranslated, seed);
  showImage(url, seed, promptTranslated, false);
});

document.getElementById('enhanceBtn').addEventListener('click', () => {
  if (!lastPrompt || !lastSeed) return;
  const url = buildImageUrl(lastPrompt, lastSeed, true);
  showImage(url, lastSeed, lastPrompt, true);
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!lastImageUrl) return;
  const a = document.createElement('a');
  a.href = lastImageUrl;
  a.download = 'image.png';
  a.click();
});
