let lastPrompt = "";
let lastSeed = "";

function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

function generateImage(isEnhanced = false) {
  const prompt = document.getElementById('prompt').value.trim();
  const seedInput = document.getElementById('seed').value.trim();
  const resultDiv = document.getElementById('result');
  const enhanceBtn = document.getElementById('enhanceBtn');

  const seed = seedInput !== "" ? seedInput : getRandomSeed();

  lastPrompt = prompt;
  lastSeed = seed;

  const encodedPrompt = encodeURIComponent(prompt);
  let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&nologo=true`;
  if (isEnhanced) {
    imageUrl += `&enhance=true`;
  }

  resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p><p>Загрузка изображения...</p>`;
  enhanceBtn.disabled = true;

  const img = document.createElement('img');
  img.src = imageUrl;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong>${isEnhanced ? ' (улучшено)' : ''}</p>`;
    resultDiv.appendChild(img);
    enhanceBtn.disabled = false;
  };

  img.onerror = () => {
    resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
    enhanceBtn.disabled = false;
  };
}

document.getElementById('generateBtn').addEventListener('click', () => generateImage(false));
document.getElementById('enhanceBtn').addEventListener('click', () => {
  if (lastPrompt && lastSeed) {
    generateImage(true);
  }
});
