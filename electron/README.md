# Shamal Tools - Map Organizer Module

## Building for Windows

### Prerequisites
- Node.js (version 16 or higher)
- Windows development environment
- Bundled Python runtime prepared inside `shamalTools/python` (see below)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Bundled Python Runtime (no system Python required)
1) Download the official **Windows x86-64 embeddable Python** (3.11.x) from python.org.  
2) Extract the zip into `shamalTools/python/` so that `shamalTools/python/python.exe` exists.  
3) Enable site packages in the embeddable distro by opening `python311._pth` (or matching version) in that folder and uncommenting the `import site` line.  
4) Install required libraries into the bundled runtime:
```bash
# from repo root
py -3.11 -m pip install --upgrade pip
py -3.11 -m pip install --target shamalTools/python/Lib/site-packages -r shamalTools/python/requirements.txt
```
This bundles Pillow and any future dependencies directly into the shipped app.

### Building for Windows

#### Portable Version
```bash
npm run build:win
```

#### Installer Version
```bash
npm run build:win-installer
```

### Build Output
- Portable version: `dist/` directory as a single executable
- Installer version: `dist/` directory with NSIS installer

### Features
- Handles large image sets (10k+ images)
- Memory-safe marker handling
- Optimized for Windows compatibility
- DevTools disabled in production builds