/**
 * Electron Builder Configuration
 * This configuration ensures proper Windows build compatibility
 */
module.exports = {
  appId: "com.shamal.tools",
  productName: "Shamal Tools",
  directories: {
    output: "dist",
    buildResources: "assets"
  },
  files: [
    "main.js",
    "preload.js",
    "modules/**/*",
    "renderer/**/*",
    "!node_modules/**/*",
    "!**/*.map",
    "!**/*.md"
  ],
  extraResources: [
    {
      from: "../python/",
      to: "resources/python/",
      filter: ["**/*"]
    }
  ],
  win: {
    target: [
      {
        target: "portable",
        arch: ["x64"]
      },
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    publisherName: "Shamal Tools Team",
    verifyUpdateCodeSignature: false // Set to true for production builds with valid certificates
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  portable: {
    artifactName: "${productName}-Portable-${version}.${ext}",
    unpackDirName: "shamal-tools-resources"
  },
  asar: true,
  compression: "maximum",
  publish: null
};