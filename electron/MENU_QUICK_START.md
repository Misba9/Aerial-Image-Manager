# Application Menu - Quick Start Guide

## ✅ What Was Added

A **native desktop application menu bar** has been added to Shamal Tools with:
- 5 main menus: File, Edit, View, Tools, Help
- 30+ menu items with keyboard shortcuts
- Professional desktop app experience
- Cross-platform support (Windows, Mac, Linux)

## 🚀 How to Use

### For End Users

The menu bar appears automatically at the top of the application window. You can:

1. **Click menu items** to access features
2. **Use keyboard shortcuts** for quick access:
   - `Ctrl+O` - Import Images
   - `Ctrl+E` - Export Selected Images
   - `Ctrl+Z` - Undo
   - `Ctrl+Shift+Z` - Redo
   - `Ctrl+1/2/3` - Switch between tools
   - `F11` - Toggle fullscreen
   - And many more!

### For Developers

#### Quick Integration (3 Steps)

**Step 1:** Add menu listener to your module's JavaScript file:

```javascript
// Add this to your module (map.js, geotag.js, renamer.js, etc.)
function initMenuActions() {
  if (window.api && window.api.onMenuAction) {
    window.api.onMenuAction((data) => {
      console.log('Menu action:', data.action);
      
      // Handle menu actions
      switch (data.action) {
        case 'import-images':
          document.getElementById('loadImagesBtn')?.click();
          break;
        case 'export-images':
          document.getElementById('exportBtn')?.click();
          break;
        // Add more cases as needed
      }
    });
  }
}

// Call it on page load
document.addEventListener('DOMContentLoaded', initMenuActions);
```

**Step 2:** Test it:
- Start the app
- Click a menu item
- Check console for "Menu action: ..." message
- Verify your function is called

**Step 3:** Done! The menu now controls your feature.

## 📂 Files Modified

| File | Changes |
|------|---------|
| `electron/main.js` | ✅ Added `Menu` import<br>✅ Added `createApplicationMenu()` function<br>✅ Updated `createWindow()` to use menu<br>✅ Updated browser-window-created event |
| `electron/preload.js` | ✅ Added `onMenuAction` listener |
| `electron/MENU_SYSTEM.md` | ✅ Created (full documentation) |
| `electron/MENU_INTEGRATION_EXAMPLES.js` | ✅ Created (code examples) |
| `electron/MENU_QUICK_START.md` | ✅ Created (this file) |

## 🎯 Menu Structure

```
📁 File
  ├─ Import Images (Ctrl+O)
  ├─ Import CSV (Geotagging)
  ├─ Import KML / Shapefile
  ├─ Export Selected Images (Ctrl+E)
  ├─ Export CSV
  └─ Exit (Ctrl+Q)

✏️ Edit
  ├─ Undo (Ctrl+Z)
  ├─ Redo (Ctrl+Shift+Z)
  ├─ Clear Selection (Ctrl+D)
  └─ Delete Selected Polygon (Delete)

👁️ View
  ├─ Toggle Polygon Panel (Ctrl+P)
  ├─ Toggle Image Labels (Ctrl+L)
  ├─ Reset Map View (Ctrl+R)
  ├─ Zoom In (Ctrl++)
  ├─ Zoom Out (Ctrl+-)
  ├─ Reload (Ctrl+Shift+R)
  ├─ Toggle Developer Tools (Ctrl+Shift+I) [Dev Only]
  └─ Toggle Full Screen (F11)

🔧 Tools
  ├─ Image Renamer (Ctrl+1)
  ├─ Smart Geotagging (Ctrl+2)
  ├─ Map Organizer (Ctrl+3)
  └─ Back to Dashboard (Ctrl+H)

❓ Help
  ├─ Documentation
  ├─ View User Manual
  ├─ About Shamal Tools
  └─ Check for Updates
```

## 🔧 Common Tasks

### Add a New Menu Item

1. Open `electron/main.js`
2. Find `createApplicationMenu()` function
3. Add to appropriate submenu:

```javascript
{
  label: 'My Feature',
  accelerator: 'CmdOrCtrl+M',
  click: () => {
    console.log('Menu: My Feature');
    if (mainWindow) {
      mainWindow.webContents.send('menu-action', { 
        action: 'my-feature' 
      });
    }
  }
}
```

4. Handle it in your renderer:

```javascript
window.api.onMenuAction((data) => {
  if (data.action === 'my-feature') {
    myFeatureFunction();
  }
});
```

### Change a Keyboard Shortcut

Find the menu item in `createApplicationMenu()` and change the `accelerator`:

```javascript
accelerator: 'CmdOrCtrl+Shift+E'  // New shortcut
```

### Disable a Menu Item Conditionally

```javascript
{
  label: 'Export Images',
  enabled: hasSelection,  // Only enabled when there's a selection
  click: () => { /* ... */ }
}
```

## 🧪 Testing

1. **Start the app** in development mode
2. **Check menu appears** at the top of the window
3. **Click each menu item** - should see console logs
4. **Test keyboard shortcuts** - should trigger same actions
5. **Check all modules** - map, geotagging, renamer

### Test Checklist

- [ ] Menu bar visible on startup
- [ ] File menu items clickable
- [ ] Edit menu items clickable
- [ ] View menu items clickable
- [ ] Tools menu navigation works
- [ ] Help menu shows info
- [ ] Keyboard shortcuts work
- [ ] Console logs show actions
- [ ] No errors in console

## 📚 Documentation

- **Full Documentation**: See `MENU_SYSTEM.md`
- **Code Examples**: See `MENU_INTEGRATION_EXAMPLES.js`
- **This Guide**: `MENU_QUICK_START.md`

## 🐛 Troubleshooting

**Menu not showing?**
- Check that `createApplicationMenu()` is called
- Verify `Menu.setApplicationMenu(menu)` is executed
- Make sure `window.removeMenu()` is not called elsewhere

**Shortcuts not working?**
- Check for OS-level shortcut conflicts
- Verify accelerator syntax is correct
- Test in development mode first

**Actions not received?**
- Check `window.api.onMenuAction` exists
- Verify preload script is loaded
- Check console for errors

## 💡 Tips

1. **Always log menu actions** during development
2. **Test on multiple platforms** if possible
3. **Provide user feedback** (toasts, alerts) for actions
4. **Handle edge cases** (no selection, no data, etc.)
5. **Keep handlers simple** - call existing functions

## 🎉 Benefits

✅ Professional desktop app experience  
✅ Keyboard shortcuts for power users  
✅ Familiar menu structure  
✅ Easy to extend and customize  
✅ Cross-platform compatibility  
✅ No breaking changes to existing code  

## 📞 Support

For questions or issues:
1. Check console logs for errors
2. Review `MENU_SYSTEM.md` for details
3. See `MENU_INTEGRATION_EXAMPLES.js` for code samples
4. Test menu actions individually

---

**Ready to use!** The menu system is fully functional and waiting to be connected to your existing features.

