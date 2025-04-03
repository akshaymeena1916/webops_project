// Initialize Socket.io connection (auto-adapts to deployment URL)
const socket = io(window.location.origin, { 
  reconnectionAttempts: 3, // Better error handling
  timeout: 10000 
});

// Map setup with OpenStreetMap tiles
const map = L.map("map").setView([20, 77], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18,
}).addTo(map);

// Custom marker icon (replace with your own SVG/PNG)
const userIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/447/447031.png", // Green pin
  iconSize: [32, 32],
  popupAnchor: [0, -15],
});

const otherUserIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/447/447042.png", // Red pin
  iconSize: [32, 32],
});

// Track all markers by socket.id
const markers = {};
let currentUserMarker = null;
let lastUpdate = 0;

// DOM Elements
const statusElement = document.createElement("div");
statusElement.className = "tracking-status";
document.body.appendChild(statusElement);

// Check geolocation support
if (!navigator.geolocation) {
  statusElement.textContent = "Error: Geolocation not supported!";
  statusElement.style.color = "red";
} else {
  statusElement.textContent = "Tracking active...";
  statusElement.style.color = "green";
}

// Main tracking function
function trackLocation() {
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      updateUserPosition(latitude, longitude);
    },
    (error) => {
      console.error("Geolocation error:", error);
      statusElement.textContent = `Error: ${error.message}`;
      statusElement.style.color = "red";
    },
    { 
      enableHighAccuracy: true, 
      maximumAge: 10000, 
      timeout:30000
    }
  );
}

// Update current user's position
function updateUserPosition(lat, lng) {
  // Throttle updates to 1/second
  if (Date.now() - lastUpdate < 1000) return;
  lastUpdate = Date.now();

  // Emit to server
  socket.emit("updateLocation", { 
    latitude: lat, 
    longitude: lng 
  });

  // Update or create marker
  if (!currentUserMarker) {
    currentUserMarker = L.marker([lat, lng], { 
      icon: userIcon,
      zIndexOffset: 1000 // Ensure user marker stays on top
    })
      .addTo(map)
      .bindPopup("You are here!")
      .openPopup();
  } else {
    currentUserMarker.setLatLng([lat, lng]);
  }

  // Smooth map pan (only if moved > 100m)
  const currentCenter = map.getCenter();
  const distance = currentCenter.distanceTo([lat, lng]);
  if (distance > 100) {
    map.setView([lat, lng], map.getZoom(), {
      animate: true,
      duration: 1,
    });
  }
}

// Handle other users' updates
socket.on("locationUpdate", ({ id, coords }) => {
  if (id == socket.id) return; // Skip own updates

  if (!markers[id]) {
    markers[id] = L.marker([coords.latitude, coords.longitude], {
      icon: otherUserIcon,
    })
      .addTo(map)
      .bindPopup(`User: ${id.slice(0, 5)}...`); // Short ID for readability
  } else {
    markers[id].setLatLng([coords.latitude, coords.longitude]);
  }
});

// Remove disconnected users
socket.on("userDisconnected", (id) => {
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});

// Start tracking
trackLocation();

// Add CSS for the status element (put this in style.css)
/*
.tracking-status {
  position: absolute;
  top: 10px;
  right: 10px;
  background: white;
  padding: 5px 10px;
  border-radius: 5px;
  z-index: 1000;
  font-family: Poppins, sans-serif;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}
*/