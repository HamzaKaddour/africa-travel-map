const map = L.map("map").setView([2, 20], 3);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

let selectedLayer = null;
let countryData = JSON.parse(localStorage.getItem("africaMapData")) || {};

function getColor(status) {
  if (status === "visited") return "#4CAF50";
  if (status === "wishlist") return "#FFC107";
  return "#F44336";
}

fetch("africa.geojson")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: feature => {
        const name = feature.properties.ADMIN;
        const entry = countryData[name] || {};
        return {
          fillColor: getColor(entry.status),
          weight: 1,
          color: "#555",
          fillOpacity: 0.7
        };
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectCountry(feature, layer));
      }
    }).addTo(map);
  });

function selectCountry(feature, layer) {
  selectedLayer = layer;
  const name = feature.properties.ADMIN;
  document.getElementById("country-name").innerText = name;

  const entry = countryData[name] || {};
  document.getElementById("status").value = entry.status || "not_visited";
  document.getElementById("number").value = entry.number || "";
  document.getElementById("notes").value = entry.notes || "";
}

document.getElementById("save").onclick = () => {
  if (!selectedLayer) return;

  const name = document.getElementById("country-name").innerText;

  countryData[name] = {
    status: document.getElementById("status").value,
    number: document.getElementById("number").value,
    notes: document.getElementById("notes").value
  };

  selectedLayer.setStyle({
    fillColor: getColor(countryData[name].status)
  });

  localStorage.setItem("africaMapData", JSON.stringify(countryData));
};

document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(countryData, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "africa-map-data.json";
  a.click();
};

document.getElementById("import").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    countryData = JSON.parse(reader.result);
    localStorage.setItem("africaMapData", JSON.stringify(countryData));
    location.reload();
  };
  reader.readAsText(file);
};
