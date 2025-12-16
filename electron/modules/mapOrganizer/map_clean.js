// Initialize the map after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function () {
  // Initialize the map centered at a default location (world view)
  const map = L.map('map').setView([20.0, 0.0], 2);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '',
    maxZoom: 19
  }).addTo(map);

  // Handle window resize to ensure map displays correctly
  window.addEventListener('resize', function() {
    setTimeout(function() {
      map.invalidateSize();
    }, 100);
  });

  // Force resize fix for Electron environment
  setTimeout(function() {
    map.invalidateSize();
  }, 500);

  // Folder selection button
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  const folderPathText = document.getElementById('folderPathText');
  const loadImagesBtn = document.getElementById('loadImagesBtn');
  const exportSelectedBtn = document.getElementById('exportSelectedBtn');
  const totalImagesCount = document.getElementById('totalImagesCount');
  const selectedCount = document.getElementById('selectedCount');
  const selectedFilesList = document.getElementById('selectedFilesList');

  // Event listener for folder selection
  selectFolderBtn.addEventListener('click', function() {
    // In a real implementation, this would open a folder dialog
    folderPathText.textContent = "C:/Users/Example/Documents/Images";
    loadImagesBtn.disabled = false;
  });

  // Event listener for loading images
  loadImagesBtn.addEventListener('click', function() {
    // Simulate loading images
    totalImagesCount.textContent = "12";
    exportSelectedBtn.disabled = false;
    
    // Add some sample markers to the map
    const sampleMarkers = [
      { lat: 40.7128, lng: -74.0060, name: "New York" },
      { lat: 34.0522, lng: -118.2437, name: "Los Angeles" },
      { lat: 41.8781, lng: -87.6298, name: "Chicago" },
      { lat: 29.7604, lng: -95.3698, name: "Houston" },
      { lat: 33.4484, lng: -112.0740, name: "Phoenix" }
    ];
    
    sampleMarkers.forEach(marker => {
      L.marker([marker.lat, marker.lng])
        .addTo(map)
        .bindPopup(marker.name);
    });
    
    // Fit map to marker bounds
    const group = new L.featureGroup(sampleMarkers.map(m => L.marker([m.lat, m.lng])));
    map.fitBounds(group.getBounds().pad(0.1));
  });

  // Event listener for exporting selected images
  exportSelectedBtn.addEventListener('click', function() {
    alert("Export functionality would be implemented here");
  });

  // Sample selected files for demonstration
  function updateSelectedFiles() {
    selectedFilesList.innerHTML = "";
    const files = ["image1.jpg", "image2.png", "image3.jpeg"];
    
    if (files.length === 0) {
      selectedFilesList.textContent = "No files selected";
      return;
    }
    
    files.forEach(file => {
      const fileElement = document.createElement('div');
      fileElement.textContent = file;
      fileElement.style.padding = "0.25rem 0";
      selectedFilesList.appendChild(fileElement);
    });
    
    selectedCount.textContent = files.length;
  }

  // Initialize with some sample selected files
  updateSelectedFiles();
});