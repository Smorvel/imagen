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
      if (!/[А-Яа-яЁё]/.test(text)) return text;
      try {
        const res = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=${encodeURIComponent(text)}`
        );
        if (!res.ok) return text;
        const data = await res.json();
        return data[0].map(part => part[0]).join(" ").trim();
      } catch (e) {
        return text;
      }
    }

    async function uploadImageToFreeImage(file) {
      const formData = new FormData();
      formData.append('key', FREEIMAGE_API_KEY);
      formData.append('action', 'upload');
      formData.append('source', file);
      formData.append('format', 'json');
      formData.append('expiration', '3600');

      try {
        const response = await fetch('https://corsproxy.io/?https://freeimage.host/api/1/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.image && data.image.url) {
          return data.image.url;
        } else {
          throw new Error(data.error?.message || 'Ошибка загрузки изображения');
        }
      } catch (error) {
        console.error('Upload error:', error);
        throw error;
      }
    }

    function buildImageUrl(prompt, seed, enhance = false, imageUrl = null) {
      const encoded = encodeURIComponent(prompt);
      let url;
      
      if (imageUrl) {
        // Using kontext model with uploaded image
        url = `https://image.pollinations.ai/prompt/${encoded}?private=true&nologo=true&enhance=${enhance}&model=kontext&transparent=true&token=${POLLINATIONS_TOKEN}&seed=${seed}&image=${encodeURIComponent(imageUrl)}`;
      } else {
        // Regular generation
        url = `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&nologo=true&private=true`;
        if (enhance) url += "&enhance=true";
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

    async function showImage(url, seed, prompt, enhanced = false, sourceImageUrl = null) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Не удалось загрузить изображение");
        
        const blob = await response.blob();
        const base64 = await blobToBase64(blob);
        const imgSrc = "data:image/png;base64," + base64;

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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          </div>
          <img src="${imgSrc}" alt="Generated image" class="result-image">
          <div class="result-info">
            <strong>Сид:</strong> ${seed}${enhanced ? ' (улучшено)' : ''}${sourceImageUrl ? ' (с изображением)' : ''}<br>
            <strong>Промт:</strong> ${prompt}
          </div>
        `;

        // Add event listeners
        document.getElementById('downloadBtn').onclick = () => {
          const a = document.createElement('a');
          a.href = imgSrc;
          a.download = `ai-image-${seed}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        if (!enhanced) {
          document.getElementById('enhanceBtn').onclick = async () => {
            const enhancedUrl = buildImageUrl(prompt, seed, true, sourceImageUrl);
            showLoader();
            await showImage(enhancedUrl, seed, prompt, true, sourceImageUrl);
          };
        }

        // Save to history
        const item = {
          id: Date.now(),
          url,
          seed,
          prompt,
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
      const imgSrc = `data:image/png;base64,${item.data}`;
      
      resultArea.classList.remove('loading');
      resultArea.innerHTML = `
        <div class="result-actions">
          <button class="action-btn" id="downloadBtn" title="Скачать">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </button>
          <button class="action-btn" id="enhanceBtn" title="Улучшить" ${item.enhanced ? 'disabled' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
        </div>
        <img src="${imgSrc}" alt="Generated image" class="result-image">
        <div class="result-info">
          <strong>Сид:</strong> ${item.seed}${item.enhanced ? ' (улучшено)' : ''}${item.sourceImageUrl ? ' (с изображением)' : ''}<br>
          <strong>Промт:</strong> ${item.prompt}
        </div>
      `;

      // Update form fields
      document.getElementById('prompt').value = item.prompt;
      document.getElementById('seed').value = item.seed;

      // Add event listeners
      document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = imgSrc;
        a.download = `ai-image-${item.seed}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      if (!item.enhanced) {
        document.getElementById('enhanceBtn').onclick = async () => {
          const enhancedUrl = buildImageUrl(item.prompt, item.seed, true, item.sourceImageUrl);
          showLoader();
          await showImage(enhancedUrl, item.seed, item.prompt, true, item.sourceImageUrl);
        };
      }

      // Scroll to result
      resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    function renderHistory() {
      const historyGrid = document.getElementById('historyGrid');
      const pagination = document.getElementById('pagination');
      
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

      historyGrid.innerHTML = pageItems.map(item => `
        <div class="history-item" onclick="loadImageFromHistory(${JSON.stringify(item).replace(/"/g, '&quot;')})">
          <button class="delete-btn" onclick="event.stopPropagation(); removeFromHistoryDB(${item.id})">×</button>
          <img src="data:image/png;base64,${item.data}" alt="Generated image">
          <div class="history-item-info">
            <div class="history-item-prompt">${item.prompt}</div>
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
      const preview = document.getElementById('imagePreview');
      const previewImg = document.getElementById('previewImg');
      
      const reader = new FileReader();
      reader.onload = function(e) {
        previewImg.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    function removeImagePreview() {
      const preview = document.getElementById('imagePreview');
      const previewImg = document.getElementById('previewImg');
      const fileInput = document.getElementById('imageUpload');
      
      preview.style.display = 'none';
      previewImg.src = '';
      fileInput.value = '';
      uploadedImageUrl = null;
    }

    // Main generation function
    async function generateImage() {
      if (isGenerating) return;
      
      const promptText = document.getElementById('prompt').value.trim();
      if (!promptText) {
        alert('Пожалуйста, введите описание изображения');
        return;
      }

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
        
        if (fileInput.files.length > 0 && !uploadedImageUrl) {
          // Upload image first
          generateBtn.innerHTML = '<span>Загружаем изображение...</span>';
          sourceImageUrl = await uploadImageToFreeImage(fileInput.files[0]);
          uploadedImageUrl = sourceImageUrl;
        }
        
        generateBtn.innerHTML = '<span>Генерируем...</span>';
        const imageUrl = buildImageUrl(translatedPrompt, seed, false, sourceImageUrl);
        
        showLoader();
        await showImage(imageUrl, seed, translatedPrompt, false, sourceImageUrl);
        
      } catch (error) {
        console.error('Generation error:', error);
        showError(error.message || "Произошла ошибка при генерации");
      } finally {
        isGenerating = false;
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span>Сгенерировать</span>';
      }
    }

    // Event listeners
    document.getElementById('generateBtn').addEventListener('click', generateImage);
    
    document.getElementById('prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        generateImage();
      }
    });

    document.getElementById('imageUpload').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Пожалуйста, выберите файл изображения');
          e.target.value = '';
          return;
        }
        
        // Check file size (limit to 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('Размер файла не должен превышать 10MB');
          e.target.value = '';
          return;
        }
        
        showImagePreview(file);
        uploadedImageUrl = null; // Reset uploaded URL when new file is selected
      }
    });

    document.getElementById('removeImage').addEventListener('click', removeImagePreview);

    // Initialize
    window.addEventListener('DOMContentLoaded', async () => {
      historyList = await loadHistoryFromDB();
      renderHistory();
    });

    // Make functions globally available for onclick handlers
    window.loadImageFromHistory = loadImageFromHistory;
    window.removeFromHistoryDB = removeFromHistoryDB;
