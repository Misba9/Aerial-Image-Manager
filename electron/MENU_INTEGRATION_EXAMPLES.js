/**
 * MENU INTEGRATION EXAMPLES
 * 
 * This file contains example code snippets showing how to integrate
 * the application menu system into existing modules.
 * 
 * Copy and adapt these examples into your actual module files.
 */

// ============================================================================
// EXAMPLE 1: Map Organizer Integration (map.js)
// ============================================================================

/*
// Add this code to electron/modules/mapOrganizer/map.js

// Initialize menu action listener
function initMenuActions() {
  if (!window.api || !window.api.onMenuAction) {
    console.warn('Menu API not available');
    return;
  }

  window.api.onMenuAction((data) => {
    console.log('Map Organizer received menu action:', data.action);
    
    switch (data.action) {
      case 'import-images':
        // Trigger the load images button
        document.getElementById('loadImagesBtn')?.click();
        break;
      
      case 'import-kml':
        // Trigger the import KML button
        document.getElementById('importKmlBtn')?.click();
        break;
      
      case 'export-images':
        // Trigger the export selected images button
        document.getElementById('exportImagesBtn')?.click();
        break;
      
      case 'clear-selection':
        // Trigger the clear selection button
        document.getElementById('clearSelectionBtn')?.click();
        break;
      
      case 'delete-polygon':
        // Delete the currently selected polygon
        if (selectedPolygonId) {
          deletePolygon(selectedPolygonId);
        }
        break;
      
      case 'toggle-polygon-panel':
        // Toggle polygon panel visibility
        const panel = document.getElementById('polygonPanel');
        if (panel) {
          panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        }
        break;
      
      case 'reset-map-view':
        // Reset map to default view
        if (map && allMarkers.length > 0) {
          const group = L.featureGroup(allMarkers);
          map.fitBounds(group.getBounds().pad(0.1));
        }
        break;
      
      case 'zoom-in':
        // Zoom in on the map
        if (map) {
          map.zoomIn();
        }
        break;
      
      case 'zoom-out':
        // Zoom out on the map
        if (map) {
          map.zoomOut();
        }
        break;
      
      default:
        console.log('Unhandled menu action:', data.action);
    }
  });
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // ... existing initialization code ...
  
  // Initialize menu actions
  initMenuActions();
});
*/

// ============================================================================
// EXAMPLE 2: Smart Geotagging Integration (geotag.js)
// ============================================================================

/*
// Add this code to electron/modules/geotagging/geotag.js

// Initialize menu action listener
function initMenuActions() {
  if (!window.api || !window.api.onMenuAction) {
    console.warn('Menu API not available');
    return;
  }

  window.api.onMenuAction((data) => {
    console.log('Geotagging received menu action:', data.action);
    
    switch (data.action) {
      case 'import-images':
        // Trigger the select folder button
        document.getElementById('selectFolderBtn')?.click();
        break;
      
      case 'import-csv':
        // Trigger the import CSV button
        document.getElementById('importCsvBtn')?.click();
        break;
      
      case 'export-csv':
        // Trigger the export CSV button
        document.getElementById('exportCsvBtn')?.click();
        break;
      
      case 'clear-selection':
        // Clear selected images
        document.querySelectorAll('.image-card.selected').forEach(card => {
          card.classList.remove('selected');
        });
        break;
      
      case 'undo':
        // Implement undo functionality if available
        console.log('Undo action requested');
        break;
      
      case 'redo':
        // Implement redo functionality if available
        console.log('Redo action requested');
        break;
      
      default:
        console.log('Unhandled menu action:', data.action);
    }
  });
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // ... existing initialization code ...
  
  // Initialize menu actions
  initMenuActions();
});
*/

// ============================================================================
// EXAMPLE 3: Image Renamer Integration (renamer.js)
// ============================================================================

/*
// Add this code to electron/modules/flightRenamer/renamer.js

// Initialize menu action listener
function initMenuActions() {
  if (!window.api || !window.api.onMenuAction) {
    console.warn('Menu API not available');
    return;
  }

  window.api.onMenuAction((data) => {
    console.log('Renamer received menu action:', data.action);
    
    switch (data.action) {
      case 'import-images':
        // Trigger the select folder button
        document.getElementById('selectFolderBtn')?.click();
        break;
      
      case 'undo':
        // Trigger the undo button if available
        document.getElementById('undoBtn')?.click();
        break;
      
      case 'clear-selection':
        // Clear any selections
        console.log('Clear selection requested');
        break;
      
      default:
        console.log('Unhandled menu action:', data.action);
    }
  });
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // ... existing initialization code ...
  
  // Initialize menu actions
  initMenuActions();
});
*/

