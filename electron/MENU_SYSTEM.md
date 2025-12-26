# Application Menu System Documentation

## Overview

The Shamal Tools application now features a **native desktop-style application menu bar** similar to VS Code, providing professional menu navigation with keyboard shortcuts.

## Menu Structure

### 📁 File Menu
- **Import Images** (`Ctrl+O`) - Opens dialog to import images
- **Import CSV (Geotagging)** - Import geotagging data from CSV
- **Import KML / Shapefile** - Import map data
- **Export Selected Images** (`Ctrl+E`) - Export selected images
- **Export CSV** - Export data to CSV format
- **Exit** (`Ctrl+Q`) - Quit the application

### ✏️ Edit Menu
- **Undo** (`Ctrl+Z`) - Undo last action
- **Redo** (`Ctrl+Shift+Z`) - Redo last undone action
- **Clear Selection** (`Ctrl+D`) - Clear current selection
- **Delete Selected Polygon** (`Delete`) - Remove selected polygon

### 👁️ View Menu
- **Toggle Polygon Panel** (`Ctrl+P`) - Show/hide polygon panel
- **Toggle Image Labels** (`Ctrl+L`) - Show/hide image labels
- **Reset Map View** (`Ctrl+R`) - Reset map to default view
- **Zoom In** (`Ctrl++`) - Zoom into map
- **Zoom Out** (`Ctrl+-`) - Zoom out of map
- **Reload** (`Ctrl+Shift+R`) - Reload current page
- **Toggle Developer Tools** (`Ctrl+Shift+I`) - Open DevTools (dev mode only)
- **Toggle Full Screen** (`F11`) - Enter/exit fullscreen

### 🔧 Tools Menu
- **Image Renamer** (`Ctrl+1`) - Navigate to Image Renamer tool
- **Smart Geotagging** (`Ctrl+2`) - Navigate to Geotagging tool
- **Map Organizer** (`Ctrl+3`) - Navigate to Map Organizer tool
- **Back to Dashboard** (`Ctrl+H`) - Return to main dashboard

### ❓ Help Menu
- **Documentation** - View online documentation
- **View User Manual** - Open the user manual document
- **About Shamal Tools** - Display app information
- **Check for Updates** - Check for application updates

## Implementation Details

### Location
The menu system is implemented in `electron/main.js` in the `createApplicationMenu()` function.

### How It Works

1. **Menu Creation**: The `createApplicationMenu()` function creates a native Electron menu using `Menu.buildFromTemplate()`
2. **Menu Actions**: Each menu item has a click handler that either:
   - Performs a direct action (e.g., quit app, reload page)
   - Sends a message to the renderer process via IPC
   - Navigates to a different page

3. **IPC Communication**: Menu actions are communicated to renderer processes using:
   ```javascript
   mainWindow.webContents.send('menu-action', { action: 'action-name' });
   ```

### Listening to Menu Actions in Renderer

To respond to menu actions in your renderer JavaScript files, use:

```javascript
// Listen for menu actions
if (window.api && window.api.onMenuAction) {
  window.api.onMenuAction((data) => {
    console.log('Menu action received:', data.action);
    
    switch (data.action) {
      case 'import-images':
        // Handle import images
        handleImportImages();
        break;
      
      case 'export-images':
        // Handle export images
        handleExportImages();
        break;
      
      case 'clear-selection':
        // Handle clear selection
        clearSelection();
        break;
      
      case 'toggle-polygon-panel':
        // Handle toggle polygon panel
        togglePolygonPanel();
        break;
      
      // Add more cases as needed
      default:
        console.log('Unhandled menu action:', data.action);
    }
  });
}
```

## Connecting to Existing Functionality

### Example 1: Map Organizer - Clear Selection

In `electron/modules/mapOrganizer/map.js`, add:

```javascript
// Listen for menu actions
window.api.onMenuAction((data) => {
  if (data.action === 'clear-selection') {
    // Call existing clear selection function
    document.getElementById('clearSelectionBtn')?.click();
  }
});
```

### Example 2: Geotagging - Import CSV

In `electron/modules/geotagging/geotag.js`, add:

```javascript
// Listen for menu actions
window.api.onMenuAction((data) => {
  if (data.action === 'import-csv') {
    // Call existing import CSV function
    document.getElementById('importCsvBtn')?.click();
  }
});
```

