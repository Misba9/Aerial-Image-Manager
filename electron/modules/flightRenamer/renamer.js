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
    const patternValue = (els.pattern?.value || '').trim();

    const canPreview = !state.busy && hasFolder && hasImages;
    const canRun =
      !state.busy &&
      state.previewReady &&
      hasFolder &&
      hasImages &&
      patternValue &&
      validatePattern(patternValue, true);
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

  const readForm = () => {
    const flightValue = (els.startFlight?.value ?? '').trim();
    const flightNumber = flightValue === '' ? NaN : Number(flightValue);
    const startImageNumber = Number(els.startImage?.value || 1);
    return {
      pattern: (els.pattern?.value || '').trim(),
      flightNumber,
      startImageNumber,
      startFlight: flightNumber,
      startImage: startImageNumber,
      prefix: (els.prefix?.value || '').trim(),
      suffix: (els.suffix?.value || '').trim(),
      includeOriginal: !!els.includeOriginal?.checked,
      includeTimestamp: !!els.includeTimestamp?.checked
    };
  };

  const clearPreviewComputedFields = () => {
    state.items = (state.items || []).map((item) => ({
      ...item,
      newName: '',
      flightNumber: null,
      imageNumber: null
    }));
    state.previewReady = false;
    state.renameApplied = false;
    renderPreview();
  };

  const validatePattern = (pattern, silent = false) => {
    if (!pattern) {
      if (!silent) {
        log('Pattern is required.', 'error');
        showToast('Pattern is required', 'error');
      }
      return false;
    }
    const hasFlight = pattern.includes('##');
    const hasImage = pattern.includes('####');
    if (hasFlight && hasImage) return true;

    if (!silent) {
      log('Pattern must include ## (flight) and #### (image).', 'error');
      showToast('Pattern must include ## and #### placeholders', 'error');
    }
    return false;
  };

  const validateConfig = (options, silent = false) => {
    if (!validatePattern(options.pattern, silent)) return false;
    if (Number.isNaN(options.flightNumber)) {
      if (!silent) {
        log('Flight number is required.', 'error');
        showToast('Flight number is required', 'error');
      }
      return false;
    }
    if (!(options.startImageNumber > 0 && Number.isInteger(options.startImageNumber))) {
      if (!silent) {
        log('Start image number must be a positive integer.', 'error');
        showToast('Start image number must be a positive integer', 'error');
      }
      return false;
    }
    if (!state.imageCount || state.imageCount <= 0) {
      if (!silent) {
        log('No images found in folder.', 'error');
        showToast('Folder must contain images', 'error');
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
      console.log('[FlightRenamer] Scan found images:', state.imageCount, 'path:', state.src);
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
    if (window.api?.renameFlightImages) {
      return window.api.renameFlightImages(payload);
    }
    throw new Error('Rename API not available');
  };

  const confirmExecute = (count, pattern) => window.confirm(`Rename ${count} images using pattern ${pattern}?`);

  const runAction = async (mode) => {
    if (!state.src) {
      log('Select a source folder first.', 'error');
      showToast('Select a source folder first', 'error');
      return;
    }
    const options = readForm();
    if (!validateConfig(options)) {
      updateButtons();
      return;
    }

    if (mode === 'execute') {
      if (!state.previewReady) {
        log('Generate a preview before applying rename.', 'error');
        showToast('Preview first, then apply rename', 'warning');
        updateButtons();
        return;
      }
      if (!confirmExecute(state.imageCount, options.pattern)) {
        log('Rename cancelled by user.', 'info');
        return;
      }
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
        state.previewReady = true;
        state.renameApplied = true;
        updateButtons();

        const folderToOpen = state.lastOutput || state.output;
        if (folderToOpen && (window.electronAPI?.openFolder || window.api?.openFolder)) {
          const openFunc = window.electronAPI?.openFolder || window.api?.openFolder;
          openFunc(folderToOpen).catch((err) => {
            console.error('Failed to open folder:', err);
            log('Failed to open folder: ' + (err.message || 'Unknown error'), 'error');
          });
        }
      } else if (mode === 'undo') {
        log(`Undo completed. Removed: ${data.removed || 0}`, 'success');
        showToast('Undo completed', 'success');
        state.renameApplied = false;
        updateButtons();
      } else {
        log(`Preview ready for ${state.items.length} files.`, 'info');
        showToast('Preview generated', 'success');
        state.previewReady = true;
        state.renameApplied = false;
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
    if (!(els.pattern?.value || '').trim()) {
      els.pattern.value = 'Flight_##_####';
    }
    if (!validateConfig(readForm(), false)) {
      updateButtons();
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

    [els.pattern, els.startFlight, els.startImage, els.prefix, els.suffix, els.includeOriginal, els.includeTimestamp].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => {
        clearPreviewComputedFields();
        updateButtons();
      });
      input.addEventListener('change', () => {
        clearPreviewComputedFields();
        updateButtons();
      });
    });

    if (els.pattern && !(els.pattern.value || '').trim()) {
      els.pattern.value = 'Flight_##_####';
    }

    setTimeout(updateButtons, 100);

    if (els.pattern) {
      els.pattern.addEventListener('input', updateButtons);
      els.pattern.addEventListener('change', updateButtons);
    }

    if (els.pattern) {
      els.pattern.addEventListener('blur', () => {
        const pattern = (els.pattern.value || '').trim();
        if (pattern && !validatePattern(pattern, true)) {
          els.pattern.value = 'Flight_##_####';
        }
        updateButtons();
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
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

