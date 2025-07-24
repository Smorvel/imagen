let lastPrompt = "";
let lastSeed = "";

function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

function buildImageUrl(prompt, seed, enhance = false) {
  const encodedPrompt = encodeURIComponent(prompt);
  let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&nologo=true`;
  if (enhance) url += `&enhance=true`;
  return url;
}

function showImage(url, seed, isEnhanced = false) {
  const resultDiv = document.getElementById('result');
  const enhanceBtn = document.getElementById('enhanceBtn');

  resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p><p>Загрузка изображения...</p>`;
  enhanceBtn.disabled = true;

  const img = document.createElement('img');
  img.src = url;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p>`;
    resultDiv.appendChild(img);
    enhanceBtn.disabled = false;
  };

  img.onerror = () => {
    resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
  };
}

document.getElementById('generateBtn').addEventListener('click', () => {
  const prompt = document.getElementById('prompt').value.trim();
  const seedInput = document.getElementById('seed').value.trim();
  const seed = seedInput !== "" ? seedInput : getRandomSeed();

  lastPrompt = prompt;
  lastSeed = seed;

  const url = buildImageUrl(prompt, seed);
  showImage(url, seed);
});

document.getElementById('enhanceBtn').addEventListener('click', () => {
  if (!lastPrompt || !lastSeed) return;

  const url = buildImageUrl(lastPrompt, lastSeed, true);
  showImage(url, lastSeed, true);
});
