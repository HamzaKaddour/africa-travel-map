// ============================================================
// Africa Travel Map - app.js (Firebase-ready, no localStorage)
// - Clickable countries
// - Status + notes saved per country (Cloud Firestore per user)
// - Tooltip on hover (desktop) + tap-friendly behavior (mobile)
// - Mobile bottom-sheet panel toggle
// - Shows names in Arabic + English + French (if available in GeoJSON)
// ============================================================

// -------------------- MOBILE PANEL TOGGLE --------------------
const sidebarEl = document.getElementById("sidebar");
const panelToggleBtn = document.getElementById("panelToggle");

function setPanelOpen(isOpen) {
  if (!sidebarEl || !panelToggleBtn) return;
  sidebarEl.classList.toggle("open", isOpen);
  panelToggleBtn.classList.toggle("closed", !isOpen);
  panelToggleBtn.textContent = isOpen ? "✕ Close" : "☰ Panel";
}

// Default: closed on mobile, ignored on desktop layout
setPanelOpen(false);

if (panelToggleBtn) {
  panelToggleBtn.addEventListener("click", () => {
    const isOpen = sidebarEl.classList.contains("open");
    setPanelOpen(!isOpen);
  });
}

// Helper: true on small screens
function isMobile() {
  return window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
}

// -------------------- MAP SETUP --------------------
const map = L.map("map", { preferCanvas: true }).setView([2, 20], 3);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// -------------------- STATE --------------------
let geojsonLayer = null;
let selectedLayer = null;
let selectedCountryId = null;
let selectedCountryNames = null;

// Cloud-backed state (loaded after login)
let countryData = {}; // countryData[id] = { status: "...", notes: "..." }

let isLoggedIn = false;

// Called by firebase_client.js
window.__setAppLoggedIn = function (v) {
  isLoggedIn = !!v;
};

// -------------------- HELPERS --------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

function statusLabel(status) {
  if (status === "visited") return "Visited";
  if (status === "wishlist") return "To be visited";
  return "Not visited";
}

function getColor(status) {
  if (status === "visited") return "#2ecc71";    // green
  if (status === "wishlist") return "#f39c12";   // orange
  return "#bdc3c7";                               // gray
}

