(() => {
  const qs = (id) => document.getElementById(id);

  const els = {
    langLabel: qs('langLabel'),
    selectFolderBtn: qs('selectFolderBtn'),
    scanBtn: qs('scanBtn'),
    rescanBtn: qs('rescanBtn'),
    exportCsvBtn: qs('exportCsvBtn'),
    importCsvBtn: qs('importCsvBtn'),
    folderLabel: qs('folderLabel'),
    recursiveToggle: qs('recursiveToggle'),
    progressLabel: qs('progressLabel'),
    progressMeta: qs('progressMeta'),
    progressBarFill: qs('progressBarFill'),
    progressCount: qs('progressCount'),
    progressPercent: qs('progressPercent'),
    statusLog: qs('statusLog'),
    statTotal: qs('statTotal'),
    statWithGps: qs('statWithGps'),
    statMissingGps: qs('statMissingGps'),
    statWritable: qs('statWritable'),
    searchInput: qs('searchInput'),
    imageGrid: qs('imageGrid'),
    filteredCount: qs('filteredCount'),
    metaFile: qs('metaFile'),
    metaStatus: qs('metaStatus'),
    metaLat: qs('metaLat'),
    metaLon: qs('metaLon'),
    metaAlt: qs('metaAlt'),
    metaTime: qs('metaTime'),
    metaCamera: qs('metaCamera'),
    metaDims: qs('metaDims'),
    metaWritable: qs('metaWritable'),
    metaCsv: qs('metaCsv'),
    toastContainer: qs('toastContainer')
  };

  const toFileUrl = (filePath) => {
    if (!filePath) return '';
    let p = filePath.replace(/\\/g, '/');
    if (!p.startsWith('/')) p = `/${p}`;
    const url = `file://${p}`;
    return encodeURI(url);
  };

  let thumbObserver = null;

  const ensureThumbObserver = () => {
    if (thumbObserver) return;
    thumbObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadThumb(entry.target);
            thumbObserver.unobserve(entry.target);
          }
        });
      },
      {
        root: els.imageGrid || null,
        rootMargin: '120px'
      }
    );
  };

  const loadThumb = (imgEl) => {
    const src = imgEl.dataset.src;
    if (!src) return;
    // Defer to next frame to avoid layout jank when many images attach
    requestAnimationFrame(() => {
      imgEl.src = src;
    });
    imgEl.onload = () => {
      imgEl.parentElement.classList.add('loaded');
    };
    imgEl.onerror = () => {
      imgEl.parentElement.classList.remove('loaded');
    };
  };

  /**
   * ImageModel
   * {
   *   filename: string,
   *   path: string,
   *   hasGps: boolean,
   *   latitude: number | null,
   *   longitude: number | null,
   *   altitude: number | null,
   *   writable: boolean,
   *   exifStatus: 'OK' | 'NO_EXIF' | 'READ_ONLY'
   * }
   */

  const state = {
    lang: 'en',
    folder: '',
    csv: '',
    items: [],
    filtered: [],
    selected: null,
    renderCount: 0,
    pageSize: 40,
    recursive: false,
    progressTicker: null,
    renderScheduled: false,
    imageCount: 0,
    scanInFlight: false
  };

  const setLangFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang') === 'ar' ? 'ar' : 'en';
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    // Only set text content if the element exists
    if (els.langLabel) {
      els.langLabel.textContent = lang.toUpperCase();
    }
  };

  const showToast = (message, type = 'info') => {
    if (!els.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  };

  const log = (message, level = 'info') => {
    if (!els.statusLog) return;
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    els.statusLog.appendChild(line);
    if (els.statusLog.scrollHeight) {
      els.statusLog.scrollTop = els.statusLog.scrollHeight;
    }
  };

  const setControlsDisabled = (disabled) => {
    [
      els.selectFolderBtn,
      els.scanBtn,
      els.rescanBtn,
      els.exportCsvBtn,
      els.importCsvBtn,
      els.recursiveToggle
    ].forEach((btn) => {
      if (btn) btn.disabled = disabled;
    });
  };

  const resetProgressBar = () => {
    setProgress('Idle', 'Awaiting input', 0);
    setProcessed(0, 0);
  };

  const startProgressTicker = () => {
    if (state.progressTicker) clearInterval(state.progressTicker);
    let value = 10;
    setProgress('Scanning', 'Processing 0 of 0 (0%)', value);
    state.progressTicker = setInterval(() => {
      value = Math.min(90, value + 5);
      setProgress('Scanning', 'Processing...', value);
    }, 500);
  };

  const stopProgressTicker = () => {
    if (state.progressTicker) {
      clearInterval(state.progressTicker);
      state.progressTicker = null;
    }
  };

  const setProgress = (label, meta, value) => {
    if (label && els.progressLabel) els.progressLabel.textContent = label;
    if (meta !== undefined && els.progressMeta) els.progressMeta.textContent = meta;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      const clamped = Math.min(100, Math.max(0, value));
      if (els.progressBarFill) els.progressBarFill.style.width = `${clamped}%`;
      if (els.progressPercent) {
        els.progressPercent.textContent = `${clamped}%`;
      }
    }
  };

  const setProcessed = (processed = 0, total = 0) => {
    if (els.progressCount) {
      const denom = total || processed;
      els.progressCount.textContent = `${processed} / ${denom} files`;
    }
  };

  const updateFolder = (path) => {
    state.folder = path || '';
    if (els.folderLabel) els.folderLabel.textContent = state.folder || 'No folder selected';
    if (els.scanBtn) els.scanBtn.disabled = !state.folder;
    if (els.rescanBtn) els.rescanBtn.disabled = !state.folder;
  };

  const updateCsvPath = (path) => {
    state.csv = path || '';
    if (els.metaCsv) els.metaCsv.textContent = state.csv || '—';
  };

  const computeStats = (items) => {
    const total = items.length;
    let withGps = 0;
    let writable = 0;
    items.forEach((item) => {
      if (item.hasGps) withGps += 1;
      if (item.writable) writable += 1;
    });
    return {
      total,
      withGps,
      missingGps: total - withGps,
      writable
    };
  };

  const renderStats = (items) => {
    const stats = computeStats(items);
    if (els.statTotal) els.statTotal.textContent = stats.total;
    if (els.statWithGps) els.statWithGps.textContent = stats.withGps;
    if (els.statMissingGps) els.statMissingGps.textContent = stats.missingGps;
    if (els.statWritable) els.statWritable.textContent = stats.writable;
  };

  const clearGrid = () => {
    state.renderCount = 0;
    if (els.imageGrid) els.imageGrid.innerHTML = '';
  };

  const updateFilteredCount = () => {
    if (els.filteredCount) els.filteredCount.textContent = state.filtered.length;
  };

  const applyFilter = () => {
    const term = els.searchInput ? (els.searchInput.value || '').trim().toLowerCase() : '';
    if (!term) {
      state.filtered = [...state.items];
    } else {
      state.filtered = state.items.filter((item) =>
        item.filename.toLowerCase().includes(term)
      );
    }
    clearGrid();
    scheduleRenderMore();
    updateFilteredCount();
  };

  const renderCard = (item, index) => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.index = index;
    if (state.selected && state.selected.path === item.path) {
      card.classList.add('selected');
    }

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.className = 'thumb-img';
    img.alt = item.filename;
    img.loading = 'lazy';
    const safeSrc = toFileUrl(item.path);
    img.dataset.src = safeSrc; // loadThumb will set .src lazily

    const fallback = document.createElement('span');
    fallback.className = 'thumb-fallback';
    fallback.textContent = '🖼';
    thumb.appendChild(img);
    thumb.appendChild(fallback);

    img.onload = () => {
      thumb.classList.add('loaded');
      fallback.style.display = 'none';
    };
    img.onerror = () => {
      thumb.classList.remove('loaded');
      fallback.style.display = 'grid';
    };
    card.appendChild(thumb);

    const name = document.createElement('p');
    name.className = 'file-name';
    name.textContent = item.filename;
    card.appendChild(name);

    const pill = document.createElement('div');
    pill.className = 'pill ' + (item.hasGps ? 'green' : 'orange');
    pill.textContent = item.hasGps ? 'Has GPS' : 'Missing GPS';
    card.appendChild(pill);

    const writable = document.createElement('div');
    writable.className = 'pill ' + (item.writable ? 'blue' : '');
    writable.textContent = item.writable ? 'Writable' : 'Read-only';
    card.appendChild(writable);

    card.addEventListener('click', () => selectItem(item, card));
    ensureThumbObserver();
    thumbObserver.observe(img);
    return card;
  };

  const renderMore = () => {
    state.renderScheduled = false;
    const start = state.renderCount;
    const end = Math.min(state.filtered.length, start + state.pageSize);
    if (start >= end) return;
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) {
      frag.appendChild(renderCard(state.filtered[i], i));
    }
    if (els.imageGrid) els.imageGrid.appendChild(frag);
    state.renderCount = end;
  };

  const scheduleRenderMore = () => {
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(renderMore);
  };

  const selectItem = (item, node) => {
    state.selected = item;
    if (els.imageGrid) {
      els.imageGrid.querySelectorAll('.image-card.selected').forEach((el) => {
        el.classList.remove('selected');
      });
    }
    node.classList.add('selected');
    updateInspector(item);
  };

  const updateInspector = (item) => {
    const safe = (v) => (v === null || v === undefined || v === '' ? '—' : v);
    const fmt = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      const num = Number(v);
      if (!Number.isNaN(num)) return num.toFixed(6);
      return v;
    };
    if (els.metaFile) els.metaFile.textContent = safe(item?.filename);
    if (els.metaStatus) els.metaStatus.textContent = item?.exifStatus || (item
      ? item.hasGps
        ? 'Has GPS'
        : 'Missing GPS'
      : '—');
    if (els.metaLat) els.metaLat.textContent = fmt(item?.latitude);
    if (els.metaLon) els.metaLon.textContent = fmt(item?.longitude);
    if (els.metaAlt) els.metaAlt.textContent = safe(item?.altitude);
    if (els.metaTime) els.metaTime.textContent = safe(item?.timestamp);
    if (els.metaCamera) els.metaCamera.textContent = safe(item?.camera);
    if (els.metaDims) els.metaDims.textContent = safe(item?.dimensions);
    if (els.metaWritable) els.metaWritable.textContent = item ? (item.writable ? 'Yes' : 'No') : '—';
  };

  const safeInvoke = async (fn, label) => {
    if (!window.api || typeof fn !== 'function') {
      log(`${label} not available`, 'error');
      return null;
    }
    try {
      return await fn();
    } catch (err) {
      log(`${label} failed: ${err.message || err}`, 'error');
      return null;
    }
  };

  const extractData = (res) => {
    if (!res) return null;
    if (res.ok === false) {
      log(res.error || 'Operation failed', 'error');
      return null;
    }
    return res.data || res;
  };

  const withBusy = async (btn, fn) => {
    if (!btn) return fn();
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working...';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  };

  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  };

  const toItems = (list = []) =>
    list.map((raw) => {
      const filename =
        raw.filename ||
        raw.name ||
        raw.file ||
        (raw.path && raw.path.split(/[\\/]/).pop()) ||
        'image';
      const path = raw.path || raw.filePath || raw.fullPath || filename;
      const latitude = normalizeNumber(raw.latitude ?? raw.lat);
      const longitude = normalizeNumber(raw.longitude ?? raw.lon);
      const altitude = normalizeNumber(raw.altitude ?? raw.alt);
      // const hasGps = Boolean(raw.hasGps ?? raw.gps ?? latitude !== null && longitude !== null);
      const hasGps = Boolean(raw.hasGps ?? raw.gps ?? (latitude !== null && longitude !== null));
      const writable = raw.writable !== false;
      const exifStatus =
        raw.exifStatus ||
        (writable ? (hasGps ? 'OK' : 'NO_EXIF') : 'READ_ONLY');
      const camera =
        raw.camera ||
        [raw.make, raw.model].filter(Boolean).join(' ').trim() ||
        '';
      const dims =
        raw.dimensions ||
        (raw.width && raw.height ? `${raw.width}x${raw.height}` : '');

      return {
        filename,
        path,
        hasGps,
        latitude,
        longitude,
        altitude,
        writable,
        exifStatus,
        camera,
        dimensions: dims,
        timestamp: raw.timestamp || raw.time || '',
        short: (filename.split(/[\\/]/).pop() || 'IMG').slice(0, 4).toUpperCase()
      };
    });

  const handleSelectFolder = async () => {
    log('Attempting to select folder...', 'info');
    
    // Try both API methods to ensure compatibility
    let res = null;
    if (window.api && typeof window.api.selectFolder === 'function') {
      res = await safeInvoke(() => window.api.selectFolder(), 'Select folder');
      log(`Received response from window.api: ${JSON.stringify(res)}`, 'info');
    } else if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
      res = await safeInvoke(() => window.electronAPI.selectFolder(), 'Select folder');
      log(`Received response from window.electronAPI: ${JSON.stringify(res)}`, 'info');
    } else {
      log('No valid selectFolder API found', 'error');
      return;
    }
    
    if (!res) {
      log('No response received from folder selection', 'error');
      return;
    }
    
    // Handle different response structures from IPC
    const path = res.path || (res.data && res.data.path) || (Array.isArray(res.filePaths) && res.filePaths[0]) || res.filePath;
    
    log(`Extracted path: ${path}`, 'info');
    updateFolder(path);
    log(path ? `Folder selected: ${path}` : 'No folder selected', path ? 'info' : 'error');
    if (path) {
      showToast('Folder selected successfully', 'success');
      runScan({ source: 'select' });
    }
  };

  const runScan = async ({ source } = {}) => {
    if (!state.folder) {
      log('Select a folder first.', 'error');
      return;
    }
    if (state.scanInFlight) {
      log('A scan is already in progress.', 'error');
      return;
    }
    setControlsDisabled(true);
    state.scanInFlight = true;
    const btn = source === 'select' ? null : els.scanBtn;
    await withBusy(btn, async () => {
      resetProgressBar();
      log('Scanning and reading EXIF...', 'info');
      showToast('Scanning images…', 'info');
      startProgressTicker();
      const res = await safeInvoke(
        () =>
          window.api.autoScan({
            folder: state.folder,
            recursive: state.recursive,
            lang: state.lang
          }),
        'Scan'
      );
      const data = extractData(res);
      if (!data) {
        stopProgressTicker();
        setProgress('Error', 'Scan failed', 100);
        return;
      }
      const images = toItems(data.images || data.files || []);
      state.items = images;
      state.filtered = images;
      state.imageCount = images.length;
      renderStats(images);
      clearGrid();
      scheduleRenderMore();
      updateFilteredCount();
      setProcessed(images.length, images.length);
      stopProgressTicker();
      setProgress('Completed', `${images.length} images`, 100);
      log(`Scan complete: ${images.length} images`, 'success');
      showToast('Scan completed', 'success');
      if (images.length > state.pageSize) {
        log(`Loaded ${images.length} images. Scroll to load thumbnails lazily.`, 'info');
      }
    });
    state.scanInFlight = false;
    setControlsDisabled(false);
  };

  const handleScan = () => runScan();

  const handleRescan = () => runScan();

  const handleExportCsv = async () => {
    if (!state.folder) {
      log('Select a folder first.', 'error');
      return;
    }
    const saveRes = await safeInvoke(() => window.api.selectSaveCsv(), 'Save CSV');
    if (!saveRes || !saveRes.path) {
      log('CSV export cancelled.', 'info');
      return;
    }
    const csvPath = saveRes.path;
    await withBusy(els.exportCsvBtn, async () => {
      setProgress('Exporting CSV...', '', 30);
      log('Exporting GPS to CSV...', 'info');
      const res = await safeInvoke(
        () =>
          window.api.extractGeotag({
            folder: state.folder,
            lang: state.lang,
            exportCsv: true,
            csvPath,
            recursive: state.recursive
          }),
        'Export CSV'
      );
      const data = extractData(res);
      if (!data) return;
      const csv = data.csvPath || data.output || data.path || csvPath;
      if (csv) {
        updateCsvPath(csv);
        log(`CSV exported to ${csv}`, 'success');
        setProgress('CSV exported', csv, 100);
        showToast('CSV exported successfully', 'success');
      } else {
        setProgress('CSV exported', 'Done', 100);
        log('CSV export completed.', 'success');
        showToast('CSV exported successfully', 'success');
      }
    });
  };

  const pickCsv = async () => {
    const res = await safeInvoke(() => window.api.selectFiles(), 'Select CSV');
    if (!res) return null;
    const first =
      (Array.isArray(res) && res[0]) ||
      (res.files && res.files[0]) ||
      (res.data && res.data.files && res.data.files[0]) ||
      res.path ||
      (res.data && res.data.path);
    if (first && first.toLowerCase().endsWith('.csv')) {
      return first;
    }
    log('Please select a CSV file.', 'error');
    return null;
  };

  const handleImportCsv = async () => {
    if (!state.folder) {
      log('Select a folder first.', 'error');
      return;
    }
    const csv = await pickCsv();
    if (!csv) return;
    updateCsvPath(csv);
    await withBusy(els.importCsvBtn, async () => {
      setProgress('Writing GPS...', csv, 30);
      log(`Writing GPS back from CSV: ${csv}`, 'info');
      const res = await safeInvoke(
        () => window.api.writeGeotag({ folder: state.folder, csv, lang: state.lang }),
        'Write GPS'
      );
      const data = extractData(res);
      if (!data) return;
      const updated = data.updated || 0;
      const skipped = data.skipped || 0;
      setProgress('Write complete', `${updated} updated`, 100);
      log(`Write completed. Updated: ${updated}; Skipped: ${skipped}`, 'success');
      showToast('GPS data applied to images', 'success');
      if (Array.isArray(data.errors) && data.errors.length) {
        data.errors.slice(0, 10).forEach((e) => {
          if (e && typeof e === 'object') {
            log(`Import warning (row ${e.row}): ${e.reason}`, 'error');
          } else {
            log(`Import warning: ${e}`, 'error');
          }
        });
        if (data.errors.length > 10) {
          log(`...and ${data.errors.length - 10} more`, 'error');
        }
        showToast('Some data points were skipped', 'warning');
      } else {
        showToast('CSV imported successfully', 'success');
      }
      // Rescan to refresh stats and metadata
      await runScan({ source: 'rescan' });
    });
  };

  const bindGridScroll = () => {
    if (els.imageGrid) {
      els.imageGrid.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = els.imageGrid;
        if (scrollTop + clientHeight >= scrollHeight - 60) {
          scheduleRenderMore();
        }
      });
    }
  };

  const bindEvents = () => {
    if (els.selectFolderBtn) {
      // Ensure the button is enabled
      els.selectFolderBtn.disabled = false;
      els.selectFolderBtn.addEventListener('click', handleSelectFolder);
      log('Select folder button bound successfully', 'info');
    } else {
      log('Select folder button not found in DOM', 'error');
    }
    
    if (els.scanBtn) {
      els.scanBtn.disabled = true;
      els.scanBtn.style.display = 'none';
    }
    
    if (els.rescanBtn) {
      els.rescanBtn.addEventListener('click', handleRescan);
    }
    
    if (els.exportCsvBtn) {
      els.exportCsvBtn.addEventListener('click', handleExportCsv);
    }
    
    if (els.importCsvBtn) {
      els.importCsvBtn.addEventListener('click', handleImportCsv);
    }
    
    if (els.recursiveToggle) {
      els.recursiveToggle.addEventListener('change', (e) => {
        state.recursive = Boolean(e.target.checked);
      });
    }
    
    if (els.searchInput) {
      els.searchInput.addEventListener('input', () => {
        state.renderCount = 0;
        applyFilter();
      });
    }
    
    bindGridScroll();
  };

  const bindProgressEvents = () => {
    if (window.api?.onScanProgress) {
      window.api.onScanProgress((payload) => {
        if (!payload || typeof payload.processed !== 'number') return;
        const total = payload.total || state.imageCount || payload.processed;
        const percent =
          typeof payload.percent === 'number'
            ? payload.percent
            : total
            ? Math.round((payload.processed / total) * 100)
            : 0;
        stopProgressTicker();
        setProgress(
          payload.status || 'Scanning',
          `Processing ${payload.processed} of ${total} (${percent}%)`,
          percent
        );
        setProcessed(payload.processed, total);
      });
    }
    if (window.api?.onScanComplete) {
      window.api.onScanComplete((data) => {
        if (!data) return;
        stopProgressTicker();
        const images = toItems(data.images || data.files || []);
        state.items = images;
        state.filtered = images;
        state.imageCount = images.length;
        renderStats(images);
        clearGrid();
        scheduleRenderMore();
        updateFilteredCount();
        setProcessed(images.length, images.length);
        setProgress(
          'Completed',
          `Processing ${images.length} of ${images.length} (100%)`,
          100
        );
        log(`Scan complete: ${images.length} images`, 'success');
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    log('DOM content loaded, initializing geotagging module...', 'info');
    setLangFromQuery();
    bindEvents();
    bindProgressEvents();
    updateInspector(null);
    updateFilteredCount();
    log('Geotagging module initialized successfully', 'info');
  });
})();

