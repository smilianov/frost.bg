// Един интерфейс, два доставчика. Leaflet е глобален (vendor/leaflet/leaflet.js), Google се зарежда по нужда.
const BG_CENTER = [42.7, 25.3], BG_ZOOM = 7;

function leafletMap({ container, onPick }) {
  const map = L.map(container).setView(BG_CENTER, BG_ZOOM);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  let marker = null;
  const setMarker = (lat, lon) => {
    if (!marker) marker = L.marker([lat, lon]).addTo(map); else marker.setLatLng([lat, lon]);
    map.setView([lat, lon], Math.max(map.getZoom(), 10));
  };
  map.on("click", (e) => { setMarker(e.latlng.lat, e.latlng.lng); onPick(e.latlng.lat, e.latlng.lng); });
  return { setMarker, destroy: () => map.remove() };
}

function loadGoogle(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async`;
    s.async = true; s.onload = () => resolve(window.google.maps); s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function googleMap({ container, googleKey, onPick }) {
  const maps = await loadGoogle(googleKey);
  const map = new maps.Map(container, { center: { lat: BG_CENTER[0], lng: BG_CENTER[1] }, zoom: BG_ZOOM, mapTypeControl: false, streetViewControl: false });
  let marker = null;
  const setMarker = (lat, lon) => {
    if (!marker) marker = new maps.Marker({ map }); marker.setPosition({ lat, lng: lon });
    map.panTo({ lat, lng: lon }); if (map.getZoom() < 10) map.setZoom(10);
  };
  map.addListener("click", (e) => { const lat = e.latLng.lat(), lon = e.latLng.lng(); setMarker(lat, lon); onPick(lat, lon); });
  return { setMarker, destroy: () => {} };
}

export async function createMap({ container, provider, googleKey, onPick }) {
  if (provider === "google" && googleKey) {
    try { return await googleMap({ container, googleKey, onPick }); }
    catch (_) { /* Google не се зареди — Leaflet отдолу */ }
  }
  return leafletMap({ container, onPick });
}
