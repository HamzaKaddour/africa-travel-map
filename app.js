// ============================================================
// Africa Travel Map - Full app.js
// - Clickable countries
// - Status (gray/green/orange) + notes saved per country
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
let selectedLayer = null;
let selectedCountryId = null;
let selectedCountryNames = null; // {en, fr, ar, fallback}
let geojsonLayer = null;

// Saved per-user in browser
// Structure:
// countryData[id] = { status: "visited|wishlist|not_visited", notes: "..." }
let countryData = JSON.parse(localStorage.getItem("africaMapData")) || {};

// -------------------- COLORS --------------------
function getColor(status) {
  if (status === "visited") return "#2ecc71";   // green
  if (status === "wishlist") return "#f5b041";  // light orange
  return "#bdc3c7";                             // gray (default)
}

// -------------------- UTIL: HTML escape --------------------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -------------------- STATUS LABEL --------------------
function statusLabel(status) {
  if (status === "visited") return "Visited";
  if (status === "wishlist") return "To be visited";
  return "Not visited";
}

// -------------------- COUNTRY ID DETECTION --------------------
// We store by ID (ISO code if present) to keep data stable.
function getCountryId(feature) {
  const p = feature.properties || {};

  // Common ISO fields in many country GeoJSON sources
  const candidates = [
    "ISO_A3", "iso_a3",
    "ADM0_A3", "adm0_a3",
    "ISO3", "iso3",
    "ISO", "iso",
    "WB_A3", "wb_a3",
    "id", "ID"
  ];

  for (const k of candidates) {
    const v = p[k];
    if (typeof v === "string" && v.trim().length >= 2) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }

  // Fallback: use a detected name (still works, but less stable)
  const names = getCountryNames(feature);
  return names.en || names.fr || names.ar || names.fallback || "Unknown";
}

// -------------------- NAME FIELDS DETECTION (AR/EN/FR) --------------------
// This tries to find name in multiple languages based on common keys.
// If your GeoJSON uses different keys, it will still fallback to something sensible.
function pickFirstString(p, keys) {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

function detectFallbackName(p) {
  // Generic fallbacks if no language-specific match
  const preferred = [
    "ADMIN", "admin",
    "NAME", "name",
    "NAME_EN", "name_en",
    "NAME_LONG", "name_long",
    "SOVEREIGNT", "sovereignt",
    "FORMAL_EN", "formal_en"
  ];
  const v = pickFirstString(p, preferred);
  if (v) return v;

  // any key containing "name"
  const keys = Object.keys(p);
  const nameLike = keys.find(k => k.toLowerCase().includes("name") && typeof p[k] === "string" && p[k].trim());
  if (nameLike) return p[nameLike].trim();

  // fallback: first non-empty string property
  for (const k of keys) {
    if (typeof p[k] === "string" && p[k].trim().length > 0) return p[k].trim();
  }
  return "Unknown";
}

function getCountryNames(feature) {
  const p = feature.properties || {};

  // These are common naming conventions across datasets.
  // Arabic can appear as NAME_AR / name_ar / AR / ArabicName etc.
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

  return {
    en: en || "",
    fr: fr || "",
    ar: ar || "",
    fallback
  };
}

// Format display name in sidebar + tooltip
function formatDisplayName(names) {
  // Show all available: English • Français • العربية
  // (If one is missing, skip it.)
  const parts = [];
  if (names.en) parts.push(names.en);
  if (names.fr) parts.push(names.fr);

  // Arabic: render with RTL direction for correctness
  if (names.ar) parts.push(`<span dir="rtl" lang="ar">${escapeHtml(names.ar)}</span>`);

  if (parts.length === 0) return escapeHtml(names.fallback || "Unknown");

  // English/French are plain text; Arabic already escaped above
  // Escape EN/FR too:
  const safeParts = parts.map((x) => {
    // If it's the Arabic span already, keep it; else escape.
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

// -------------------- SIDEBAR --------------------
function populateSidebar(names, entry) {
  const title = document.getElementById("country-name");
  // Sidebar title supports HTML (for Arabic span)
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

  // Bind tooltip once; update on hover/tap
  layer.bindTooltip("", {
    sticky: true,
    direction: "auto",
    opacity: 0.95,
  });

  layer.on("mouseover", () => {
    // Hover works on desktop
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

    // On mobile: open the panel automatically
    if (isMobile()) setPanelOpen(true);

    // Also show tooltip on tap (mobile friendly)
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
  if (!selectedCountryId || !selectedLayer) {
    alert("Click a country first.");
    return;
  }

  const status = document.getElementById("status").value; // not_visited / visited / wishlist
  const notes = document.getElementById("notes").value;

  countryData[selectedCountryId] = { status, notes };
  localStorage.setItem("africaMapData", JSON.stringify(countryData));

  // Update color immediately
  selectedLayer.setStyle({ fillColor: getColor(status) });

  // Update tooltip to reflect latest info
  const entry = countryData[selectedCountryId] || { status: "not_visited", notes: "" };
  selectedLayer.setTooltipContent(tooltipContent(selectedCountryNames, entry));
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
