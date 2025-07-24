let lastPrompt = "";
let lastSeed = "";

function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

function generateImage() {
  const prompt = document.getElementById('prompt').value.trim();
  const seedInput = document.getElementById('seed').value.trim();
  const resultDiv = document.getElementById('result');
  const enhanceBtn = document.getElementById('enhanceBtn');

  const seed = seedInput !== "" ? seedInput : getRandomSeed();
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&nologo=true`;

  resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong></p><p>Загрузка изображения...</p>`;
  enhanceBtn.disabled = true;

  const img = document.createElement('img');
  img.src = imageUrl;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong></p>`;
    resultDiv.appendChild(img);

    // сохранить параметры для "Улучшить"
    lastPrompt = prompt;
    lastSeed = seed;
    enhanceBtn.disabled = false;
  };

  img.onerror = () => {
    resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
    enhanceBtn.disabled = true;
  };
}

function enhanceImage() {
  if (!lastPrompt || !lastSeed) return;

  const resultDiv = document.getElementById('result');
  const enhanceBtn = document.getElementById('enhanceBtn');

  const encodedPrompt = encodeURIComponent(lastPrompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${lastSeed}&nologo=true&enhance=true`;

  resultDiv.innerHTML = `<p>Сид: <strong>${lastSeed}</strong> (улучшено)</p><p>Загрузка улучшенной версии...</p>`;
  enhanceBtn.disabled = true;

  const img = document.createElement('img');
  img.src = imageUrl;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${lastSeed}</strong> (улучшено)</p>`;
    resultDiv.appendChild(img);
    enhanceBtn.disabled = false;
  };

  img.onerror = () => {
    resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
    enhanceBtn.disabled = false;
  };
}
