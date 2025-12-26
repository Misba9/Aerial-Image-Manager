(() => {
  const qs = (id) => document.getElementById(id);

  const els = {};

  const state = {
    map: null,
    markers: [],
    selectedFolder: null,
    lang: 'en',
    mapCenter: [29.9182, 47.9589], // Middle East default center
    initialZoom: 6,
    renderer: null,
    drawControl: null,
    drawnItems: null,
    currentSelection: null,
    selectedImages: [],
    selectionCountElement: null,
    isLoading: false,
    totalImagesInFolder: 0,
    polygons: [],
    polygonCounter: 1,
    polygonColorPalette: ['#2563eb', '#16a34a', '#f97316', '#ef4444', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899'],
    polygonColorIndex: 0,
    markerLabelOffsetIndex: 0,
    hoverPopup: null,
    flightPathLayer: null,
    currentPathPoints: [],
    importedKmlLayers: []
  };

  // Circle marker styles
  const markerDefaultStyle = {
    radius: 5,
    color: '#0f60c4',
    weight: 1.5,
    fillColor: '#0f60c4',
    fillOpacity: 0.8,
    opacity: 0.9
  };

  const markerSelectedStyle = {
    radius: 6,
    color: '#16a34a',
    weight: 2,
    fillColor: '#16a34a',
    fillOpacity: 0.9,
    opacity: 1
  };

  const markerRegionStyle = {
    radius: 6,
    color: '#16a34a',
    weight: 2,
    fillColor: '#16a34a',
    fillOpacity: 0.6,
    opacity: 1
  };

  const getNextLabelOffset = () => {
    // Cycle through a few offsets to reduce label overlap
    const presets = [
      [0, -10],
      [8, -6],
      [-8, -6],
      [0, -14]
    ];
    const offset = presets[state.markerLabelOffsetIndex % presets.length];
    state.markerLabelOffsetIndex += 1;
    return offset;
  };

  const ensureHoverPopup = () => {
    if (!state.hoverPopup) {
      state.hoverPopup = L.popup({
        closeButton: false,
        autoClose: false,
        closeOnClick: false,
        className: 'marker-hover-popup',
        offset: [0, -8],
        maxWidth: 260
      });
    }
    return state.hoverPopup;
  };

  const buildImageSrc = (filepath) => {
    if (!filepath) return null;
    try {
      const normalized = filepath.replace(/\\/g, '/');
      return `file://${normalized}`;
    } catch (_err) {
      return null;
    }
  };

  const showMarkerHover = (marker, point) => {
    if (!state.map) return;
    const popup = ensureHoverPopup();
    const coords = marker.getLatLng();
    const imgSrc = buildImageSrc(point.filepath);
    const name = point.filename || 'Unknown';
    const content = `
      <div class="hover-card">
        ${imgSrc ? `<div class="hover-img-wrap"><img src="${imgSrc}" alt="${name}" /></div>` : ''}
        <div class="hover-meta">
          <div class="hover-name">${name}</div>
          <div class="hover-coords">Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}</div>
        </div>
      </div>
    `;
    popup.setLatLng(coords).setContent(content);
    popup.openOn(state.map);
  };

  const sortGpsData = (data = []) => {
    return [...data].sort((a, b) => {
      const parseTs = (item) => {
        const raw = item?.timestamp || item?.time || item?.datetime;
        const t = Date.parse(raw || '');
        return Number.isFinite(t) ? t : null;
      };
      const ta = parseTs(a);
      const tb = parseTs(b);

      if (ta !== null && tb !== null && ta !== tb) {
        return ta - tb;
      }
      if (ta !== null && tb === null) return -1;
      if (ta === null && tb !== null) return 1;

      const fa = (a?.filename || '').toLowerCase();
      const fb = (b?.filename || '').toLowerCase();
      if (fa !== fb) {
        return fa.localeCompare(fb, undefined, { numeric: true, sensitivity: 'base' });
      }
      return 0;
    });
  };

  const hideMarkerHover = () => {
    if (state.hoverPopup && state.map) {
      state.map.closePopup(state.hoverPopup);
    }
  };

  const clearImportedKml = () => {
    if (state.importedKmlLayers.length && state.map) {
      state.importedKmlLayers.forEach((layer) => {
        if (state.map.hasLayer(layer)) {
          state.map.removeLayer(layer);
        }
      });
    }
    state.importedKmlLayers = [];
  };

  const parseKmlCoordinates = (coordText) => {
    if (!coordText) return [];
    return coordText
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const parts = pair.split(',');
        if (parts.length < 2) return null;
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lat, lng];
      })
      .filter(Boolean);
  };

  const addKmlPolygon = (latlngs, name = 'KML Polygon') => {
    if (!latlngs || latlngs.length < 3 || !state.map || !state.drawnItems) return null;
    const color = getNextPolygonColor();
    const layer = L.polygon(latlngs, {
      color,
      weight: 2,
      fillOpacity: 0.15,
      opacity: 0.9,
      renderer: state.renderer || state.map?.options?.renderer
    });
    state.drawnItems.addLayer(layer);
    addPolygonRecord(layer, 'polygon');
    if (layer.bindTooltip) {
      layer.bindTooltip(name, { direction: 'center', className: 'marker-label', permanent: false });
    }
    state.importedKmlLayers.push(layer);
    return layer;
  };

  const addKmlPath = (latlngs, name = 'KML Path') => {
    if (!latlngs || latlngs.length < 2 || !state.map) return null;
    const layer = L.polyline(latlngs, {
      color: '#ef4444',
      weight: 2,
      opacity: 0.9,
      dashArray: '6 4',
      interactive: false,
      renderer: state.renderer || state.map?.options?.renderer
    }).addTo(state.map);
    if (layer.bindTooltip) {
      layer.bindTooltip(name, { direction: 'auto', className: 'marker-label', permanent: false });
    }
    state.importedKmlLayers.push(layer);
    return layer;
  };

  const importKmlFlow = async () => {
    try {
      // Let user pick a KML file
      const res = await (window.api?.selectFiles?.() || Promise.resolve({ files: [] }));
      const filePath = Array.isArray(res?.files) ? res.files.find((p) => p.toLowerCase().endsWith('.kml')) : null;
      if (!filePath) {
        showToast('Please select a KML file', 'warning');
        return;
      }

      // Read KML content via IPC
      let readResult = null;
      if (window.electronAPI?.importKml) {
        readResult = await window.electronAPI.importKml({ path: filePath });
      } else if (window.api?.importKml) {
        readResult = await window.api.importKml({ path: filePath });
      }

      if (!readResult || !readResult.ok) {
        showToast(readResult?.error || 'Failed to load KML file', 'error');
        return;
      }

      importKmlText(readResult.data);
      showToast('KML imported successfully', 'success');
    } catch (err) {
      showToast(`KML import failed: ${err?.message || err}`, 'error');
    }
  };

  const importKmlText = (kmlText) => {
    if (!kmlText || !state.map) {
      showToast('Invalid or empty KML content', 'warning');
      return;
    }
    clearImportedKml();
    const parser = new DOMParser();
    let xml = null;
    try {
      xml = parser.parseFromString(kmlText, 'text/xml');
      const parserError = xml.getElementsByTagName('parsererror');
      if (parserError && parserError.length) {
        showToast('Failed to parse KML file', 'error');
        return;
      }
    } catch (_err) {
      showToast('Failed to parse KML file', 'error');
      return;
    }
    const polygons = Array.from(xml.getElementsByTagName('Polygon'));
    const lines = Array.from(xml.getElementsByTagName('LineString'));
    const addedLayers = [];

    polygons.forEach((polyNode, idx) => {
      const coordsNode = polyNode.getElementsByTagName('coordinates')[0];
      if (!coordsNode || !coordsNode.textContent) return;
      const latlngs = parseKmlCoordinates(coordsNode.textContent);
      const layer = addKmlPolygon(latlngs, `KML Polygon ${idx + 1}`);
      if (layer) addedLayers.push(layer);
    });

    lines.forEach((lineNode, idx) => {
      const coordsNode = lineNode.getElementsByTagName('coordinates')[0];
      if (!coordsNode || !coordsNode.textContent) return;
      const latlngs = parseKmlCoordinates(coordsNode.textContent);
      const layer = addKmlPath(latlngs, `KML Path ${idx + 1}`);
      if (layer) addedLayers.push(layer);
    });

    if (addedLayers.length) {
      const group = L.featureGroup(addedLayers);
      state.map.fitBounds(group.getBounds().pad(0.1));
    } else {
      showToast('No supported KML geometries found', 'warning');
    }
  };

  const clearFlightPath = () => {
    if (state.flightPathLayer && state.map) {
      state.map.removeLayer(state.flightPathLayer);
    }
    state.flightPathLayer = null;
  };

  const buildFlightPath = (points = []) => {
    clearFlightPath();
    if (!state.map || points.length < 2) return;

    const latlngs = points.map((p) => [p.lat, p.lng]);
    const pathColor = '#0f60c4';

    const line = L.polyline(latlngs, {
      color: pathColor,
      weight: 2.5,
      opacity: 0.7,
      interactive: false,
      renderer: state.renderer || state.map?.options?.renderer
    });

    const arrowLayer = L.layerGroup();
    for (let i = 0; i < latlngs.length - 1; i++) {
      const [lat1, lng1] = latlngs[i];
      const [lat2, lng2] = latlngs[i + 1];
      const mid = [(lat1 + lat2) / 2, (lng1 + lng2) / 2];
      const angle = Math.atan2(lat2 - lat1, lng2 - lng1) * (180 / Math.PI);
      const arrow = L.marker(mid, {
        interactive: false,
        icon: L.divIcon({
          className: 'path-arrow',
          html: `<div style="transform: rotate(${angle}deg);">➤</div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })
      });
      arrowLayer.addLayer(arrow);
    }

    const group = L.layerGroup([line, arrowLayer]);
    group.addTo(state.map);
    state.flightPathLayer = group;
  };

  // Logging is intentionally silenced in production to avoid console noise
  const log = () => {};

  const showLoadingIndicator = () => {
    if (state.isLoading) return;
    
    state.isLoading = true;
    
    // Disable map interactions
    if (state.map) {
      state.map.dragging.disable();
      state.map.touchZoom.disable();
      state.map.doubleClickZoom.disable();
      state.map.scrollWheelZoom.disable();
      state.map.boxZoom.disable();
      state.map.keyboard.disable();
      
      // Also disable the draw control
      if (state.drawControl) {
        state.map.removeControl(state.drawControl);
      }
    }
    
    // Disable all buttons during loading
    disableAllButtons();
    
    // Create loading overlay if it doesn't exist
    if (!els.loadingOverlay) {
      els.loadingOverlay = document.createElement('div');
      els.loadingOverlay.id = 'loadingOverlay';
      els.loadingOverlay.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      `;
      els.loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      `;
      
      // Add spinner styles
      const spinnerStyle = document.createElement('style');
      spinnerStyle.textContent = `
        .loading-spinner {
          background: white;
          padding: 30px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #0f60c4;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 15px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(spinnerStyle);
      
      document.body.appendChild(els.loadingOverlay);
    }
    
    els.loadingOverlay.style.display = 'flex';
  };
  
  // Function to disable all buttons during loading
  const disableAllButtons = () => {
    const buttons = [
      els.selectFolderBtn,
      els.loadImagesBtn,
      els.exportImagesBtn,
      els.clearSelectionBtn
    ];
    
    buttons.forEach(button => {
      if (button) {
        button.disabled = true;
      }
    });
  };
  
  // Function to enable all buttons after loading
  const enableAllButtons = () => {
    // Re-enable buttons based on current state
    if (els.selectFolderBtn) {
      els.selectFolderBtn.disabled = false;
    }
    
    if (els.loadImagesBtn) {
      els.loadImagesBtn.disabled = !state.selectedFolder;
    }
    
    if (els.exportImagesBtn) {
      const hasSelectedImages = state.selectedImages.length > 0;
      const hasPolygons = hasExportablePolygons();
      els.exportImagesBtn.disabled = !hasSelectedImages || !hasPolygons;
    }
    
    if (els.clearSelectionBtn) {
      els.clearSelectionBtn.disabled = !state.currentSelection;
    }
  };
  
  const hideLoadingIndicator = () => {
    state.isLoading = false;
    
    // Re-enable map interactions
    if (state.map) {
      state.map.dragging.enable();
      state.map.touchZoom.enable();
      state.map.doubleClickZoom.enable();
      state.map.scrollWheelZoom.enable();
      state.map.boxZoom.enable();
      state.map.keyboard.enable();
      
      // Re-add the draw control
      if (state.drawControl) {
        state.map.addControl(state.drawControl);
      }
    }
    
    // Re-enable buttons
    enableAllButtons();
    
    if (els.loadingOverlay) {
      els.loadingOverlay.style.display = 'none';
    }
  };

  // Polygon manager helpers
  const getNextPolygonColor = () => {
    // Try to pick an unused palette color first
    const used = new Set(state.polygons.map((p) => p.color?.toLowerCase?.()));
    const palette = state.polygonColorPalette;
    for (let i = 0; i < palette.length; i++) {
      const candidate = palette[(state.polygonColorIndex + i) % palette.length];
      if (!used.has(candidate.toLowerCase())) {
        state.polygonColorIndex = state.polygonColorIndex + i + 1;
        return candidate;
      }
    }

    // Fallback: generate a distinct-ish color via HSL if palette exhausted
    const hue = (state.polygonCounter * 47) % 360;
    const fallback = `hsl(${hue}, 75%, 50%)`;
    state.polygonColorIndex += 1;
    return fallback;
  };

  const sanitizePolygonName = (value, fallback) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) return trimmed.slice(0, 120);
    const fallbackTrimmed = typeof fallback === 'string' ? fallback.trim() : '';
    return fallbackTrimmed || 'Polygon';
  };

  const sanitizeExportName = (value, fallback) => {
    const base = (typeof value === 'string' ? value : fallback || '')
      .toString()
      .toLowerCase()
      .trim();
    if (!base) return '';
    const underscored = base.replace(/\s+/g, '_');
    const cleaned = underscored.replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return cleaned;
  };

  const applyPolygonStyle = (layer, color) => {
    try {
      if (layer.setStyle) {
        layer.setStyle({ color, weight: 2, opacity: 1, fillOpacity: 0.2 });
      }
    } catch (_err) {
      // Styling is best-effort
    }
  };

  const addPolygonRecord = (layer, type) => {
    if (!layer) return null;
    const geometry = layer.toGeoJSON();
    const id = `polygon_${state.polygonCounter++}`;
    const name = `Polygon ${state.polygons.length + 1}`;
    const color = getNextPolygonColor();
    applyPolygonStyle(layer, color);

    const record = {
      id,
      name,
      type: type || 'polygon',
      geometry,
      color,
      visibility: true,
      selected_for_export: true,
      layerId: layer._leaflet_id
    };

    state.polygons.push(record);
    bindPolygonLayerEvents(layer, record);
    refreshPolygonLayerStyles();
    recomputeSelectionFromPolygons();
    renderPolygonPanel();
    return record;
  };

  const findPolygonIndexByLayerId = (layerId) => state.polygons.findIndex((p) => p.layerId === layerId);

  const updatePolygonGeometry = (layer) => {
    if (!layer) return;
    const idx = findPolygonIndexByLayerId(layer._leaflet_id);
    if (idx === -1) return;
    state.polygons[idx].geometry = layer.toGeoJSON();
  };

  const removePolygonRecord = (layer) => {
    if (!layer) return;
    const idx = findPolygonIndexByLayerId(layer._leaflet_id);
    if (idx === -1) return;
    state.polygons.splice(idx, 1);
    refreshPolygonLayerStyles();
    recomputeSelectionFromPolygons();
    renderPolygonPanel();
  };

  const setPolygonVisibility = (polygonId, visible) => {
    const record = state.polygons.find((p) => p.id === polygonId);
    if (!record) return;
    record.visibility = !!visible;

    // When hiding: ensure it is not selected for export and clear selection state
    if (!record.visibility) {
      record.selected_for_export = false;
      if (state.currentSelection?.record?.id === record.id) {
        state.currentSelection = null;
      }
    }

    if (!state.drawnItems) return;
    const layer = state.drawnItems.getLayers().find((l) => l._leaflet_id === record.layerId);
    if (!layer) return;
    if (record.visibility) {
      if (!state.map.hasLayer(layer)) {
        layer.addTo(state.map);
        if (layer.bringToFront) layer.bringToFront();
      }
    } else {
      if (state.map.hasLayer(layer)) {
        state.map.removeLayer(layer);
      }
    }

    refreshPolygonLayerStyles();
    recomputeSelectionFromPolygons();
    renderPolygonPanel();
  };

  const setPolygonExportSelection = (polygonId, selected) => {
    const record = state.polygons.find((p) => p.id === polygonId);
    if (!record) return;
    const nextSelected = !!selected;
    record.selected_for_export = nextSelected;

    // Checkbox drives visibility: on -> visible, off -> hidden
    record.visibility = nextSelected;

    const layer = findLayerById(record.layerId);
    if (nextSelected) {
      if (layer) {
        if (!state.map.hasLayer(layer)) {
          layer.addTo(state.map);
        }
        if (layer.bringToFront) layer.bringToFront();
      }
    } else {
      if (state.currentSelection?.record?.id === record.id) {
        state.currentSelection = null;
      }
      if (layer && state.map.hasLayer(layer)) {
        state.map.removeLayer(layer);
      }
    }

    refreshPolygonLayerStyles();
    renderPolygonPanel();
    recomputeSelectionFromPolygons();
  };

  const updatePolygonName = (polygonId, newName) => {
    const record = state.polygons.find((p) => p.id === polygonId);
    if (!record) return;
    const sanitized = sanitizePolygonName(newName, record.name || polygonId);
    record.name = sanitized;

    // Update the input value in-place so we don't lose focus
    if (els.polygonList) {
      const input = els.polygonList.querySelector(`.poly-name-input[data-id="${polygonId}"]`);
      if (input && input.value !== sanitized) {
        input.value = sanitized;
      }
    }
  };

  const updatePolygonColor = (polygonId, color) => {
    const record = state.polygons.find((p) => p.id === polygonId);
    if (!record) return;
    record.color = color;
    const layer = findLayerById(record.layerId);
    if (layer) {
      applyPolygonStyle(layer, color);
      if (layer.bringToFront) layer.bringToFront();
    }
    refreshPolygonLayerStyles();
    renderPolygonPanel();
  };

  const findLayerById = (layerId) => {
    if (!state.drawnItems) return null;
    return state.drawnItems.getLayers().find((l) => l._leaflet_id === layerId) || null;
  };

  const refreshPolygonLayerStyles = () => {
    state.polygons.forEach((poly) => {
      const layer = findLayerById(poly.layerId);
      if (layer && layer.setStyle) {
        layer.setStyle({
          color: poly.color,
          weight: poly.selected_for_export ? 3 : 2,
          opacity: 1,
          fillOpacity: poly.selected_for_export ? 0.25 : 0.14
        });
        if (poly.selected_for_export && layer.bringToFront) {
          layer.bringToFront();
        }
      }
    });
  };

  const getPolygonSelectionContexts = () => {
    const selected = state.polygons.filter((p) => p.selected_for_export);
    const contexts = selected
      .map((record) => {
        const layer = findLayerById(record.layerId);
        if (!layer) return null;
        return { layer, type: record.type, record };
      })
      .filter(Boolean);

    // Fallback to the active drawing if nothing is explicitly selected
    if (!contexts.length && state.currentSelection) {
      return [state.currentSelection];
    }
    return contexts;
  };

  const recomputeSelectionFromPolygons = () => {
    const contexts = getPolygonSelectionContexts();
    processImageSelection(contexts);
  };

  const togglePolygonSelection = (record, layerOverride) => {
    if (!record) return;
    const layer = layerOverride || findLayerById(record.layerId);
    if (!layer) return;

    record.selected_for_export = !record.selected_for_export;
    state.currentSelection = {
      type: record.type,
      layer,
      geometry: layer.toGeoJSON()
    };

    refreshPolygonLayerStyles();
    renderPolygonPanel();
    recomputeSelectionFromPolygons();
  };

  const bindPolygonLayerEvents = (layer, record) => {
    if (!layer || !record || !layer.on) return;
    layer.on('click', (e) => {
      if (e?.originalEvent?.stopPropagation) {
        e.originalEvent.stopPropagation();
      }
      togglePolygonSelection(record, layer);
    });
  };

  const renderPolygonPanel = () => {
    if (!els.polygonList) return;
    const list = els.polygonList;
    list.innerHTML = '';

    const total = state.polygons.length;
    const selectedCount = state.polygons.filter((p) => p.selected_for_export).length;
    const hiddenCount = state.polygons.filter((p) => !p.visibility).length;

    if (els.polygonCount) {
      els.polygonCount.textContent = total;
    }
    if (els.polygonSelectedCount) {
      els.polygonSelectedCount.textContent = selectedCount;
    }
    if (els.polygonHiddenCount) {
      els.polygonHiddenCount.textContent = hiddenCount;
    }

    if (!total) {
      const empty = document.createElement('div');
      empty.className = 'polygon-empty';
      empty.textContent = 'No polygons yet. Draw a polygon or rectangle to get started.';
      list.appendChild(empty);
      return;
    }

    state.polygons.forEach((poly) => {
      const colorValue = poly.color || '#0f60c4';
      const polyType = poly.type ? poly.type.charAt(0).toUpperCase() + poly.type.slice(1) : 'Polygon';

      const row = document.createElement('div');
      row.className = 'polygon-row';
      row.dataset.id = poly.id;
      if (poly.selected_for_export) {
        row.classList.add('is-selected');
      }
      if (!poly.visibility) {
        row.classList.add('is-hidden');
      }

      row.innerHTML = `
        <label class="poly-col poly-col-export" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="poly-export" data-id="${poly.id}" ${poly.selected_for_export ? 'checked' : ''}>
          <span class="poly-export-label">Export</span>
        </label>
        <div class="poly-col poly-col-name">
          <input
            type="text"
            class="poly-name-input poly-name"
            data-id="${poly.id}"
            value=""
            placeholder="Polygon name"
            aria-label="Polygon name"
          />
          <div class="poly-meta">
            <span class="pill pill-strong">${polyType}</span>
            <span class="pill pill-id">ID ${poly.id}</span>
          </div>
        </div>
        <div class="poly-col poly-col-color">
          <input type="color" class="poly-color" data-id="${poly.id}" value="${colorValue}">
        </div>
        <button
          class="poly-col poly-col-visibility poly-visibility"
          data-id="${poly.id}"
          data-visible="${poly.visibility}"
          title="${poly.visibility ? 'Hide polygon' : 'Show polygon'}"
          aria-label="${poly.visibility ? 'Hide polygon' : 'Show polygon'}"
        >
          ${poly.visibility
            ? `<svg class="poly-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`
            : `<svg class="poly-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 4.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.35 18.35 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/></svg>`}
          <span class="poly-visibility-label">${poly.visibility ? 'Visible' : 'Hidden'}</span>
        </button>
      `;

      const nameInput = row.querySelector('.poly-name-input');
      if (nameInput) {
        nameInput.value = poly.name || '';
      }

      list.appendChild(row);
    });
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

  const initMap = () => {
    // Prevent double initialization (singleton)
    if (state.map) return;

    const container = document.getElementById('map');
    if (!container) {
      log('Map container not found', 'error');
      return;
    }

    // Defer until container has dimensions
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setTimeout(initMap, 100);
      return;
    }

    // One shared SVG renderer for all layers
    state.renderer = state.renderer || L.svg({ padding: 0.5 });

    // Initialize the map once
    state.map = L.map('map', {
      renderer: state.renderer,
      zoomControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      preferCanvas: false,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 120
    }).setView(state.mapCenter, state.initialZoom);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 19,
      minZoom: 2,
      tileSize: 256,
      zoomOffset: 0,
      detectRetina: true,
      reuseTiles: true,
      keepBuffer: 2,
      updateWhenIdle: true,
      updateWhenZooming: false,
      unloadInvisibleTiles: true,
      crossOrigin: true
    }).addTo(state.map);
    
    // Add a scale control
    L.control.scale({ 
      imperial: false, 
      maxWidth: 200,
      position: 'bottomleft'
    }).addTo(state.map);
    
    // Single permanent feature group for drawings
    if (!state.drawnItems) {
      state.drawnItems = new L.FeatureGroup();
    }
    if (!state.map.hasLayer(state.drawnItems)) {
      state.map.addLayer(state.drawnItems);
    }
    
    // Native Leaflet Draw toolbar (icons + tooltips)
    state.drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#2563eb' }
        },
        rectangle: {
          shapeOptions: { color: '#2563eb' }
        }
      },
      edit: {
        featureGroup: state.drawnItems,
        edit: true,
        remove: true
      }
    });
    state.map.addControl(state.drawControl);
    
    // Handle window resize events for responsive map
    handleWindowResize();

    // Setup draw event listeners
    setupDrawEventListeners();
    
    // Single post-load size correction
    setTimeout(() => {
      if (state.map) {
        state.map.invalidateSize();
      }
    }, 300);
    
    log('Map initialized with default region center', 'info');
  };

  const selectFolder = async () => {
    try {
      const res = await (window.api?.selectFolder?.() || Promise.resolve(null));
      if (!res || !res.path) {
        log('Folder selection cancelled', 'info');
        return;
      }
      
      state.selectedFolder = res.path;
      log(`Folder selected: ${res.path}`, 'info');
      showToast('Folder selected successfully', 'success');
      
      // Update folder path display
      if (els.folderPathText) {
        els.folderPathText.textContent = res.path;
      }
      
      // Update button states
      updateButtonStates();
      
      // Reset statistics
      if (els.totalImagesCount) {
        els.totalImagesCount.textContent = '0';
      }
      state.totalImagesInFolder = 0;
      if (els.selectedCount) {
        els.selectedCount.textContent = '0';
      }
      
      // Note: We're not automatically extracting GPS data anymore
      // That will be done when the user clicks "Load Images"
    } catch (err) {
      log(`Error selecting folder: ${err.message}`, 'error');
      showToast('Failed to select folder', 'error');
    }
  };
  
  const extractGPSData = async (folderPath) => {
    try {
      // Show loading state
      showLoadingIndicator();
      showToast('Extracting GPS data...', 'info');
      
      // Call the IPC handler to extract GPS data
      let result;
      
      // Try using electronAPI with new mapLoader handler first
      if (window.electronAPI?.mapLoader) {
        result = await window.electronAPI.mapLoader({ folder: folderPath });
      }
      // Fallback to extractGPS
      else if (window.electronAPI?.extractGPS) {
        result = await window.electronAPI.extractGPS({ folder: folderPath });
      }
      // Fallback to extractMapPoints
      else if (window.electronAPI?.extractMapPoints) {
        result = await window.electronAPI.extractMapPoints({ folder: folderPath });
      }
      // Fallback to legacy api
      else if (window.api?.extractMapPoints) {
        result = await window.api.extractMapPoints({ folder: folderPath });
      }
      // Try using mapLoader from legacy api
      else if (window.api?.mapLoader) {
        result = await window.api.mapLoader({ folder: folderPath });
      }
      // Direct IPC invoke (new handler we created)
      else if (window.require) {
        // For direct IPC invoke, we would need to expose it properly
        // For now, we'll add a message passing approach
        log('Direct IPC not available, using fallback', 'warn');
        loadSampleMarkers();
        hideLoadingIndicator();
        return;
      }
      else {
        // Fallback to sample markers if no API available
        loadSampleMarkers();
        hideLoadingIndicator();
        return;
      }
      
      if (!result || !result.ok) {
        throw new Error(result?.error || 'Map loading failed');
      }
      
      // Extract the images array from the result data
      const gpsData = (result.data && result.data.images) ? result.data.images : [];
      const totalImagesInFolder = (typeof result.data?.total_count === 'number')
        ? result.data.total_count
        : (typeof result.data?.total_images === 'number' ? result.data.total_images : gpsData.length);
      
      // Update total images count based on top-level scan only
      state.totalImagesInFolder = totalImagesInFolder;
      if (els.totalImagesCount) {
        els.totalImagesCount.textContent = totalImagesInFolder;
      }
      
      // Check if any images were found at all
      if (totalImagesInFolder === 0) {
        showToast('No images found in the selected folder', 'warning');
        log('No images found in the selected folder', 'info');
      }
      // Check if any GPS data was found
      else if (gpsData.length === 0) {
        showToast('No GPS-tagged images found in this folder', 'warning');
        log('No GPS-tagged images found in this folder', 'info');
      } else {
        showToast(`Successfully loaded ${gpsData.length} GPS points`, 'success');
      }
      
      // Add markers to the map
      addMarkersFromGPSData(gpsData);
      
      // Update button states
      updateButtonStates();
    } catch (err) {
      log(`Error extracting GPS data: ${err.message}`, 'error');
      showToast(`Map loading failed: ${err.message}`, 'error');
      
      // Fallback to sample markers on error
      loadSampleMarkers();
    } finally {
      hideLoadingIndicator();
    }
  };

  const clearMarkers = () => {
    // Clear existing markers from the map
    state.markers.forEach(marker => {
      // Remove click event listener
      marker.off('click');
      
      if (state.map.hasLayer(marker)) {
        state.map.removeLayer(marker);
      }
    });
    state.markers = [];
    
    // Update statistics
    if (els.totalImagesCount) {
      els.totalImagesCount.textContent = '0';
    }
    state.totalImagesInFolder = 0;
    
    // Reset selected count to 0
    if (els.selectedCount) {
      els.selectedCount.textContent = '0';
    }
    
    // Clear selected images array
    state.selectedImages = [];

    // Clear path overlay
    clearFlightPath();
    
    // Update button states
    updateButtonStates();
  };

  const addMarkersFromGPSData = (gpsData) => {
    if (!Array.isArray(gpsData)) {
      log('GPS data is not an array:', 'warn');
      return;
    }
    
    const sortedData = sortGpsData(gpsData);
    state.currentPathPoints = sortedData.map((p) => ({
      lat: p.latitude ?? p.lat,
      lng: p.longitude ?? p.lng,
      filename: p.filename,
      filepath: p.filepath
    }));
    
    // Clear existing markers
    const preservedTotalImages = state.totalImagesInFolder;
    clearMarkers();
    state.totalImagesInFolder = preservedTotalImages;
    
    // Optimize for large datasets: batch process markers in chunks
    const batchSize = 1000; // Process 1000 markers at a time to prevent UI freezing
    const totalMarkers = sortedData.length;
    
    // Show loading indicator for large datasets
    if (totalMarkers > 5000) {
      showLoadingIndicator();
    }
    
    // Process markers in batches to prevent UI freezing
    const processBatch = (startIndex) => {
      const endIndex = Math.min(startIndex + batchSize, totalMarkers);
      
      // Process this batch
      for (let i = startIndex; i < endIndex; i++) {
        const point = sortedData[i];
        
        // Validate required fields and map to expected structure
        if (typeof point.latitude !== 'number' || typeof point.longitude !== 'number' || typeof point.filename !== 'string') {
          log(`Skipping invalid GPS data entry at index ${i}: ${JSON.stringify(point)}`, 'warn');
          continue;
        }
        
        // Map the point data to the expected structure
        const mappedPoint = {
          lat: point.latitude,
          lng: point.longitude,
          filename: point.filename,
          filepath: point.filepath
        };
        
        try {
          const labelOffset = getNextLabelOffset();
          const marker = L.circleMarker([mappedPoint.lat, mappedPoint.lng], { 
            ...markerDefaultStyle,
            renderer: state.renderer || state.map?.options?.renderer,
            fileName: mappedPoint.filename,
            filePath: mappedPoint.filepath  // Store full file path for future use
          })
            .bindTooltip(mappedPoint.filename, { permanent: true, direction: 'top', offset: labelOffset, className: 'marker-label' })
            .bindPopup(`<b>${mappedPoint.filename}</b><br>Lat: ${mappedPoint.lat.toFixed(6)}, Lng: ${mappedPoint.lng.toFixed(6)}`);

          // Hover preview
          marker.on('mouseover', () => showMarkerHover(marker, mappedPoint));
          marker.on('mouseout', hideMarkerHover);
          
          // Add click event listener to marker
          marker.on('click', function() {
            handleMarkerClick(marker, mappedPoint);
          });
          
          state.markers.push(marker);
        } catch (err) {
          log(`Failed to create marker for ${point.filename}: ${err.message}`, 'warn');
        }
      }
      
      // If there are more batches, process them asynchronously
      if (endIndex < totalMarkers) {
        setTimeout(() => processBatch(endIndex), 0);
      } else {
        // All markers processed, finalize
        finalizeMarkerProcessing();
      }
    };
    
    // Start processing the first batch
    if (totalMarkers > 0) {
      processBatch(0);
    } else {
      finalizeMarkerProcessing();
    }
  };
  
  // Finalize marker processing after all batches are complete
  const finalizeMarkerProcessing = () => {
    // Add all markers to the map at once for better performance
    if (state.markers.length > 0) {
      const group = L.featureGroup(state.markers);
      group.addTo(state.map);
      
      // Fit map to bounds of markers with padding
      state.map.fitBounds(group.getBounds().pad(0.1));
    }
    
    log(`Loaded ${state.markers.length} GPS markers`, 'info');
    
    // Show toast if no GPS data found
    if (state.markers.length === 0) {
      showToast('No GPS data found in images', 'warning');
    }
    
    // Update statistics
    if (els.totalImagesCount) {
      const totalImagesToDisplay = state.totalImagesInFolder ?? state.markers.length;
      els.totalImagesCount.textContent = totalImagesToDisplay;
    }
    
    // Reset selected count to 0
    if (els.selectedCount) {
      els.selectedCount.textContent = '0';
    }
    
    // Clear selected images array
    state.selectedImages = [];
    
    // Update button states
    updateButtonStates();
    
    // Hide loading indicator if it was shown
    if (state.isLoading) {
      hideLoadingIndicator();
    }

    // Update flight path overlay
    buildFlightPath(state.currentPathPoints);
  };

  const loadSampleMarkers = () => {
    // Clear existing markers
    clearMarkers();
    
    // Add sample markers (in a real implementation, these would come from image geotags)
    const sampleLocations = [
      { lat: 40.7128, lng: -74.0060, name: "New York" },
      { lat: 51.5074, lng: -0.1278, name: "London" },
      { lat: 35.6895, lng: 139.6917, name: "Tokyo" },
      { lat: -33.8688, lng: 151.2093, name: "Sydney" },
      { lat: 37.7749, lng: -122.4194, name: "San Francisco" }
    ];
    
    state.totalImagesInFolder = sampleLocations.length;
    
    sampleLocations.forEach(location => {
      const labelOffset = getNextLabelOffset();
      const marker = L.circleMarker([location.lat, location.lng], { 
        ...markerDefaultStyle,
        renderer: state.renderer || state.map?.options?.renderer,
        fileName: location.name 
      })
        .addTo(state.map)
        .bindTooltip(location.name, { permanent: true, direction: 'top', offset: labelOffset, className: 'marker-label' })
        .bindPopup(`<b>${location.name}</b><br>Lat: ${location.lat.toFixed(4)}, Lng: ${location.lng.toFixed(4)}`);

      // Hover preview (no image path available for sample markers)
      marker.on('mouseover', () => showMarkerHover(marker, { filename: location.name, filepath: null }));
      marker.on('mouseout', hideMarkerHover);
      
      state.markers.push(marker);
    });
    
    // Fit map to bounds of markers
    if (state.markers.length > 0) {
      const group = new L.featureGroup(state.markers);
      state.map.fitBounds(group.getBounds().pad(0.1));
    }
    
    // Build path for samples
    state.currentPathPoints = sampleLocations.map((p) => ({ lat: p.lat, lng: p.lng, filename: p.name }));
    buildFlightPath(state.currentPathPoints);
    
    log(`Loaded ${sampleLocations.length} sample locations`, 'info');
    
    // Show toast if no sample locations (shouldn't happen with hardcoded data, but for consistency)
    if (sampleLocations.length === 0) {
      showToast('No sample locations available', 'warning');
    }
    
    // Update statistics
    if (els.totalImagesCount) {
      els.totalImagesCount.textContent = sampleLocations.length;
    }
    
    // Update button states
    updateButtonStates();
  };

  const extractSelectedRegion = async () => {
    // Check if a region has been drawn
    if (!state.currentSelection) {
      showToast('Please draw a selection area on the map first', 'warning');
      return;
    }
    
    if (!state.selectedFolder) {
      showToast('Please select a folder first', 'warning');
      return;
    }
    
    // Check if there are selected images
    if (state.selectedImages.length === 0) {
      showToast('No images selected. Draw a region on the map first.', 'warning');
      return;
    }
    
    try {
      // Show loading state
      showLoadingIndicator();
      showToast('Selecting destination folder...', 'info');
      
      // Trigger Electron's folder selection dialog to choose destination folder
      const folderResult = await (window.api?.selectFolder?.() || Promise.resolve(null));
      
      if (!folderResult || !folderResult.path) {
        log('Destination folder selection cancelled', 'info');
        showToast('Destination folder selection cancelled', 'info');
        return;
      }
      
      const destinationFolder = folderResult.path;
      log(`Destination folder selected: ${destinationFolder}`, 'info');
      
      // Show copying state
      showToast(`Copying ${state.selectedImages.length} images...`, 'info');
      
      // Call the copy_selected.py Python script via IPC
      let result;
      
      // Try using electronAPI first
      if (window.electronAPI?.copySelectedImages) {
        result = await window.electronAPI.copySelectedImages({
          source: state.selectedFolder,
          destination: destinationFolder,
          filenames: state.selectedImages
        });
      }
      // Fallback to legacy api
      else if (window.api?.copySelectedImages) {
        result = await window.api.copySelectedImages({
          source: state.selectedFolder,
          destination: destinationFolder,
          filenames: state.selectedImages
        });
      } else {
        // If no IPC method available, show error
        throw new Error('Copy functionality not available');
      }
      
      // Handle the response
      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to copy selected images');
      }
      
      const copiedCount = result.copied_count || 0;
      
      // Show success message
      showToast(`Successfully copied ${copiedCount} images to ${destinationFolder}`, 'success');
      
      // Auto-open the destination folder
      try {
        if (window.electronAPI?.openFolder) {
          await window.electronAPI.openFolder(destinationFolder);
        } else if (window.api?.openFolder) {
          await window.api.openFolder(destinationFolder);
        }
        log(`Opened destination folder: ${destinationFolder}`, 'info');
      } catch (openErr) {
        log(`Failed to open destination folder: ${openErr.message}`, 'warn');
        // Don't fail the whole operation if we can't open the folder
      }
      
    } catch (err) {
      log(`Error extracting selected region: ${err.message}`, 'error');
      showToast(`Failed to extract selected region: ${err.message}`, 'error');
    } finally {
      hideLoadingIndicator();
    }
  };

  const buildExportLabel = () => {
    const selected = state.polygons.filter((p) => p.selected_for_export && p.visibility);
    if (!selected.length) return null;
    const names = selected
      .map((p) => sanitizeExportName(p.name, p.id))
      .filter((name) => !!name);

    if (!names.length) return null;
    return names.join('_');
  };

  const hasExportablePolygons = () => {
    return state.polygons.some((p) => p.selected_for_export && p.visibility);
  };

  // Function to export selected images
  const exportSelectedImages = async () => {
    // Check if there are selected images
    if (state.selectedImages.length === 0) {
      showToast('No images selected. Please select images first.', 'warning');
      return;
    }

    // Require at least one exportable, visible polygon for folder naming
    const exportLabel = buildExportLabel();
    if (!exportLabel) {
      showToast('Please select at least one polygon to export', 'warning');
      return;
    }
    
    try {
      // Show loading state
      showLoadingIndicator();
      showToast('Selecting destination folder...', 'info');
      
      // Trigger Electron's folder selection dialog to choose destination folder
      const folderResult = await (window.api?.selectFolder?.() || Promise.resolve(null));
      
      if (!folderResult || !folderResult.path) {
        log('Destination folder selection cancelled', 'info');
        showToast('Destination folder selection cancelled', 'info');
        hideLoadingIndicator();
        return;
      }
      
      const destinationFolder = folderResult.path;
      log(`Destination folder selected: ${destinationFolder}`, 'info');
      
      // Show collecting files state
      showToast('Collecting selected files...', 'info');
      
      // Create a map for faster lookup of file paths
      const filePathMap = {};
      state.markers.forEach(marker => {
        const filename = marker.options.fileName;
        const filepath = marker.options.filePath;
        if (filename && filepath) {
          filePathMap[filename] = filepath;
        }
      });
      
      // Collect full file paths of selected images
      const selectedFilePaths = [];
      const missingFiles = [];
      
      // Use the map for faster lookup
      state.selectedImages.forEach(filename => {
        if (filePathMap[filename]) {
          selectedFilePaths.push(filePathMap[filename]);
        } else {
          missingFiles.push(filename);
        }
      });
      
      // Warn about any files with missing paths
      if (missingFiles.length > 0) {
        log(`Warning: Missing file paths for ${missingFiles.length} files`, 'warn');
        showToast(`Warning: Missing file paths for ${missingFiles.length} files`, 'warning');
      }
      
      const exportPayload = {
        sourcePaths: selectedFilePaths,
        destination: destinationFolder
      };

      if (exportLabel) {
        exportPayload.exportLabel = exportLabel;
      }

      // Show copying state
      showToast(`Exporting ${selectedFilePaths.length} images...`, 'info');
      
      // Call the export_images.py Python script via IPC
      let result;
      
      // Try using electronAPI first
      if (window.electronAPI?.exportImages) {
        result = await window.electronAPI.exportImages(exportPayload);
      }
      // Fallback to legacy api
      else if (window.api?.exportImages) {
        result = await window.api.exportImages(exportPayload);
      } else {
        // If no IPC method available, show error
        throw new Error('Export functionality not available');
      }
      
      // Handle the response
      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to export selected images');
      }
      
      const exportedCount = result.exported_count || 0;
      const exportFolderName = result.export_folder_name;

      // Edge guard: missing folder name should halt UX flow with a clear warning
      if (!exportFolderName) {
        showToast('Please select at least one polygon to export.', 'warning');
        return;
      }
      
      // Show success message
      showToast(`Successfully exported ${exportedCount} images to ${exportFolderName}`, 'success');
      
      // Ask user if they want to open the exported folder
      if (confirm(`Export completed successfully!\nWould you like to open the folder '${exportFolderName}'?`)) {
        // Auto-open the destination folder
        try {
          if (window.electronAPI?.openFolder) {
            await window.electronAPI.openFolder(result.export_folder_path);
          } else if (window.api?.openFolder) {
            await window.api.openFolder(result.export_folder_path);
          }
          log(`Opened exported folder: ${result.export_folder_path}`, 'info');
        } catch (openErr) {
          log(`Failed to open exported folder: ${openErr.message}`, 'warn');
          // Don't fail the whole operation if we can't open the folder
        }
      }
      
    } catch (err) {
      log(`Error exporting selected images: ${err.message}`, 'error');
      showToast(`Failed to export selected images: ${err.message}`, 'error');
    } finally {
      hideLoadingIndicator();
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

  let resizeTimer = null;
  const handleWindowResize = () => {
    if (!state.map) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.map) {
        state.map.invalidateSize();
      }
    }, 120);
  };
  
  // Track if draw event listeners have been set up to prevent duplicates
  let drawEventListenersSetup = false;
  
  const setupDrawEventListeners = () => {
    if (drawEventListenersSetup) {
      return;
    }
    
    drawEventListenersSetup = true;

    state.map.on(L.Draw.Event.CREATED, (e) => {
      const type = e.layerType;
      const layer = e.layer;

      // Ensure new layer uses the shared renderer
      layer.options.renderer = state.renderer || state.map.options.renderer;
      
      // Add the new layer to the drawn items group
      state.drawnItems.addLayer(layer);
      if (layer.bringToFront) {
        layer.bringToFront(); // Keep newest shapes on top when overlapping
      }

      // Track polygon in polygon manager
      addPolygonRecord(layer, type);
      
      // Store the current selection
      state.currentSelection = {
        type: type,
        layer: layer,
        geometry: layer.toGeoJSON()
      };
      
      // Process image selection based on the drawn region
      processImageSelection();
      
      log(`New ${type} drawn`, 'info');
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} selection created`, 'success');
      
      // Update button states
      updateButtonStates();
    });
    
    state.map.on(L.Draw.Event.EDITED, (e) => {
      const layers = e.layers;
      layers.eachLayer((layer) => {
        // Update the geometry of the current selection
        if (state.currentSelection && state.currentSelection.layer === layer) {
          state.currentSelection.geometry = layer.toGeoJSON();
        }
        // Sync polygon manager geometry
        updatePolygonGeometry(layer);
      });
      
      log('Selection edited', 'info');
      showToast('Selection updated', 'success');
      
      // Update button states
      updateButtonStates();
    });
    
    state.map.on(L.Draw.Event.DELETED, (e) => {
      // Remove polygons from manager
      e.layers.eachLayer((layer) => removePolygonRecord(layer));
      clearCurrentSelection();
      log('Selection deleted', 'info');
      showToast('Selection cleared', 'info');
      
      // Update button states
      updateButtonStates();
    });
    
    // When drawing starts
    state.map.on(L.Draw.Event.DRAWSTART, () => {
      log('Drawing started', 'info');
    });
    
    // When drawing is stopped (cancelled)
    state.map.on(L.Draw.Event.DRAWSTOP, () => {
      log('Drawing stopped', 'info');
    });
  };
  
  const clearCurrentSelection = () => {
    // Remove all layers from the drawn items group
    if (state.drawnItems) {
      state.drawnItems.clearLayers();
    }
    
    // Clear the current selection
    state.currentSelection = null;
    
    // Clear region-based selections but keep manual selections
    clearRegionBasedSelections();
    
    // Clear image selection
    clearImageSelection();
    
    // Update button states
    updateButtonStates();
  };
  
  const getCurrentSelectionBounds = () => {
    if (!state.currentSelection) {
      return null;
    }
    
    // Return bounds based on the layer type
    if (state.currentSelection.layer.getBounds) {
      return state.currentSelection.layer.getBounds();
    }
    
    return null;
  };
  
  const bindEvents = () => {
    if (els.selectFolderBtn) {
      els.selectFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectFolder();
      });
    }
    
    if (els.exportImagesBtn) {
      els.exportImagesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        exportSelectedImages();
      });
    }

    if (els.importKmlBtn) {
      els.importKmlBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await importKmlFlow();
      });
    }
    
    if (els.clearSelectionBtn) {
      els.clearSelectionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearCurrentSelection();
        showToast('Selection cleared', 'info');
      });
    }
    
    if (els.loadImagesBtn) {
      els.loadImagesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.selectedFolder) {
          extractGPSData(state.selectedFolder);
        } else {
          showToast('Please select a folder first', 'warning');
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
    
    // Handle window resize for map responsiveness
    window.addEventListener('resize', handleWindowResize);
    
    // Listen for GPS data from main process
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'gps-data') {
        addMarkersFromGPSData(event.data.payload);
      }
    });
    
    // Alternative IPC listener if using electronAPI
    if (window.electronAPI) {
      // If we had a specific channel for GPS data, we would listen here
      // For now, we'll rely on the message passing approach above
    }

    // Polygon panel interactions (event delegation)
    if (els.polygonList) {
      els.polygonList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('poly-visibility')) {
          const id = target.dataset.id;
          const current = target.dataset.visible === 'true';
          setPolygonVisibility(id, !current);
        }
      });

      els.polygonList.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('poly-name-input')) {
          const id = target.dataset.id;
          updatePolygonName(id, target.value);
        }
      });

      els.polygonList.addEventListener(
        'blur',
        (e) => {
          const target = e.target;
          if (target.classList.contains('poly-name-input')) {
            const id = target.dataset.id;
            updatePolygonName(id, target.value);
          }
        },
        true
      );

      els.polygonList.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('poly-export')) {
          const id = target.dataset.id;
          setPolygonExportSelection(id, target.checked);
        }
        if (target.classList.contains('poly-color')) {
          const id = target.dataset.id;
          updatePolygonColor(id, target.value);
        }
      });
    }
  };

  // Function to handle GPS data received from main process
  const handleGPSData = (gpsData) => {
    if (!state.map) {
      log('Map not initialized yet', 'warn');
      return;
    }
    
    addMarkersFromGPSData(gpsData);
  };
  
  // Public API for accessing the current selection
  const getCurrentSelection = () => {
    return state.currentSelection;
  };
  
  // Public API for accessing the current selection bounds
  const getCurrentBounds = () => {
    return getCurrentSelectionBounds();
  };
  
  // Public API for clearing the current selection
  const clearSelection = () => {
    clearCurrentSelection();
  };
  
  // Expose public API methods
  window.mapAPI = {
    getCurrentSelection,
    getCurrentBounds,
    clearSelection
  };
  
  // Function to check if a point is inside a polygon using ray casting algorithm
  const isPointInPolygon = (point, polygon) => {
    const x = point.lat, y = point.lng;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  };
  
  // Function to check if a point is inside a rectangle
  const isPointInRectangle = (point, bounds) => {
    return (
      point.lat >= bounds.getSouth() &&
      point.lat <= bounds.getNorth() &&
      point.lng >= bounds.getWest() &&
      point.lng <= bounds.getEast()
    );
  };
  
  // Helper function to check if a marker was manually selected
  const isMarkerManuallySelected = (marker) => {
    // Check if the marker was manually selected
    return marker._manuallySelected === true;
  };
  
  // Function to clear region-based selections but keep manual selections
  const clearRegionBasedSelections = () => {
    // Remove region-selected items from selectedImages that aren't manually selected
    const manuallySelectedFilenames = [];
    
    // First, collect all manually selected filenames
    state.markers.forEach(marker => {
      if (!isMarkerManuallySelected(marker) && marker.setStyle) {
        marker.setStyle(markerDefaultStyle);
      }
      if (isMarkerManuallySelected(marker) && marker.setStyle) {
        marker.setStyle(markerSelectedStyle);
      }
      if (isMarkerManuallySelected(marker)) {
        const filename = marker.options.fileName || marker.options.title || 'unknown';
        if (!manuallySelectedFilenames.includes(filename)) {
          manuallySelectedFilenames.push(filename);
        }
      }
    });
    
    // Update selectedImages to only contain manually selected items
    state.selectedImages = [...manuallySelectedFilenames];
    
    // Update UI
    updateSelectionCountDisplay();
    if (els.selectedCount) {
      els.selectedCount.textContent = state.selectedImages.length;
    }
    updateSelectedFilesList();
    
    // Update button states
    updateButtonStates();
  };

  // Function to clear image selection styling
  const clearImageSelectionStyling = () => {
    state.markers.forEach(marker => {
      // Only reset markers that weren't manually selected
      if (!isMarkerManuallySelected(marker)) {
        // Reset to default marker style
        if (marker.setStyle) {
          marker.setStyle(markerDefaultStyle);
        }
        // Clear manual selection flag
        marker._manuallySelected = false;
      }
    });
  };
  
  // Function to process image selection based on selected polygons (can be multiple)
  const processImageSelection = (targetPolygons) => {
    if (!state.markers.length) {
      return;
    }

    const polygonContexts =
      (targetPolygons && targetPolygons.length && targetPolygons) || getPolygonSelectionContexts();

    if (!polygonContexts.length) {
      // If no polygons are active, clear region selections but keep manual ones
      clearRegionBasedSelections();
      return;
    }

    // Show loading indicator for large datasets
    if (state.markers.length > 5000) {
      showLoadingIndicator();
    }

    // Build selection configurations
    const selectionConfigs = polygonContexts
      .map((ctx) => {
        const selectionLayer = ctx.layer;
        const selectionType = ctx.type;

        if (!selectionLayer) return null;

        if (selectionType === 'polygon') {
          const geoJson = selectionLayer.toGeoJSON();
          if (geoJson?.geometry?.coordinates) {
            const polygonCoords = geoJson.geometry.coordinates[0].map((coord) => ({
              lng: coord[0],
              lat: coord[1]
            }));
            return { selectionFunction: isPointInPolygon, selectionGeometry: polygonCoords };
          }
        } else if (selectionType === 'rectangle') {
          return { selectionFunction: isPointInRectangle, selectionGeometry: selectionLayer.getBounds() };
        }
        return null;
      })
      .filter(Boolean);

    if (!selectionConfigs.length) {
      clearRegionBasedSelections();
      return;
    }

    const batchSize = 1000;
    const totalMarkers = state.markers.length;
    const regionSelectedMarkers = new Set();
    const manuallySelected = new Set();

    // Collect manually selected markers first
    state.markers.forEach((marker) => {
      if (isMarkerManuallySelected(marker)) {
        const filename = marker.options.fileName || marker.options.title || 'unknown';
        manuallySelected.add(filename);
      }
    });

    const processBatch = (startIndex) => {
      const endIndex = Math.min(startIndex + batchSize, totalMarkers);

      for (let i = startIndex; i < endIndex; i++) {
        const marker = state.markers[i];
        const latLng = marker.getLatLng();
        const point = { lat: latLng.lat, lng: latLng.lng };
        const filename = marker.options.fileName || marker.options.title || 'unknown';

        let isSelectedByRegion = false;
        for (let idx = 0; idx < selectionConfigs.length; idx++) {
          const config = selectionConfigs[idx];
          if (config.selectionFunction && config.selectionGeometry && config.selectionFunction(point, config.selectionGeometry)) {
            isSelectedByRegion = true;
            break;
          }
        }

        if (isSelectedByRegion) {
          regionSelectedMarkers.add(filename);
          if (!isMarkerManuallySelected(marker) && marker.setStyle) {
            marker.setStyle(markerRegionStyle);
          }
        } else {
          if (!isMarkerManuallySelected(marker) && marker.setStyle) {
            marker.setStyle(markerDefaultStyle);
          }
        }

        // Ensure manually selected markers keep their style
        if (isMarkerManuallySelected(marker) && marker.setStyle) {
          marker.setStyle(markerSelectedStyle);
        }
      }

      if (endIndex < totalMarkers) {
        setTimeout(() => processBatch(endIndex), 0);
      } else {
        const combinedSelection = [...manuallySelected];
        regionSelectedMarkers.forEach((file) => {
          if (!combinedSelection.includes(file)) {
            combinedSelection.push(file);
          }
        });
        finalizeSelectionProcessing(combinedSelection);
      }
    };

    if (totalMarkers > 0) {
      processBatch(0);
    } else {
      finalizeSelectionProcessing([...manuallySelected]);
    }
  };
  
  // Finalize selection processing after all batches are complete
  const finalizeSelectionProcessing = (combinedSelection) => {
    state.selectedImages = Array.isArray(combinedSelection) ? [...combinedSelection] : [];
    
    // Update selection count display
    updateSelectionCountDisplay();
    
    // Update statistics
    if (els.selectedCount) {
      els.selectedCount.textContent = state.selectedImages.length;
    }
    
    // Update selected files list
    updateSelectedFilesList();
    
    // Update button states
    updateButtonStates();
    
    log(`Processed selection: ${state.selectedImages.length} images selected`, 'info');

    if (state.selectedImages.length === 0) {
      showToast('No images found in the selected region', 'warning');
    }
    
    // Hide loading indicator if it was shown
    if (state.isLoading) {
      hideLoadingIndicator();
    }
  };
  
  // Function to handle marker click
  const handleMarkerClick = (marker, pointData) => {
    const fileName = pointData.filename;
    
    // Check if this image is already selected
    const selectedIndex = state.selectedImages.indexOf(fileName);
    
    if (selectedIndex === -1) {
      // Not selected, so select it
      state.selectedImages.push(fileName);
      
      // Highlight the marker
      if (marker.setStyle) {
        marker.setStyle(markerSelectedStyle);
      }
      
      // Mark this marker as manually selected
      marker._manuallySelected = true;
    } else {
      // Already selected, so deselect it
      state.selectedImages.splice(selectedIndex, 1);
      
      // Check if this marker is also selected by a drawn region
      const latLng = marker.getLatLng();
      const point = { lat: latLng.lat, lng: latLng.lng };
      let isSelectedByRegion = false;
      
      // Check if point is within current selection
      if (state.currentSelection) {
        const selectionLayer = state.currentSelection.layer;
        const selectionType = state.currentSelection.type;
        
        if (selectionType === 'polygon') {
          // For polygon, we need to get the coordinates
          const geoJson = selectionLayer.toGeoJSON();
          if (geoJson && geoJson.geometry && geoJson.geometry.coordinates) {
            // Convert coordinates to array of {lat, lng} objects
            const polygonCoords = geoJson.geometry.coordinates[0].map(coord => ({
              lng: coord[0],
              lat: coord[1]
            }));
            isSelectedByRegion = isPointInPolygon(point, polygonCoords);
          }
        } else if (selectionType === 'rectangle') {
          // For rectangle, use bounds
          const bounds = selectionLayer.getBounds();
          isSelectedByRegion = isPointInRectangle(point, bounds);
        }
      }
      
      if (isSelectedByRegion) {
        // Keep it highlighted as region-selected
        if (marker.setStyle) {
          marker.setStyle(markerRegionStyle);
        }
      } else {
        // Reset to default marker style
        if (marker.setStyle) {
          marker.setStyle(markerDefaultStyle);
        }
      }
      
      // Mark this marker as not manually selected
      marker._manuallySelected = false;
    }
    
    // Keep hover preview responsive to style changes
    hideMarkerHover();
    
    // Update selected count
    if (els.selectedCount) {
      els.selectedCount.textContent = state.selectedImages.length;
    }
    
    // Update selection count display
    updateSelectionCountDisplay();
    
    // Update selected files list
    updateSelectedFilesList();
    
    // Update button states
    updateButtonStates();
    
    log(`Marker clicked: ${fileName}, selected count: ${state.selectedImages.length}`, 'info');
  };
  
  // Function to clear image selection
  const clearImageSelection = () => {
    clearImageSelectionStyling();
    state.selectedImages = [];
    updateSelectionCountDisplay();
    
    // Update statistics
    if (els.selectedCount) {
      els.selectedCount.textContent = '0';
    }
    
    // Update selected files list
    updateSelectedFilesList();
    
    // Update button states
    updateButtonStates();
  };

  // Function to update selection count display
  const updateSelectionCountDisplay = () => {
    // Create or update selection count element
    if (!state.selectionCountElement) {
      state.selectionCountElement = document.createElement('div');
      state.selectionCountElement.className = 'selection-count';
      state.selectionCountElement.style.cssText = `
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 96, 196, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      document.querySelector('#map').appendChild(state.selectionCountElement);
    }
    
    // Update text
    state.selectionCountElement.textContent = `${state.selectedImages.length} images selected`;
    
    // Hide if no images selected
    state.selectionCountElement.style.display = state.selectedImages.length > 0 ? 'block' : 'none';
  };
  
  // Function to update button states based on conditions
  const updateButtonStates = () => {
    // Only update button states if we're not in loading state
    if (state.isLoading) return;
    
    if (els.loadImagesBtn) {
      // Enable button only if we have a selected folder
      const hasSelectedFolder = !!state.selectedFolder;
      
      els.loadImagesBtn.disabled = !hasSelectedFolder;
    }
    
    if (els.exportImagesBtn) {
      // Enable button only if we have selected images
      const hasSelectedImages = state.selectedImages.length > 0;
      
      els.exportImagesBtn.disabled = !hasSelectedImages;
    }
    
    if (els.clearSelectionBtn) {
      // Enable button only if we have a current selection
      const hasCurrentSelection = !!state.currentSelection;
      
      els.clearSelectionBtn.disabled = !hasCurrentSelection;
    }
  };
  
  // Function to update selected files list
  const updateSelectedFilesList = () => {
    if (!els.selectedFilesList) return;
    
    if (state.selectedImages.length === 0) {
      els.selectedFilesList.innerHTML = 'No files selected';
      return;
    }
    
    // Clear the list
    els.selectedFilesList.innerHTML = '';
    
    // Add each selected file
    state.selectedImages.forEach(filename => {
      const fileElement = document.createElement('div');
      fileElement.className = 'selected-file-item';
      fileElement.textContent = filename;
      els.selectedFilesList.appendChild(fileElement);
    });
  };

  window.addEventListener('DOMContentLoaded', () => {
    // Cache elements after DOM is ready
    Object.assign(els, {
      selectFolderBtn: qs('selectFolderBtn'),
      loadImagesBtn: qs('loadImagesBtn'),
      exportImagesBtn: qs('exportImagesBtn'),
      clearSelectionBtn: qs('clearSelectionBtn'),
      langEn: qs('langEn'),
      langAr: qs('langAr'),
      toastContainer: qs('toastContainer'),
      folderPathText: qs('folderPathText'),
      totalImagesCount: qs('totalImagesCount'),
      selectedCount: qs('selectedCount'),
      selectedFilesList: qs('selectedFilesList'),
      polygonList: qs('polygonList'),
      polygonCount: qs('polygonCount'),
      polygonSelectedCount: qs('polygonSelectedCount'),
      polygonHiddenCount: qs('polygonHiddenCount'),
      importKmlBtn: qs('importKmlBtn')
    });

    initLang();
    // Initialize map ONLY ONCE after DOM is fully loaded
    initMap();
    bindEvents();
    
    // Initially disable the export button
    if (els.exportImagesBtn) {
      els.exportImagesBtn.disabled = true;
    }
    
    // Initially disable the load images button
    if (els.loadImagesBtn) {
      els.loadImagesBtn.disabled = true;
    }
    
    // Expose function globally for IPC communication
    window.handleGPSData = handleGPSData;
    
    // Expose public API
    window.mapAPI = {
      getCurrentSelection,
      getCurrentBounds,
      clearSelection,
    getSelectedImages: () => [...state.selectedImages], // Return a copy of the array
    getPolygons: () => [...state.polygons],
      setPolygonVisibility,
      setPolygonExportSelection
    // KML import is handled via UI button; expose for external triggers if needed
    // importKml: importKmlFlow
    };

    // Initial render of polygon panel (empty state)
    renderPolygonPanel();
  });
  
  // Cleanup function to remove event listeners
  window.addEventListener('beforeunload', () => {
    if (state.map) {
      window.removeEventListener('resize', handleWindowResize);
      
      // Clean up draw event listeners if they were set up
      if (drawEventListenersSetup) {
        state.map.off(L.Draw.Event.DRAWSTART);
        state.map.off(L.Draw.Event.DRAWSTOP);
        state.map.off(L.Draw.Event.CREATED);
        state.map.off(L.Draw.Event.EDITED);
        state.map.off(L.Draw.Event.DELETED);
      }
      
      if (state.drawnItems) {
        state.drawnItems.clearLayers();
      }
    }
  });
})();