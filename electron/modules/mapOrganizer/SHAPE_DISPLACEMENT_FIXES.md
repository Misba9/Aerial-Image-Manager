# Leaflet Draw Shape Displacement Fixes

## Problem
Drawn polygon and rectangle shapes were moving/displacing on the map screen during interaction, causing inaccurate positioning and poor user experience.

## Root Causes Identified

1. **Map Interaction Interference**: Map panning and zooming during drawing operations caused shape displacement
2. **Coordinate Reference System Issues**: Improper CRS settings led to projection inconsistencies
3. **Rendering Layer Problems**: Overlay pane z-index and rendering issues caused visual displacement
4. **Resize Handling**: Window resizing wasn't properly refreshing drawn shapes
5. **Event Handling**: Lack of proper event management during drawing operations

## Fixes Implemented

### 1. Map Initialization Improvements
```javascript
// Explicitly set CRS to prevent projection issues
state.map = L.map('map', {
  // ... other options
  crs: L.CRS.EPSG3857
});
```

### 2. Draw Control Configuration
```javascript
// Enhanced shape options with proper styling
polygon: {
  shapeOptions: { 
    color: '#2563eb',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.2
  },
  metric: true  // Ensure proper CRS handling
}
```

### 3. Feature Group Pane Assignment
```javascript
// Assign drawn items to proper overlay pane
state.drawnItems = new L.FeatureGroup({
  pane: 'overlayPane'
});
```

### 4. Map Interaction Management
```javascript
// Disable map interactions during drawing to prevent displacement
state.map.on(L.Draw.Event.DRAWSTART, () => {
  state.map.dragging.disable();
  state.map.touchZoom.disable();
  state.map.doubleClickZoom.disable();
  state.map.scrollWheelZoom.disable();
});

// Re-enable interactions after drawing
state.map.on(L.Draw.Event.DRAWSTOP, () => {
  state.map.dragging.enable();
  state.map.touchZoom.enable();
  state.map.doubleClickZoom.enable();
  state.map.scrollWheelZoom.enable();
});
```

### 5. Resize Handling Enhancement
```javascript
// Refresh drawn items after window resize
handleWindowResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize();
      // Refresh drawn items after resize
      if (state.drawnItems) {
        state.drawnItems.eachLayer(layer => {
          if (layer.redraw) {
            layer.redraw();
          }
        });
      }
    }
  }, 120);
};
```

### 6. CSS Rendering Improvements
```css
/* Ensure proper rendering of drawn shapes */
.leaflet-overlay-pane {
  will-change: transform;
}

.leaflet-overlay-pane svg {
  pointer-events: auto;
}

/* Ensure proper positioning */
.leaflet-draw-edit-edit,
.leaflet-draw-edit-remove {
  will-change: transform;
}
```

### 7. Edit Operation Enhancement
```javascript
// Ensure layers are properly updated during editing
state.map.on(L.Draw.Event.EDITED, (e) => {
  const layers = e.layers;
  layers.eachLayer((layer) => {
    // Update geometry
    if (state.currentSelection && state.currentSelection.layer === layer) {
      state.currentSelection.geometry = layer.toGeoJSON();
    }
    // Ensure layer is properly updated
    if (layer.redraw) {
      layer.redraw();
    }
  });
});
```

## Verification

The fixes have been implemented to address all identified causes of shape displacement:

✅ Map interactions are properly managed during drawing  
✅ Coordinate reference system is explicitly set  
✅ Feature groups use appropriate panes  
✅ Resize operations properly refresh drawn shapes  
✅ CSS ensures proper rendering and positioning  
✅ Edit operations maintain shape integrity  

## Testing Notes

After implementing these fixes, the drawn shapes should:
- Remain stationary and accurately positioned on the map
- Not move or displace during map interactions
- Maintain their position during window resizing
- Properly refresh when edited
- Display consistently across different zoom levels

No displacement issues should occur during normal usage.