// -------------------- MAP SETUP --------------------
const map = L.map("map", { preferCanvas: true }).setView([2, 20], 3);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// -------------------- STATE --------------------
let selectedLayer = null;
let selectedCountryName = null;
let geojsonLayer = null;

// user-specific saved data (in their browser)
let countryData = JSON.parse(localStorage.getItem("africaMapData")) || {};

// -------------------- COLORS --------------------
function getColor(status) {
  if (status === "visited") return "#2ecc71";   // green
  if (status === "wishlist") return "#f5b041";  // light orange
  return "#bdc3c7";                             // gray (not visited default)
}

// -------------------- NAME FIELD DETECTION --------------------
// Fixes the "undefined" problem by discovering the correct property key once.
let NAME_FIELD = null;

function detectNameField(feature) {
  const p = feature.properties || {};
  const keys = Object.keys(p);

  // common candidates first
  const preferred = [
    "ADMIN", "admin",
    "NAME", "name",
    "NAME_EN", "name_en",
    "COUNTRY", "country",
    "SOVEREIGNT", "sovereignt",
    "NAME_LONG", "name_long",
    "FORMAL_EN", "formal_en",
  ];

  for (const k of preferred) {
    if (typeof p[k] === "string" && p[k].trim().length > 0) return k;
  }

  // anything containing "name"
  const nameLike = keys.find(
    (k) => k.toLowerCase().includes("name") && typeof p[k] === "string"
  );
  if (nameLike) return nameLike;

  // fallback: first non-empty string property
  for (const k of keys) {
    if (typeof p[k] === "string" && p[k].trim().length > 0) return k;
  }

  return null;
}

function getCountryName(feature) {
  const p = feature.properties || {};
  if (!NAME_FIELD) {
    NAME_FIELD = detectNameField(feature);
    console.log("Detected country name field:", NAME_FIELD);
    console.log("Example properties:", p);
  }
  const name = NAME_FIELD ? p[NAME_FIELD] : null;
  return (typeof name === "string" && name.trim().length > 0) ? name : "Unknown";
}

// -------------------- STYLE --------------------
function styleForFeature(feature) {
  const name = getCountryName(feature);
  const entry = countryData[name] || {};
  return {
    fillColor: getColor(entry.status || "not_visited"),
    fillOpacity: 0.65,
    weight: 1,
    color: "#555",
  };
}

function highlight(layer) {
  layer.setStyle({ weight: 2, color: "#111", fillOpacity: 0.75 });
  if (layer.bringToFront) layer.bringToFront();
}

function resetHighlight() {
  if (geojsonLayer) geojsonLayer.resetStyle();
}

// -------------------- SIDEBAR --------------------
function populateSidebar(name) {
  document.getElementById("country-name").innerText = name;

  const entry = countryData[name] || {};
  document.getElementById("status").value = entry.status || "not_visited";
  document.getElementById("notes").value = entry.notes || "";
}

// -------------------- TOOLTIP (HOVER) --------------------
function statusLabel(status) {
  if (status === "visited") return "Visited";
  if (status === "wishlist") return "To be visited";
  return "Not visited";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function tooltipContent(countryName) {
  const entry = countryData[countryName] || {};
  const st = statusLabel(entry.status);

  const notes = (entry.notes || "").trim();
  const notesShort = notes.length > 120 ? notes.slice(0, 120) + "…" : notes;

  return `
    <div style="min-width:180px">
      <div style="font-weight:700; margin-bottom:4px">${escapeHtml(countryName)}</div>
      <div><b>Status:</b> ${escapeHtml(st)}</div>
      ${
        notes
          ? `<div style="margin-top:4px"><b>Notes:</b> ${escapeHtml(notesShort)}</div>`
          : `<div style="margin-top:4px; opacity:.75"><i>No notes</i></div>`
      }
    </div>
  `;
}

// -------------------- FEATURE EVENTS --------------------
function onEachFeature(feature, layer) {
  layer.options.interactive = true;

  // Bind tooltip once; update content on hover
  layer.bindTooltip("", {
    sticky: true,
    direction: "auto",
    opacity: 0.95,
  });

  layer.on("mouseover", () => {
    const name = getCountryName(feature);
    layer.setTooltipContent(tooltipContent(name));
    layer.openTooltip();
    layer.setStyle({ weight: 2 });
  });

  layer.on("mouseout", () => {
    layer.closeTooltip();
    if (geojsonLayer) geojsonLayer.resetStyle(layer);
  });

  layer.on("click", () => {
    resetHighlight();

    selectedLayer = layer;
    selectedCountryName = getCountryName(feature);

    highlight(layer);
    populateSidebar(selectedCountryName);
  });
}

// -------------------- LOAD GEOJSON --------------------
fetch("africa.geojson")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} loading africa.geojson`);
    return res.json();
  })
  .then((data) => {
    geojsonLayer = L.geoJSON(data, {
      style: styleForFeature,
      onEachFeature,
    }).addTo(map);

    // Fit view to Africa layer
    map.fitBounds(geojsonLayer.getBounds());
  })
  .catch((err) => {
    console.error(err);
    alert("Could not load africa.geojson. Check file name/path in the repo root.");
  });

// -------------------- SAVE BUTTON --------------------
document.getElementById("save").onclick = () => {
  if (!selectedCountryName || !selectedLayer) {
    alert("Click a country first.");
    return;
  }

  const status = document.getElementById("status").value; // not_visited / visited / wishlist
  const notes = document.getElementById("notes").value;

  countryData[selectedCountryName] = { status, notes };
  localStorage.setItem("africaMapData", JSON.stringify(countryData));

  // Update color immediately
  selectedLayer.setStyle({ fillColor: getColor(status) });

  // Ensure hover tooltip reflects latest data immediately
  selectedLayer.setTooltipContent(tooltipContent(selectedCountryName));
};

// -------------------- EXPORT / IMPORT --------------------
document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(countryData, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "africa-map-data.json";
  a.click();
};

document.getElementById("import").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      countryData = JSON.parse(reader.result);
      localStorage.setItem("africaMapData", JSON.stringify(countryData));
      location.reload();
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
};
