# Shamal Tools - Map Organizer Module

## Building for Windows

### Prerequisites
- Node.js (version 16 or higher)
- Python 3.8 or higher with Pillow library installed
- Windows development environment

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

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

### Python Dependencies
The application bundles Python scripts that require:
- Pillow library for EXIF processing
- Standard libraries: os, sys, json, pathlib, shutil, datetime

Install Pillow with:
```bash
pip install Pillow
```