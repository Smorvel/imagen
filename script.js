let lastPrompt = "";
let lastSeed = "";
let lastImageUrl = "";

function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

function buildImageUrl(prompt, seed, enhance = false) {
  const encodedPrompt = encodeURIComponent(prompt);
  let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&nologo=true`;
  if (enhance) url += `&enhance=true`;
  return url;
}

async function maybeTranslate(prompt) {
  const useTranslation = document.getElementById('translate').checked;
  if (!useTranslation) return prompt;

  const url = `https://text.pollinations.ai/переведи текст на английский "${prompt}", без лишнего текста, только перевод напиши и все`;
  const response = await fetch(url);
  return await response.text();
}

async function showImage(url, seed, prompt, isEnhanced = false) {
  const resultDiv = document.getElementById('result');
  const enhanceBtn = document.getElementById('enhanceBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p><p>Загрузка изображения...</p>`;
  enhanceBtn.disabled = true;
  downloadBtn.disabled = true;

  const img = new Image();
  img.src = url;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p>`;
    resultDiv.appendChild(img);
    enhanceBtn.disabled = false;
    downloadBtn.disabled = false;
    lastImageUrl = img.src;

    addToHistory(img.src, seed, prompt, isEnhanced);
  };

  img.onerror = async () => {
    try {
      const res = await fetch(url);
      if (res.status === 502) {
        resultDiv.innerHTML = 'Ошибка CloudFlare (502 Bad Gateway)';
      } else {
        resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
      }
    } catch {
      resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
    }
  };
}

function addToHistory(url, seed, prompt, isEnhanced) {
  const history = document.getElementById('history');
  const container = document.createElement('div');
  container.className = 'history-item';
  container.innerHTML = `
    <img src="${url}" alt="история" />
    <p><strong>Промт:</strong> ${prompt}</p>
    <p><strong>Сид:</strong> ${seed}${isEnhanced ? ' (улучшено)' : ''}</p>
  `;
  history.prepend(container);
}

document.getElementById('generateBtn').addEventListener('click', async () => {
  const promptInput = document.getElementById('prompt');
  const seedInput = document.getElementById('seed');

  const promptRaw = promptInput.value.trim();
  const seed = seedInput.value.trim() || getRandomSeed();
  const prompt = await maybeTranslate(promptRaw);

  lastPrompt = prompt;
  lastSeed = seed;

  const url = buildImageUrl(prompt, seed);
  showImage(url, seed, prompt, false);
});

document.getElementById('enhanceBtn').addEventListener('click', () => {
  if (!lastPrompt || !lastSeed) return;

  const url = buildImageUrl(lastPrompt, lastSeed, true);
  showImage(url, lastSeed, lastPrompt, true);
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!lastImageUrl) return;
  const link = document.createElement('a');
  link.href = lastImageUrl;
  link.download = 'image.png';
  link.click();
});
