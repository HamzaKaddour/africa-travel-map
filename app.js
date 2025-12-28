const map = L.map("map").setView([2, 20], 3);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

let selectedLayer = null;
let selectedCountryName = null;
let geojsonLayer = null;

// Load saved data (per user browser)
let countryData = JSON.parse(localStorage.getItem("africaMapData")) || {};

// --- IMPORTANT FIX ---
// Your GeoJSON probably doesn't have properties.ADMIN.
// This function tries common field names and falls back safely.
function getCountryName(feature) {
  const p = feature.properties || {};
  return (
    p.ADMIN ||
    p.admin ||
    p.NAME ||
    p.name ||
    p.NAME_EN ||
    p.name_en ||
    p.COUNTRY ||
    p.country ||
    p.SOVEREIGNT ||
    p.sovereignt ||
    "Unknown"
  );
}

// Colors you requested
function getColor(status) {
  if (status === "visited") return "#2ecc71";     // green
  if (status === "wishlist") return "#f5b041";    // light orange
  return "#bdc3c7";                               // default gray (not visited)
}

function styleForFeature(feature) {
  const name = getCountryName(feature);
  const entry = countryData[name] || {};
  return {
    fillColor: getColor(entry.status || "not_visited"),
    weight: 1,
    color: "#555",
    fillOpacity: 0.65
  };
}

function highlight(layer) {
  layer.setStyle({
    weight: 2,
    color: "#111",
    fillOpacity: 0.75
  });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function resetHighlight() {
  if (geojsonLayer) geojsonLayer.resetStyle();
}

// Update sidebar inputs based on selected country
function populateSidebar(name) {
  document.getElementById("country-name").innerText = name;

  const entry = countryData[name] || {};
  document.getElementById("status").value = entry.status || "not_visited";
  document.getElementById("notes").value = entry.notes || "";
}

// Country click handler
function onCountryClick(feature, layer) {
  return () => {
    resetHighlight();

    selectedLayer = layer;
    selectedCountryName = getCountryName(feature);

    highlight(layer);
    populateSidebar(selectedCountryName);
  };
}

// Load Africa geojson
fetch("africa.geojson")
  .then(res => res.json())
  .then(data => {
    geojsonLayer = L.geoJSON(data, {
      style: styleForFeature,
      onEachFeature: (feature, layer) => {
        layer.on("click", onCountryClick(feature, layer));
      }
    }).addTo(map);
  });

// Save button: updates data + re-colors selected country
document.getElementById("save").onclick = () => {
  if (!selectedCountryName || !selectedLayer) return;

  const status = document.getElementById("status").value;
  const notes = document.getElementById("notes").value;

  countryData[selectedCountryName] = { status, notes };

  localStorage.setItem("africaMapData", JSON.stringify(countryData));

  // Apply new style immediately
  selectedLayer.setStyle({
    fillColor: getColor(status)
  });
};

// Export map data as JSON
document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(countryData, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "africa-map-data.json";
  a.click();
};

// Import map data JSON (for sharing)
document.getElementById("import").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      countryData = JSON.parse(reader.result);
      localStorage.setItem("africaMapData", JSON.stringify(countryData));
      location.reload();
    } catch (err) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
};
