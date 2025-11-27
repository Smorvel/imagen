let historyList = [];
    let currentHistoryPage = 1;
    const HISTORY_PAGE_SIZE = 12;
    const MAX_HISTORY = 100;
    let isGenerating = false;
    let uploadedImageUrl = null;

    // API credentials
    const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';
    const POLLINATIONS_TOKEN = 'Nw4HL4pP4pKfKD_0';

    // IndexedDB setup
    const DB_NAME = "aiImageGenDB";
    const STORE_NAME = "history";
    const DB_VERSION = 1;
    let db = null;

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

    async function addToHistoryDB(item) {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      let all = await loadHistoryFromDB();
      if (all.length > MAX_HISTORY) {
        const idsToDelete = all.slice(MAX_HISTORY).map(x => x.id);
        const txDel = db.transaction(STORE_NAME, "readwrite");
        const storeDel = txDel.objectStore(STORE_NAME);
        idsToDelete.forEach(id => storeDel.delete(id));
        await new Promise((resolve, reject) => {
          txDel.oncomplete = resolve;
          txDel.onerror = () => reject(txDel.error);
        });
        all = all.slice(0, MAX_HISTORY);
      }
      historyList = all;
      renderHistory();
    }

    async function removeFromHistoryDB(id) {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      historyList = await loadHistoryFromDB();
      renderHistory();
    }

    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function getRandomSeed() {
      const length = Math.floor(Math.random() * 10) + 1;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const digits = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
      return sign * parseInt(digits, 10);
    }

    async function translateIfCyrillic(text) {
      if (!/[А-Яа-яЁё]/.test(text)) {
        // Если текст не содержит кириллицу, добавляем дополнения и возвращаем
        return addEnhancementsToPrompt(text);
      }
      
      // Сначала пробуем использовать Pollinations API
      try {
        // Создаем промис с таймаутом для Pollinations API
        const pollinationsPromise = new Promise(async (resolve, reject) => {
          try {
            const pollinationsUrl = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=gpt-5-nano&private=true&system=You%20are%20a%20translator.%20Any%20text%20that%20is%20sent%20to%20you%20must%20be%20replied%20to%20in%20English,%20only%20the%20translated%20text`;
            
            const response = await fetch(pollinationsUrl);
            if (!response.ok) {
              throw new Error(`Pollinations API returned status ${response.status}`);
            }
            
            const translatedText = await response.text();
            if (translatedText && translatedText.trim()) {
              // Добавляем дополнения к переведенному тексту
              resolve(addEnhancementsToPrompt(translatedText.trim()));
            } else {
              throw new Error('Empty response from Pollinations API');
            }
          } catch (error) {
            reject(error);
          }
        });
        
        // Устанавливаем таймаут в 5 секунд
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Pollinations API timeout')), 5000);
        });
        
        // Используем Promise.race для ограничения времени ожидания
        const translatedText = await Promise.race([pollinationsPromise, timeoutPromise]);
        return translatedText;
        
      } catch (e) {
        console.log('Pollinations API error, falling back to Google Translate:', e);
        // Если произошла ошибка, продолжаем с Google Translate
      }
      
      // Запасной вариант - Google Translate
      try {
        const res = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=${encodeURIComponent(text)}`
        );
        if (!res.ok) return addEnhancementsToPrompt(text);
        const data = await res.json();
        const translatedText = data[0].map(part => part[0]).join(" ").trim();
        // Добавляем дополнения к переведенному тексту
        return addEnhancementsToPrompt(translatedText);
      } catch (e) {
        // В случае ошибки добавляем дополнения к исходному тексту
        return addEnhancementsToPrompt(text);
      }
    }
    
    // Функция для добавления дополнений к промту
    function addEnhancementsToPrompt(text) {
      if (selectedEnhancements.length === 0) return text;
      
      // Сортируем опции по приоритету
      const sortedEnhancements = [...selectedEnhancements].sort((a, b) => {
        const priorityA = enhancementPriorities[a] || 999;
        const priorityB = enhancementPriorities[b] || 999;
        return priorityA - priorityB;
      });
      
      const enhancementsText = sortedEnhancements.join(', ');
      return `${text}, ${enhancementsText}`;
    }

   async function uploadImageToFreeImage(file) {
  const formData = new FormData();
  formData.append('image', await toBase64(file));
  formData.append('key', 'd9daeb246323e313f85f0251d51083c5');
  formData.append('expiration', '300'); // удаление в секундах

  try {
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data && data.data.url) {
      return data.data.url;
    } else {
      throw new Error(data.error?.message || 'Ошибка загрузки изображения');
    }
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

    function buildImageUrl(prompt, seed, enhance = false, imageUrl = null) {
      const encoded = encodeURIComponent(prompt);
      let url;
      
      if (imageUrl) {
        // Using kontext model with uploaded image
        url = `https://image.pollinations.ai/prompt/${encoded}?private=true&nologo=true&enhance=${enhance}&model=kontext&transparent=true&token=${POLLINATIONS_TOKEN}&seed=${seed}&image=${encodeURIComponent(imageUrl)}`;
      } else {
        // Regular generation
        url = `https://enter.pollinations.ai/api/generate/image/${encoded}?model=flux&seed=${seed}&nologo=true&private=true`;
        if (enhance) url += "&key=plln_pk_DSf8DvxaLKn2LbP9QQAlA5hFpQGXePYiSY1AHZQn2CiKgtO7VBKQ1FNw1xCEpRYK&enhance=true";
      }
      
      return url;
    }

    function showLoader() {
      const resultArea = document.getElementById('resultArea');
      resultArea.classList.add('loading');
      resultArea.innerHTML = `
        <div class="loader"></div>
        <p>Генерируем изображение...</p>
      `;
    }

    function showError(message) {
      const resultArea = document.getElementById('resultArea');
      resultArea.classList.remove('loading');
      resultArea.innerHTML = `
        <div class="empty-state">
          <div class="icon">❌</div>
          <p>${message}</p>
        </div>
      `;
    }

    async function showImage(url, seed, prompt, enhanced = false, sourceImageUrl = null, translatedPrompt = null) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Не удалось загрузить изображение");
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const base64 = await blobToBase64(blob);

        const resultArea = document.getElementById('resultArea');
        resultArea.classList.remove('loading');
        resultArea.innerHTML = `
          <div class="result-actions">
            <button class="action-btn" id="downloadBtn" title="Скачать">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </button>
            <button class="action-btn" id="enhanceBtn" title="Улучшить" ${enhanced ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="20" height="20" viewBox="0 0 512 512">
                <path d="M512 144.515C512 83.329 397.403 33.71 256 33.71 114.62 33.71 0 83.33 0 144.515c0 35.481 38.657 66.98 98.574 87.269-8.485 86.498-17.61 183.189-18.322 185.368 0 6.886 30.552 61.138 175.748 61.138 145.195 0 175.77-54.253 175.77-61.138-.663-2.002-8.271-80.289-16.045-161.406-28.276 4.646-58.898 7.229-90.943 7.229-34.556 0-67.478-3.011-97.532-8.39 9.434.461 19.008.746 28.75.746 141.403 0 256-49.62 256-110.816zm-389.725-3.533c0-25.822 59.87-46.763 133.725-46.763 73.854 0 133.748 20.94 133.748 46.763 0 25.812-59.894 46.764-133.748 46.764-73.855 0-133.725-20.952-133.725-46.764z" style="fill:#fff"/>
              </svg>
            </button>
          </div>
          <img src="${blobUrl}" alt="Generated image" class="result-image">
          <div class="result-info">
            <strong>Сид:</strong> ${seed}${enhanced ? ' (улучшено)' : ''}${sourceImageUrl ? ' (с изображением)' : ''}<br>
            <strong>Промт:</strong> ${translatedPrompt || prompt}
          </div>
        `;

        // Создаем безопасное имя файла из промта
        const safeFileName = (translatedPrompt || prompt).replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 30);

        // Add event listeners
        document.getElementById('downloadBtn').onclick = () => {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${safeFileName}-${seed}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        if (!enhanced) {
          document.getElementById('enhanceBtn').onclick = async () => {
            const enhancedUrl = buildImageUrl(translatedPrompt || prompt, seed, true, sourceImageUrl);
            showLoader();
            await showImage(enhancedUrl, seed, prompt, true, sourceImageUrl, translatedPrompt);
          };
        }

        // Save to history
        const item = {
          id: Date.now(),
          url,
          seed,
          prompt,
          translatedPrompt,
          enhanced,
          sourceImageUrl,
          data: base64,
          timestamp: new Date().toISOString()
        };
        
        await addToHistoryDB(item);

      } catch (error) {
        showError("Ошибка при загрузке изображения");
      }
    }

    function loadImageFromHistory(item) {
      const resultArea = document.getElementById('resultArea');
      
      // Преобразуем base64 в Blob URL
      const blob = dataURItoBlob(`data:image/png;base64,${item.data}`);
      const blobUrl = URL.createObjectURL(blob);
      
      resultArea.classList.remove('loading');
      resultArea.innerHTML = `
        <div class="result-actions">
          <button class="action-btn" id="downloadBtn" title="Скачать">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </button>
          <button class="action-btn" id="enhanceBtn" title="Улучшить" ${item.enhanced ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="20" height="20" viewBox="0 0 512 512">
              <path d="M512 144.515C512 83.329 397.403 33.71 256 33.71 114.62 33.71 0 83.33 0 144.515c0 35.481 38.657 66.98 98.574 87.269-8.485 86.498-17.61 183.189-18.322 185.368 0 6.886 30.552 61.138 175.748 61.138 145.195 0 175.77-54.253 175.77-61.138-.663-2.002-8.271-80.289-16.045-161.406-28.276 4.646-58.898 7.229-90.943 7.229-34.556 0-67.478-3.011-97.532-8.39 9.434.461 19.008.746 28.75.746 141.403 0 256-49.62 256-110.816zm-389.725-3.533c0-25.822 59.87-46.763 133.725-46.763 73.854 0 133.748 20.94 133.748 46.763 0 25.812-59.894 46.764-133.748 46.764-73.855 0-133.725-20.952-133.725-46.764z" style="fill:#fff"/>
            </svg>
          </button>
        </div>
        <img src="${blobUrl}" alt="Generated image" class="result-image">
        <div class="result-info">
          <strong>Сид:</strong> ${item.seed}${item.enhanced ? ' (улучшено)' : ''}${item.sourceImageUrl ? ' (с изображением)' : ''}<br>
          <strong>Промт:</strong> ${item.translatedPrompt || item.prompt}
        </div>
      `;

      // Update form fields
      document.getElementById('prompt').value = item.translatedPrompt || item.prompt;
      document.getElementById('seed').value = item.seed;
      
      // Сбрасываем выбранные опции дополнения
      selectedEnhancements = [];
      document.querySelectorAll('.enhance-option').forEach(option => {
        option.classList.remove('selected');
      });
      updateEnhanceCount();
      saveEnhancements();

      // Создаем безопасное имя файла из промта
      const safeFileName = (item.translatedPrompt || item.prompt).replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 30);

      // Add event listeners
      document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${safeFileName}-${item.seed}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      if (!item.enhanced) {
        document.getElementById('enhanceBtn').onclick = async () => {
          const enhancedUrl = buildImageUrl(item.translatedPrompt || item.prompt, item.seed, true, item.sourceImageUrl);
          showLoader();
          await showImage(enhancedUrl, item.seed, item.prompt, true, item.sourceImageUrl, item.translatedPrompt);
        };
      }

      // Scroll to result
      resultArea.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Функция для преобразования Data URI в Blob
    function dataURItoBlob(dataURI) {
      const byteString = atob(dataURI.split(',')[1]);
      const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    }

    // Хранилище для Blob URL изображений истории
    let historyBlobUrls = [];
    
    function renderHistory() {
      const historyGrid = document.getElementById('historyGrid');
      const pagination = document.getElementById('pagination');
      
      // Освобождаем предыдущие Blob URL
      historyBlobUrls.forEach(url => URL.revokeObjectURL(url));
      historyBlobUrls = [];
      
      if (historyList.length === 0) {
        historyGrid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="icon">📸</div>
            <p>История пуста. Сгенерируйте первое изображение!</p>
          </div>
        `;
        pagination.innerHTML = '';
        return;
      }

      const totalPages = Math.ceil(historyList.length / HISTORY_PAGE_SIZE);
      currentHistoryPage = Math.min(currentHistoryPage, Math.max(1, totalPages));

      const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
      const end = start + HISTORY_PAGE_SIZE;
      const pageItems = historyList.slice(start, end);
      
      // Создаем Blob URLs для каждого элемента истории
      const itemsWithBlobUrls = pageItems.map(item => {
        const blob = dataURItoBlob(`data:image/png;base64,${item.data}`);
        const blobUrl = URL.createObjectURL(blob);
        historyBlobUrls.push(blobUrl);
        return { ...item, blobUrl };
      });

      historyGrid.innerHTML = itemsWithBlobUrls.map(item => `
        <div class="history-item" onclick="loadImageFromHistory(${JSON.stringify(item).replace(/"/g, '&quot;')})">
          <button class="delete-btn" onclick="event.stopPropagation(); removeFromHistoryDB(${item.id})">×</button>
          <img src="${item.blobUrl}" alt="Generated image">
          <div class="history-item-info">
            <div class="history-item-prompt">${item.translatedPrompt || item.prompt}</div>
            <div>Сид: ${item.seed}${item.enhanced ? ' (улучшено)' : ''}${item.sourceImageUrl ? ' (с изображением)' : ''}</div>
          </div>
        </div>
      `).join('');

      // Render pagination
      if (totalPages > 1) {
        const paginationButtons = [];
        for (let i = 1; i <= totalPages; i++) {
          paginationButtons.push(`
            <button class="${i === currentHistoryPage ? 'active' : ''}" onclick="currentHistoryPage = ${i}; renderHistory()">
              ${i}
            </button>
          `);
        }
        pagination.innerHTML = paginationButtons.join('');
      } else {
        pagination.innerHTML = '';
      }
    }

    function showImagePreview(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const previewContainer = document.getElementById('imagePreview');
        previewContainer.innerHTML = `
          <div class="image-preview-container">
            <img id="previewImg" src="${e.target.result}" alt="Preview">
            <div class="image-preview-overlay">
              <button class="remove-image-btn" id="removeImage" title="Удалить изображение">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="image-preview-info">Изображение добавлено</div>
        `;
        previewContainer.style.display = 'block';
        
        // Добавляем обработчик для кнопки удаления
        document.getElementById('removeImage').addEventListener('click', removeImagePreview);
      }
      reader.readAsDataURL(file);
      uploadedFile = file;
    }

    function removeImagePreview() {
      const preview = document.getElementById('imagePreview');
      const fileInput = document.getElementById('imageUpload');
      
      preview.innerHTML = '';
      preview.style.display = 'none';
      fileInput.value = '';
      uploadedFile = null;
      uploadedImageUrl = null;
    }

    // Main generation function
    async function generateImage() {
      if (isGenerating) return;
      
      let promptText = document.getElementById('prompt').value.trim();
      if (!promptText) {
        alert('Пожалуйста, введите описание изображения');
        return;
      }
      
      // Сохраняем выбранные опции, но не добавляем их к промту сразу
      // Они будут добавлены после перевода

      isGenerating = true;
      const generateBtn = document.getElementById('generateBtn');
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span>Генерируем...</span>';

      try {
        const seed = document.getElementById('seed').value.trim() || getRandomSeed();
        const translatedPrompt = await translateIfCyrillic(promptText);
        
        // Check if there's an uploaded image
        const fileInput = document.getElementById('imageUpload');
        let sourceImageUrl = uploadedImageUrl;
        
        if (fileInput.files.length > 0 && !sourceImageUrl) {
          // Upload image first
          generateBtn.innerHTML = '<span>Загружаем изображение...</span>';
          sourceImageUrl = await uploadImageToFreeImage(fileInput.files[0]);
          uploadedImageUrl = sourceImageUrl;
        }
        
        generateBtn.innerHTML = '<span>Генерируем...</span>';
        const imageUrl = buildImageUrl(translatedPrompt, seed, false, sourceImageUrl);
        
        showLoader();
        await showImage(imageUrl, seed, promptText, false, sourceImageUrl, translatedPrompt);
        
      } catch (error) {
        console.error('Generation error:', error);
        showError(error.message || "Произошла ошибка при генерации");
      } finally {
        isGenerating = false;
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span>Сгенерировать</span>';
      }
    }

    // Переменные для функционала дополнения промта
    let selectedEnhancements = [];
    
    // Приоритеты для опций дополнения (меньшее число = более высокий приоритет)
    // Теперь приоритеты считываются из HTML-атрибутов data-priority
    let enhancementPriorities = {};
    
    // Функция для обновления счетчика выбранных опций
    function updateEnhanceCount() {
      const countElement = document.querySelector('.enhance-count');
      countElement.textContent = selectedEnhancements.length;
    }
    
    // Функция для сохранения выбранных опций в localStorage
    function saveEnhancements() {
      localStorage.setItem('selectedEnhancements', JSON.stringify(selectedEnhancements));
    }
    
    // Функция для загрузки выбранных опций из localStorage
    function loadEnhancements() {
      // Загружаем приоритеты из HTML-атрибутов
      document.querySelectorAll('.enhance-option').forEach(option => {
        const value = option.getAttribute('data-value');
        const priority = parseInt(option.getAttribute('data-priority') || '999', 10);
        enhancementPriorities[value] = priority;
      });
      
      const saved = localStorage.getItem('selectedEnhancements');
      if (saved) {
        selectedEnhancements = JSON.parse(saved);
        updateEnhanceCount();
        
        // Отметить сохраненные опции как выбранные
        document.querySelectorAll('.enhance-option').forEach(option => {
          const value = option.getAttribute('data-value');
          if (selectedEnhancements.includes(value)) {
            option.classList.add('selected');
          }
        });
      }
    }
    
    // Event listeners
    document.getElementById('generateBtn').addEventListener('click', generateImage);
    
    document.getElementById('prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        generateImage();
      }
    });
    
    // Обработчик для кнопки дополнения промта
    document.getElementById('enhancePromptBtn').addEventListener('click', function() {
      const menu = document.getElementById('enhanceMenu');
      menu.classList.toggle('active');
      
      // Закрытие меню при клике вне его
      function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== document.getElementById('enhancePromptBtn')) {
          menu.classList.remove('active');
          document.removeEventListener('click', closeMenu);
        }
      }
      
      // Добавляем обработчик с небольшой задержкой, чтобы избежать срабатывания при открытии
      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 100);
    });
    
    // Обработчик для опций дополнения
    document.querySelectorAll('.enhance-option').forEach(option => {
      option.addEventListener('click', function() {
        const value = this.getAttribute('data-value');
        
        if (this.classList.contains('selected')) {
          // Если опция уже выбрана, удаляем её
          this.classList.remove('selected');
          selectedEnhancements = selectedEnhancements.filter(item => item !== value);
        } else {
          // Иначе добавляем
          this.classList.add('selected');
          selectedEnhancements.push(value);
        }
        
        updateEnhanceCount();
        saveEnhancements();
      });
    });
    
    // Обработчик для кнопки сброса
    document.getElementById('resetEnhanceBtn').addEventListener('click', function() {
      selectedEnhancements = [];
      document.querySelectorAll('.enhance-option').forEach(option => {
        option.classList.remove('selected');
      });
      updateEnhanceCount();
      saveEnhancements();
    });

    // Обработчик для кнопки референса
    document.getElementById('referenceBtn').addEventListener('click', function() {
      document.getElementById('imageUpload').click();
    });
    
    // Обработчик изменения файла
    document.getElementById('imageUpload').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        handleImageFile(file);
      }
    });
    
    // Обработчик для удаления изображения
    document.getElementById('removeImage').addEventListener('click', removeImagePreview);
    
    // Функция для обработки файла изображения
    function handleImageFile(file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения');
        document.getElementById('imageUpload').value = '';
        return;
      }
      
      // Check file size (limit to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Размер файла не должен превышать 10MB');
        document.getElementById('imageUpload').value = '';
        return;
      }
      
      showImagePreview(file);
      uploadedImageUrl = null; // Reset uploaded URL when new file is selected
    }
    
    // Добавляем поддержку drag-and-drop для загрузки изображений
    document.addEventListener('DOMContentLoaded', function() {
      const dropZone = document.body;
      
      // Предотвращаем стандартное поведение браузера при перетаскивании файлов
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
      });
      
      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Подсветка при перетаскивании
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
      });
      
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
      });
      
      function highlight() {
        dropZone.classList.add('drag-highlight');
      }
      
      function unhighlight() {
        dropZone.classList.remove('drag-highlight');
      }
      
      // Обработка сброшенных файлов
      dropZone.addEventListener('drop', handleDrop, false);
      
      function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (file && file.type.startsWith('image/')) {
          handleImageFile(file);
          
          // Загружаем изображение на хостинг сразу после добавления через drag-and-drop
          // чтобы оно было готово к использованию при генерации
          (async function() {
            try {
              const uploadBtn = document.getElementById('generateBtn');
              const originalText = uploadBtn.innerHTML;
              uploadBtn.innerHTML = '<span>Загружаем изображение...</span>';
              uploadBtn.disabled = true;
              
              uploadedImageUrl = await uploadImageToFreeImage(file);
              
              uploadBtn.innerHTML = originalText;
              uploadBtn.disabled = false;
              
              // Обновляем информацию в превью
              const previewInfo = document.querySelector('.image-preview-info');
              if (previewInfo) {
                previewInfo.textContent = 'Изображение загружено и готово к использованию';
              }
            } catch (error) {
              console.error('Ошибка при загрузке изображения:', error);
              alert('Не удалось загрузить изображение. Пожалуйста, попробуйте еще раз.');
              
              const uploadBtn = document.getElementById('generateBtn');
              uploadBtn.innerHTML = '<span>Сгенерировать</span>';
              uploadBtn.disabled = false;
            }
          })();
        }
      }
    });

    // Функция для улучшения промта через Pollinations API
    async function improvePrompt(prompt) {
      try {
        const seed = getRandomSeed();
        const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=gpt-5-nano&seed=${seed}&private=true&system=You%20are%20an%20image%20generation%20improver.%20Send%20any%20text%20sent%20to%20you%20in%20an%20improved%20form%20for%20image%20generation.%20Send%20your%20reply%20in%20the%20same%20language%20in%20which%20the%20text%20was%20sent%20to%20you.%20One%20ready-made%20improved%20prompt%20at%20a%20time.`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Ошибка API: ${response.status}`);
        }
        
        const improvedPrompt = await response.text();
        return improvedPrompt.trim();
      } catch (error) {
        console.error('Ошибка при улучшении промта:', error);
        throw error;
      }
    }
    
    // Initialize
    window.addEventListener('DOMContentLoaded', async () => {
      historyList = await loadHistoryFromDB();
      renderHistory();
      loadEnhancements(); // Загружаем сохраненные опции дополнения промта
      
      // Ограничиваем ввод сида только цифрами
      const seedInput = document.getElementById('seed');
      seedInput.addEventListener('input', function() {
        // Удаляем все нецифровые символы
        this.value = this.value.replace(/[^\d-]/g, '');
        
        // Проверяем, что значение находится в допустимых пределах
        const numValue = parseInt(this.value, 10);
        if (!isNaN(numValue)) {
          if (numValue > 999999999999999) {
            this.value = '999999999999999';
          } else if (numValue < -999999999999999) {
            this.value = '-999999999999999';
          }
        }
      });
      
      // Обработчик для кнопки дайса (генерация случайного сида)
      document.getElementById('diceBtn').addEventListener('click', function() {
        document.getElementById('seed').value = getRandomSeed();
      });
      
      // Обработчик для кнопки улучшения промта
      const improvePromptBtn = document.getElementById('improvePromptBtn');
      const promptInput = document.getElementById('prompt');
      
      // Активируем кнопку улучшения промта только если есть хотя бы 5 символов
      // и автоматически расширяем поле промта при вводе текста
      promptInput.addEventListener('input', function() {
        improvePromptBtn.disabled = this.value.trim().length < 5;
        
        // Автоматическое расширение поля промта
        this.style.height = 'auto';
        const newHeight = Math.min(this.scrollHeight, 450);
        this.style.height = newHeight + 'px';
      });
      
      // Обработчик нажатия на кнопку улучшения промта
      improvePromptBtn.addEventListener('click', async function() {
        const promptText = promptInput.value.trim();
        if (promptText.length < 5) return;
        
        try {
          improvePromptBtn.disabled = true;
          improvePromptBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 44 44"><circle cx="22" cy="22" r="6" fill="none" stroke="#60A5FA" stroke-width="2"><animate attributeName="r" from="6" to="20" dur="1.5s" begin="0s" repeatCount="indefinite"></animate><animate attributeName="opacity" from="1" to="0" dur="1.5s" begin="0s" repeatCount="indefinite"></animate></circle><circle cx="22" cy="22" r="6" fill="none" stroke="#60A5FA" stroke-width="2"><animate attributeName="r" from="6" to="20" dur="1.5s" begin="0.5s" repeatCount="indefinite"></animate><animate attributeName="opacity" from="1" to="0" dur="1.5s" begin="0.5s" repeatCount="indefinite"></animate></circle></svg>
          `;
          improvePromptBtn.title = "Улучшаем...";
          
          const improvedPrompt = await improvePrompt(promptText);
          promptInput.value = improvedPrompt;
          
        } catch (error) {
          console.error('Ошибка при улучшении промта:', error);
          alert('Не удалось улучшить промт. Пожалуйста, попробуйте еще раз.');
        } finally {
          improvePromptBtn.disabled = false;
          improvePromptBtn.innerHTML = `
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <g fill="#9c9c9c">
                  <path d="M3.84 3.84a2.88 2.88 0 0 0 0 4.08l1.6 1.59a.76.76 0 0 1 .03-.04l4-4a.77.77 0 0 1 .04-.04L7.92 3.84a2.88 2.88 0 0 0-4.08 0ZM10.57 6.49a.75.75 0 0 1-.04.04l-4 4a.75.75 0 0 1-.04.04l9.59 9.59a2.88 2.88 0 0 0 4.08-4.08l-9.6-9.59ZM16.1 2.3a.48.48 0 0 1 .9 0l.43 1.1c.05.13.15.23.27.28l1.1.43c.4.16.4.74 0 .9l-1.1.43a.48.48 0 0 0-.27.28L17 6.82a.48.48 0 0 1-.9 0l-.43-1.1a.48.48 0 0 0-.27-.28l-1.1-.43a.49.49 0 0 1 0-.9l1.1-.43a.48.48 0 0 0 .27-.28l.43-1.1ZM19.97 9.13a.48.48 0 0 1 .9 0l.15.4c.05.12.15.22.28.27l.4.16c.4.16.4.74 0 .9l-.4.16a.48.48 0 0 0-.28.27l-.15.4a.48.48 0 0 1-.9 0l-.16-.4a.48.48 0 0 0-.27-.27l-.4-.16a.49.49 0 0 1 0-.9l.4-.16a.48.48 0 0 0 .27-.27l.16-.4ZM5.13 15.3a.48.48 0 0 1 .9 0l.16.4c.05.13.15.23.27.28l.4.16c.4.16.4.74 0 .9l-.4.16a.48.48 0 0 0-.27.27l-.16.4a.48.48 0 0 1-.9 0l-.15-.4a.48.48 0 0 0-.28-.27l-.4-.16a.49.49 0 0 1 0-.9l.4-.16a.48.48 0 0 0 .28-.27l.15-.4Z"/>
                </g>
              </svg>
          `;
          improvePromptBtn.title = "Улучшить промт";
        }
      });
    });
    
    // Освобождаем Blob URLs при закрытии страницы
    window.addEventListener('beforeunload', () => {
      historyBlobUrls.forEach(url => URL.revokeObjectURL(url));
    });

    // Make functions globally available for onclick handlers
    window.loadImageFromHistory = loadImageFromHistory;
    window.removeFromHistoryDB = removeFromHistoryDB;