### Example 3: Direct Function Call

```javascript
window.api.onMenuAction((data) => {
  switch (data.action) {
    case 'zoom-in':
      if (typeof map !== 'undefined') {
        map.zoomIn();
      }
      break;
    
    case 'zoom-out':
      if (typeof map !== 'undefined') {
        map.zoomOut();
      }
      break;
  }
});
```

## Available Menu Actions

Here's a complete list of menu action identifiers you can listen for:

| Action ID | Description |
|-----------|-------------|
| `import-images` | Import images dialog |
| `import-csv` | Import CSV for geotagging |
| `import-kml` | Import KML/Shapefile |
| `export-images` | Export selected images |
| `export-csv` | Export to CSV |
| `undo` | Undo last action |
| `redo` | Redo last action |
| `clear-selection` | Clear current selection |
| `delete-polygon` | Delete selected polygon |
| `toggle-polygon-panel` | Show/hide polygon panel |
| `toggle-image-labels` | Show/hide image labels |
| `reset-map-view` | Reset map view |
| `zoom-in` | Zoom in |
| `zoom-out` | Zoom out |
| `show-documentation` | Show documentation |
| `check-updates` | Check for updates |

## Customization

### Adding a New Menu Item

1. Open `electron/main.js`
2. Find the `createApplicationMenu()` function
3. Add your menu item to the appropriate submenu:

```javascript
{
  label: 'My New Feature',
  accelerator: 'CmdOrCtrl+N',
  click: () => {
    console.log('Menu: My New Feature');
    if (mainWindow) {
      mainWindow.webContents.send('menu-action', { action: 'my-new-feature' });
    }
  }
}
```

4. In your renderer file, listen for the action:

```javascript
window.api.onMenuAction((data) => {
  if (data.action === 'my-new-feature') {
    // Your code here
  }
});
```

### Modifying Keyboard Shortcuts

Change the `accelerator` property:
- `CmdOrCtrl` - Ctrl on Windows/Linux, Cmd on Mac
- `Shift`, `Alt` - Modifier keys
- `Plus`, `Minus` - Special keys
- `A-Z`, `0-9` - Letter/number keys
- `F1-F12` - Function keys

Example:
```javascript
accelerator: 'CmdOrCtrl+Shift+E'  // Ctrl+Shift+E or Cmd+Shift+E
```

## Platform Differences

The menu system automatically adapts to different platforms:
- **Windows/Linux**: Menu appears in the window title bar
- **macOS**: Menu appears in the system menu bar at the top of the screen

The `isMac` variable is used to provide platform-specific shortcuts when needed.

## Development Mode Features

When running in development mode (`isDev = true`):
- **Toggle Developer Tools** menu item is visible
- DevTools can be opened with `Ctrl+Shift+I` or `F12`
- Additional debugging options are available

In production mode:
- Developer Tools menu item is hidden
- DevTools shortcuts are disabled for security

## Testing the Menu

1. Start the application in development mode
2. Check that the menu bar appears at the top
3. Test each menu item by clicking it
4. Verify keyboard shortcuts work
5. Check console logs for menu action messages

## Troubleshooting

### Menu Not Appearing
- Check that `createApplicationMenu()` is being called in `createWindow()`
- Verify `Menu.setApplicationMenu(menu)` is executed
- Ensure `window.removeMenu()` is not being called

### Keyboard Shortcuts Not Working
- Check for conflicts with browser/OS shortcuts
- Verify the accelerator syntax is correct
- Test in both development and production modes

### Menu Actions Not Received
- Verify `window.api.onMenuAction` is defined
- Check that the preload script is loaded correctly
- Ensure the action name matches exactly

## Future Enhancements

Potential improvements to consider:
- Dynamic menu items based on current context
- Recent files/folders submenu
- Customizable keyboard shortcuts
- Menu state (checked/unchecked items)
- Disabled state for unavailable actions
- Localization/translation support

## Support

For issues or questions about the menu system:
1. Check console logs for error messages
2. Verify IPC communication is working
3. Test menu actions individually
4. Review this documentation

---

**Last Updated**: December 2024  
**Version**: 1.0.4