function pickFirstString(obj, keys) {
  for (const k of keys) {
    if (typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
  }
  return "";
}

function getCountryId(feature) {
  const p = feature.properties || {};
  return (
    p.ISO_A3 ||
    p.iso_a3 ||
    p.ADM0_A3 ||
    p.adm0_a3 ||
    p.ISO3 ||
    p.iso3 ||
    p.NAME ||
    p.name ||
    JSON.stringify(p).slice(0, 40)
  );
}

function detectFallbackName(p) {
  const preferred = [
    "NAME", "name",
    "ADMIN", "admin",
    "NAME_LONG", "name_long",
    "SOVEREIGNT", "sovereignt",
    "FORMAL_EN", "formal_en"
  ];
  const v = pickFirstString(p, preferred);
  if (v) return v;

  const keys = Object.keys(p);
  const nameLike = keys.find(k => k.toLowerCase().includes("name") && typeof p[k] === "string" && p[k].trim());
  if (nameLike) return p[nameLike].trim();

  for (const k of keys) {
    if (typeof p[k] === "string" && p[k].trim().length > 0) return p[k].trim();
  }
  return "Unknown";
}

function getCountryNames(feature) {
  const p = feature.properties || {};

  const en = pickFirstString(p, [
    "NAME_EN", "name_en",
    "EN_NAME", "en_name",
    "NAMEENG", "nameeng",
    "NAME", "name",
    "ADMIN", "admin"
  ]);

  const fr = pickFirstString(p, [
    "NAME_FR", "name_fr",
    "FR_NAME", "fr_name",
    "NAMEFRE", "namefre",
    "NAME_FRN", "name_frn",
  ]);

  const ar = pickFirstString(p, [
    "NAME_AR", "name_ar",
    "AR_NAME", "ar_name",
    "NAME_ARABIC", "name_arabic",
    "ARABIC", "arabic",
    "NAME_ARAB", "name_arab",
    "NAMEAR", "namear"
  ]);

  const fallback = detectFallbackName(p);

  return { en: en || "", fr: fr || "", ar: ar || "", fallback };
}

function formatDisplayName(names) {
  const parts = [];
  if (names.en) parts.push(names.en);
  if (names.fr) parts.push(names.fr);
  if (names.ar) parts.push(`<span dir="rtl" lang="ar">${escapeHtml(names.ar)}</span>`);

  if (parts.length === 0) return escapeHtml(names.fallback || "Unknown");

  const safeParts = parts.map((x) => {
    if (x.startsWith("<span")) return x;
    return escapeHtml(x);
  });

  return safeParts.join(" • ");
}

// -------------------- STYLE --------------------
function styleForFeature(feature) {
  const id = getCountryId(feature);
  const entry = countryData[id] || {};
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

function refreshSelectedSidebarIfNeeded() {
  if (!selectedCountryId || !selectedCountryNames) return;
  const entry = countryData[selectedCountryId] || { status: "not_visited", notes: "" };
  populateSidebar(selectedCountryNames, entry);
}

// -------------------- SIDEBAR --------------------
function populateSidebar(names, entry) {
  const title = document.getElementById("country-name");
  title.innerHTML = formatDisplayName(names);

  document.getElementById("status").value = entry.status || "not_visited";
  document.getElementById("notes").value = entry.notes || "";
}

// -------------------- TOOLTIP (HOVER / TAP) --------------------
function tooltipContent(names, entry) {
  const notes = (entry.notes || "").trim();
  const notesShort = notes.length > 140 ? notes.slice(0, 140) + "…" : notes;

  return `
    <div style="min-width:200px">
      <div style="font-weight:700; margin-bottom:4px">${formatDisplayName(names)}</div>
      <div><b>Status:</b> ${escapeHtml(statusLabel(entry.status))}</div>
      ${
        notes
          ? `<div style="margin-top:6px"><b>Notes:</b> ${escapeHtml(notesShort)}</div>`
          : `<div style="margin-top:6px; opacity:.75"><i>No notes</i></div>`
      }
    </div>
  `;
}

// -------------------- FEATURE EVENTS --------------------
function onEachFeature(feature, layer) {
  layer.options.interactive = true;

  layer.bindTooltip("", {
    sticky: true,
    direction: "auto",
    opacity: 0.95,
  });

  layer.on("mouseover", () => {
    if (isMobile()) return;
    const id = getCountryId(feature);
    const names = getCountryNames(feature);
    const entry = countryData[id] || { status: "not_visited", notes: "" };

    layer.setTooltipContent(tooltipContent(names, entry));
    layer.openTooltip();
    layer.setStyle({ weight: 2 });
  });

  layer.on("mouseout", () => {
    if (isMobile()) return;
    layer.closeTooltip();
    if (geojsonLayer) geojsonLayer.resetStyle(layer);
  });

  layer.on("click", () => {
    resetHighlight();

    selectedLayer = layer;
    selectedCountryId = getCountryId(feature);
    selectedCountryNames = getCountryNames(feature);

    const entry = countryData[selectedCountryId] || { status: "not_visited", notes: "" };

    highlight(layer);
    populateSidebar(selectedCountryNames, entry);

    if (isMobile()) setPanelOpen(true);

    layer.setTooltipContent(tooltipContent(selectedCountryNames, entry));
    layer.openTooltip();
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

    map.fitBounds(geojsonLayer.getBounds(), { padding: [10, 10] });
  })
  .catch((err) => {
    console.error(err);
    alert("Could not load africa.geojson. Make sure it is in the repo root and named exactly africa.geojson.");
  });

// -------------------- SAVE BUTTON --------------------
document.getElementById("save").onclick = () => {
  if (!isLoggedIn) {
    alert("Please sign in first (top-right) to save your data.");
    return;
  }

  if (!selectedCountryId || !selectedLayer) {
    alert("Click a country first.");
    return;
  }

  const status = document.getElementById("status").value;
  const notes = document.getElementById("notes").value;

  countryData[selectedCountryId] = { status, notes };

  // Update color immediately
  selectedLayer.setStyle({ fillColor: getColor(status) });

  // Update tooltip
  const entry = countryData[selectedCountryId] || { status: "not_visited", notes: "" };
  selectedLayer.setTooltipContent(tooltipContent(selectedCountryNames, entry));

  // Notify Firebase to persist
  if (window.__onCountryDataChanged) window.__onCountryDataChanged(countryData);
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
  if (!isLoggedIn) {
    alert("Please sign in first (top-right) to import and save to your account.");
    e.target.value = "";
    return;
  }

  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);

      // Replace current state
      countryData = parsed || {};

      // Repaint everything
      if (geojsonLayer) geojsonLayer.resetStyle();
      refreshSelectedSidebarIfNeeded();

      // Persist to cloud
      if (window.__onCountryDataChanged) window.__onCountryDataChanged(countryData);

      alert("Imported successfully.");
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
};

// -------------------- FIREBASE BRIDGE HOOKS --------------------
// Called by firebase_client.js when it loads data from Firestore
window.__applyCountryDataFromCloud = function (newData) {
  countryData = newData || {};

  if (geojsonLayer) geojsonLayer.resetStyle();
  refreshSelectedSidebarIfNeeded();
};
