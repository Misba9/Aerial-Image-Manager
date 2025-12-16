(() => {
  const qs = (id) => document.getElementById(id);

  const els = {};

  const state = {
    src: '',
    items: [],
    lang: 'en',
    page: 1,
    pageSize: 12,
    imageCount: 0,
    output: '',
    lastOutput: '',
    busy: false,
    folderSelected: false,
    previewReady: false,
    renameApplied: false
  };

  const log = (msg, level = 'info') => {
    if (!els.statusLog) return;
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    els.statusLog.appendChild(line);
    els.statusLog.scrollTop = els.statusLog.scrollHeight;
  };

  const showToast = (message, type = 'info') => {
    const container = els.toastContainer;
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3200);
  };

  const setDisabled = (disabled) => {
    state.busy = disabled;
    [els.pickSrcTop, els.previewBtn, els.runBtn, els.undoBtn].forEach((btn) => {
      if (btn) btn.disabled = disabled;
    });
  };

  const updateButtons = () => {
    const hasFolder = state.folderSelected && Boolean(state.src);
    const hasImages = state.imageCount > 0;
    const patternValue = (els.pattern.value || '').trim();
    const patternValid = patternValue ? validatePattern(patternValue, true) : true; // Allow empty pattern initially

    const canPreview = !state.busy && hasFolder && hasImages;
    const canRun = !state.busy && state.previewReady && hasFolder && hasImages && patternValue && validatePattern(patternValue, true);
    const canUndo = !state.busy && state.renameApplied;

    if (els.previewBtn) els.previewBtn.disabled = !canPreview;
    if (els.runBtn) els.runBtn.disabled = !canRun;
    if (els.undoBtn) els.undoBtn.disabled = !canUndo;
  };

  const setButtonLoading = (btn, loading, label) => {
    if (!btn) return;
    if (!btn.dataset.original) {
      btn.dataset.original = label || btn.textContent || '';
    }
    btn.classList.toggle('loading', loading);
    btn.textContent = loading ? 'Working...' : btn.dataset.original;
  };

  const readForm = () => ({
    pattern: (els.pattern.value || '').trim(),
    startFlight: Number(els.startFlight.value || 1),
    startImage: Number(els.startImage.value || 1),
    prefix: (els.prefix.value || '').trim(),
    suffix: (els.suffix.value || '').trim(),
    includeOriginal: !!els.includeOriginal.checked,
    includeTimestamp: !!els.includeTimestamp.checked
  });

  const validatePattern = (pattern, silent = false) => {
    if (!pattern) {
      if (!silent) {
        log('Pattern is required.', 'error');
        showToast('Pattern is required', 'error');
      }
      return false;
    }
    
    // Check if pattern matches the specific Flight_##_#### format (with or without .jpg extension)
    const flightPatternRegex = /^Flight_##_####(?:\.jpg)?$/i;
    if (flightPatternRegex.test(pattern)) {
      return true;
    }
    
    // For backward compatibility, also allow the general pattern validation
    const groups = [...pattern.matchAll(/#+/g)].map((m) => m[0]);
    if (groups.length < 2) {
      if (!silent) {
        log('Pattern must include flight (##) and image (####) placeholders.', 'error');
        showToast('Pattern must include ## and #### placeholders', 'error');
      }
      return false;
    }
    if (groups[0].length < 2 || groups[1].length < 4) {
      if (!silent) {
        log('Flight placeholder should be at least 2 # and image at least 4 #.', 'error');
        showToast('Use ## for flight and #### for image', 'error');
      }
      return false;
    }
    return true;
  };

  const renderPreview = () => {
    const items = state.items || [];
    const total = items.length;
    if (els.fileCount) els.fileCount.textContent = total;
    if (els.previewList) els.previewList.innerHTML = '';
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(total, start + state.pageSize);
    if (total === 0) {
      if (els.emptyState) els.emptyState.style.display = 'block';
      if (els.pageInfo) els.pageInfo.textContent = 'Page 0 of 0';
      if (els.prevPage) els.prevPage.disabled = true;
      if (els.nextPage) els.nextPage.disabled = true;
      return;
    }
    if (els.emptyState) els.emptyState.style.display = 'none';
    const frag = document.createDocumentFragment();
    items.slice(start, end).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'table-row';
      const colA = document.createElement('span');
      colA.textContent = item.originalName || '';
      const colB = document.createElement('span');
      // Only show newName if preview is ready, otherwise show empty string
      colB.textContent = state.previewReady ? (item.newName || '') : '';
      const colC = document.createElement('span');
      colC.textContent = item.flightNumber ?? '';
      const colD = document.createElement('span');
      colD.textContent = item.imageNumber ?? '';
      row.appendChild(colA);
      row.appendChild(colB);
      row.appendChild(colC);
      row.appendChild(colD);
      frag.appendChild(row);
    });
    if (els.previewList) els.previewList.appendChild(frag);
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (els.pageInfo) els.pageInfo.textContent = `Page ${state.page} of ${pages}`;
    if (els.prevPage) els.prevPage.disabled = state.page <= 1;
    if (els.nextPage) els.nextPage.disabled = state.page >= pages;
  };

  const selectFolder = async () => {
    const res = await (window.api?.selectFolder?.() || Promise.resolve(null));
    if (!res || !res.path) {
      log('Source selection cancelled', 'info');
      return;
    }
    state.src = res.path;
    if (els.selectedLabel) els.selectedLabel.textContent = res.path;
    state.folderSelected = true;
    state.previewReady = false;
    state.renameApplied = false;
    if (els.folderStatus) {
      els.folderStatus.textContent = 'Folder loaded';
      els.folderStatus.className = 'status-badge status-ready';
    }
    log(`Source selected: ${res.path}`, 'info');
    showToast('Folder selected', 'success');
    await scanImages();
    updateButtons();
  };


  const scanImages = async () => {
    if (!state.src) return;
    try {
      const res = await window.api.renameFlightImages({ mode: 'scan', source: state.src, options: {} });
      if (!res || res.ok === false) {
        log(res?.error || 'Scan failed', 'error');
        state.items = [];
        state.imageCount = 0;
        state.previewReady = false;
        renderPreview();
        return;
      }
      const data = res.data || res;
      state.items = data.files || [];
      state.imageCount = state.items.length;
      state.page = 1;
      state.previewReady = false;
      state.renameApplied = false;
      renderPreview();
      log(`Found ${state.imageCount} images`, 'info');
      showToast(`Found ${state.imageCount} images`, 'success');
      if (els.folderStatus) {
        els.folderStatus.textContent = state.imageCount ? 'Ready' : 'No images found';
        els.folderStatus.className = state.imageCount
          ? 'status-badge status-ready'
          : 'status-badge status-warning';
      }
      updateButtons();
    } catch (err) {
      log(err.message || 'Scan failed', 'error');
      showToast('Scan failed', 'error');
      state.previewReady = false;
      updateButtons();
    }
  };

  const initLang = () => {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang') === 'ar' ? 'ar' : 'en';
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'ar') {
      document.body.style.textAlign = 'right';
    } else {
      document.body.style.textAlign = 'left';
    }
    if (els.langEn && els.langAr) {
      els.langEn.classList.toggle('primary', lang === 'en');
      els.langAr.classList.toggle('primary', lang === 'ar');
    }
  };

  const callRename = async (mode, payload) => {
    // Use the legacy api.renameFlightImages for all operations
    if (window.api?.renameFlightImages) {
      return window.api.renameFlightImages(payload);
    }
    throw new Error('Rename API not available');
  };

  const runAction = async (mode) => {
    if (!state.src) {
      log('Select a source folder first.', 'error');
      showToast('Select a source folder first', 'error');
      return;
    }
    const options = readForm();
    if (!validatePattern(options.pattern)) {
      return;
    }
    if (mode === 'execute' && !state.previewReady) {
      log('Generate a preview before applying rename.', 'error');
      showToast('Preview first, then apply rename', 'warning');
      updateButtons();
      return;
    }
    if (mode === 'execute') {
      // Automatically set output to 'renamed' folder within source folder
      // Use forward slash for cross-platform compatibility
      state.output = `${state.src}/renamed`;
    }
    if (mode === 'undo') {
      if (!state.lastOutput) {
        log('No previous operation to undo.', 'error');
        showToast('No previous operation to undo', 'warning');
        return;
      }
    }
    setDisabled(true);
    const btn = mode === 'preview' ? els.previewBtn : mode === 'undo' ? els.undoBtn : els.runBtn;
    setButtonLoading(btn, true, btn?.textContent);
    try {
      const payload = {
        mode,
        source: state.src,
        output: state.output || state.lastOutput || '',
        lang: state.lang,
        options
      };
      const res = await callRename(mode, payload);
      if (!res || res.ok === false) {
        log(res?.error || 'Operation failed', 'error');
        return;
      }
      const data = res.data || res;
      state.items = data.files || data.items || [];
      state.page = 1;
      renderPreview();
      if (mode === 'execute') {
        state.lastOutput = data.outputFolder || state.output || state.lastOutput;
        log(`Copied ${data.copied || 0} of ${data.processed || state.items.length}. Failed: ${data.failed || 0}`, 'success');
        showToast('Rename completed', 'success');
        if (Array.isArray(data.errors) && data.errors.length) {
          data.errors.slice(0, 10).forEach((e) => log(`Warning: ${e}`, 'error'));
        }
        state.previewReady = true; // keep preview as valid after execution
        state.renameApplied = true; // mark that rename was applied
        updateButtons(); // Update button states to enable undo
        
        // Open the renamed folder in file explorer
        const folderToOpen = state.lastOutput || state.output;
        if (folderToOpen && (window.electronAPI?.openFolder || window.api?.openFolder)) {
          const openFunc = window.electronAPI?.openFolder || window.api?.openFolder;
          openFunc(folderToOpen).catch(err => {
            console.error('Failed to open folder:', err);
            log('Failed to open folder: ' + (err.message || 'Unknown error'), 'error');
          });
        }
      } else if (mode === 'undo') {
        log(`Undo completed. Removed: ${data.removed || 0}`, 'success');
        showToast('Undo completed', 'success');
        state.renameApplied = false;
        updateButtons(); // Update button states to disable undo
      } else {
        log(`Preview ready for ${state.items.length} files.`, 'info');
        showToast('Preview generated', 'success');
        state.previewReady = true;
        state.renameApplied = false;
        // Re-render preview to show the new names
        renderPreview();
      }
    } catch (err) {
      log(err.message || 'Unexpected error', 'error');
      showToast('Operation failed', 'error');
    } finally {
      setButtonLoading(btn, false);
      setDisabled(false);
      updateButtons();
    }
  };

  const handlePreview = () => {
    // Set a default pattern if none is provided for preview
    if (!(els.pattern.value || '').trim()) {
      els.pattern.value = 'Flight_##_####';
    }
    // Validate pattern before proceeding
    if (!validatePattern((els.pattern.value || '').trim(), false)) {
      return;
    }
    runAction('preview');
  };

  const handleApplyRename = () => {
    runAction('execute');
  };

  const handleUndo = () => {
    runAction('undo');
  };

  const bindEvents = () => {
    if (els.pickSrcTop) {
      els.pickSrcTop.addEventListener('click', (e) => {
        e.preventDefault();
        selectFolder();
      });
    }
    if (els.previewBtn) {
      els.previewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePreview();
      });
    }
    if (els.runBtn) {
      els.runBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleApplyRename();
      });
    }
    if (els.undoBtn) {
      els.undoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleUndo();
      });
    }
    if (els.prevPage) {
      els.prevPage.addEventListener('click', () => {
        if (state.page > 1) {
          state.page -= 1;
          renderPreview();
        }
      });
    }
    if (els.nextPage) {
      els.nextPage.addEventListener('click', () => {
        const pages = Math.max(1, Math.ceil((state.items || []).length / state.pageSize));
        if (state.page < pages) {
          state.page += 1;
          renderPreview();
        }
      });
    }
    if (els.langEn) {
      els.langEn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', 'en');
        window.location.href = url.toString();
      });
    }
    if (els.langAr) {
      els.langAr.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', 'ar');
        window.location.href = url.toString();
      });
    }

    // Invalidate preview when config changes
    [els.pattern, els.startFlight, els.startImage, els.prefix, els.suffix, els.includeOriginal, els.includeTimestamp].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => {
        state.previewReady = false;
        state.renameApplied = false;
        updateButtons();
      });
      input.addEventListener('change', () => {
        state.previewReady = false;
        state.renameApplied = false;
        updateButtons();
      });
    });
    
    // Set default pattern if none exists
    if (els.pattern && !(els.pattern.value || '').trim()) {
      els.pattern.value = 'Flight_##_####';
    }
    
    // Initial button state update
    setTimeout(updateButtons, 100);
    
    // Update buttons when pattern changes
    if (els.pattern) {
      els.pattern.addEventListener('input', updateButtons);
      els.pattern.addEventListener('change', updateButtons);
    }
    
    // Ensure pattern is always valid
    if (els.pattern) {
      // Validate pattern on blur
      els.pattern.addEventListener('blur', () => {
        const pattern = (els.pattern.value || '').trim();
        if (pattern && !validatePattern(pattern, true)) {
          // Reset to default if invalid
          els.pattern.value = 'Flight_##_####';
        }
        updateButtons();
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Cache elements after DOM is ready
    Object.assign(els, {
      lang: document.documentElement,
      langEn: qs('langEn'),
      langAr: qs('langAr'),
      folderStatus: qs('folderStatus'),
      selectedLabel: qs('selectedLabel'),
      pickSrcTop: qs('pickSrcTop'),
      pattern: qs('pattern'),
      startFlight: qs('startFlight'),
      startImage: qs('startImage'),
      prefix: qs('prefix'),
      suffix: qs('suffix'),
      includeOriginal: qs('includeOriginal'),
      includeTimestamp: qs('includeTimestamp'),
      previewBtn: qs('previewBtn'),
      runBtn: qs('runBtn'),
      undoBtn: qs('undoBtn'),
      previewList: qs('previewList'),
      emptyState: qs('emptyState'),
      fileCount: qs('fileCount'),
      statusLog: qs('statusLog'),
      pageInfo: qs('pageInfo'),
      prevPage: qs('prevPage'),
      nextPage: qs('nextPage'),
      toastContainer: qs('toastContainer')
    });

    initLang();
    bindEvents();
    renderPreview();
    updateButtons();
  });
})();