// ============================================================================
// EXAMPLE 4: Dashboard Integration (dashboard.js)
// ============================================================================

/*
// Add this code to electron/renderer/dashboard.js

// Initialize menu action listener
function initMenuActions() {
  if (!window.api || !window.api.onMenuAction) {
    console.warn('Menu API not available');
    return;
  }

  window.api.onMenuAction((data) => {
    console.log('Dashboard received menu action:', data.action);
    
    switch (data.action) {
      case 'show-documentation':
        // Show documentation modal or navigate to docs
        showDocumentation();
        break;
      
      case 'check-updates':
        // Check for application updates
        checkForUpdates();
        break;
      
      default:
        console.log('Unhandled menu action:', data.action);
    }
  });
}

function showDocumentation() {
  // Implement documentation display
  alert('Documentation will be displayed here');
}

function checkForUpdates() {
  // Implement update check
  alert('Checking for updates...');
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // ... existing initialization code ...
  
  // Initialize menu actions
  initMenuActions();
});
*/

// ============================================================================
// EXAMPLE 5: Advanced - State Management with Undo/Redo
// ============================================================================

/*
// Example of implementing undo/redo functionality

class StateManager {
  constructor() {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = 50;
  }
  
  pushState(state) {
    // Remove any states after current index
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state
    this.history.push(state);
    this.currentIndex++;
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
  }
  
  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }
  
  redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }
  
  canUndo() {
    return this.currentIndex > 0;
  }
  
  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }
}

// Usage in your module
const stateManager = new StateManager();

// Save state before making changes
function saveState() {
  const state = {
    polygons: JSON.parse(JSON.stringify(polygons)),
    selectedImages: [...selectedImages],
    timestamp: Date.now()
  };
  stateManager.pushState(state);
}

// Handle undo/redo from menu
window.api.onMenuAction((data) => {
  if (data.action === 'undo') {
    const previousState = stateManager.undo();
    if (previousState) {
      restoreState(previousState);
    }
  } else if (data.action === 'redo') {
    const nextState = stateManager.redo();
    if (nextState) {
      restoreState(nextState);
    }
  }
});

function restoreState(state) {
  // Restore the application state
  polygons = JSON.parse(JSON.stringify(state.polygons));
  selectedImages = [...state.selectedImages];
  // Update UI accordingly
  updateUI();
}
*/

// ============================================================================
// EXAMPLE 6: Keyboard Shortcut Handler (Alternative Approach)
// ============================================================================

/*
// If you want to handle shortcuts directly in the renderer as well

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Check for Ctrl/Cmd key combinations
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    
    if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
      // Undo
      e.preventDefault();
      handleUndo();
    } else if (ctrlOrCmd && e.key === 'z' && e.shiftKey) {
      // Redo
      e.preventDefault();
      handleRedo();
    } else if (ctrlOrCmd && e.key === 'd') {
      // Clear selection
      e.preventDefault();
      handleClearSelection();
    }
    // Add more shortcuts as needed
  });
}

// Note: The menu shortcuts will still work, this is just a fallback
// or for additional shortcuts not in the menu
*/

// ============================================================================
// EXAMPLE 7: Context-Aware Menu Actions
// ============================================================================

/*
// Handle menu actions differently based on current state

let currentTool = 'none'; // 'polygon', 'marker', 'none'
let hasSelection = false;

window.api.onMenuAction((data) => {
  // Context-aware handling
  if (data.action === 'delete-polygon') {
    if (currentTool === 'polygon' && hasSelection) {
      deleteSelectedPolygon();
    } else {
      showToast('No polygon selected', 'warning');
    }
  }
  
  if (data.action === 'export-images') {
    if (selectedImages.length > 0) {
      exportSelectedImages();
    } else {
      showToast('No images selected', 'warning');
    }
  }
});

// Update context when user interacts
function onPolygonSelect(polygon) {
  currentTool = 'polygon';
  hasSelection = true;
  selectedPolygon = polygon;
}

function onImageSelect(image) {
  hasSelection = true;
  selectedImages.push(image);
}
*/

// ============================================================================
// NOTES
// ============================================================================

/*
IMPORTANT TIPS:

1. Always check if window.api exists before using it
2. Use console.log to debug menu actions
3. Keep menu action handlers simple - call existing functions
4. Handle edge cases (no selection, no data, etc.)
5. Provide user feedback (toasts, alerts) for menu actions
6. Test all keyboard shortcuts on different platforms
7. Document any new menu actions you add

TESTING CHECKLIST:

□ Menu appears on application start
□ All menu items are clickable
□ Keyboard shortcuts work
□ Console logs show menu actions
□ Actions trigger correct functions
□ Error handling works properly
□ Works on Windows/Mac/Linux
□ Works in both dev and production modes

*/

