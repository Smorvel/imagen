function getRandomSeed() {
  return Math.floor(Math.random() * 1e9);
}

function generateImage() {
  const prompt = document.getElementById('prompt').value.trim();
  const seedInput = document.getElementById('seed').value.trim();
  const resultDiv = document.getElementById('result');

  const seed = seedInput !== "" ? seedInput : getRandomSeed();
  const encodedPrompt = encodeURIComponent(`${prompt} --seed ${seed}`);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;

  resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong></p><p>Загрузка изображения...</p>`;

  const img = document.createElement('img');
  img.src = imageUrl;

  img.onload = () => {
    resultDiv.innerHTML = `<p>Сид: <strong>${seed}</strong></p>`;
    resultDiv.appendChild(img);
  };

  img.onerror = () => {
    resultDiv.innerHTML = 'Ошибка при загрузке изображения.';
  };
}
