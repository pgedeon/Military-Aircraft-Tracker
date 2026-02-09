const MAP_START = [20, 0];
const MAP_ZOOM = 2;
const UPDATE_INTERVAL = 15000;

const statusColors = {
  active: "#41e5ff",
  idle: "#fbbc44",
  critical: "#ff4f6f",
};

const filterButtons = document.querySelectorAll(".filter");
const lastUpdateEl = document.getElementById("last-update");
const aircraftCountEl = document.getElementById("aircraft-count");
const dataStatusEl = document.getElementById("data-status");
const flightListEl = document.getElementById("flight-list");
const searchInput = document.getElementById("search-input");
const refreshButton = document.getElementById("refresh-button");

let activeFilter = "all";
let latestFlights = [];
let selectedFlightId = null;
let map;
let markers = new Map();

const initMap = () => {
  map = L.map("map", {
    zoomControl: false,
    worldCopyJump: true,
  }).setView(MAP_START, MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 8,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);
};

const createIcon = (status) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${statusColors[status]};width:12px;height:12px;border-radius:50%;box-shadow:0 0 12px ${statusColors[status]}"></div>`,
  });

const formatNumber = (value, unit) => (value == null ? "—" : `${Math.round(value).toLocaleString()} ${unit}`);
const formatHeading = (heading) => (heading == null ? "—" : `${Math.round(heading)}°`);

const inferRole = (callsign) => {
  const normalized = callsign.toLowerCase();
  if (["tanker", "rch", "qae", "blue"].some((k) => normalized.includes(k))) return "tanker";
  if (["recon", "rrr", "hawk", "sage"].some((k) => normalized.includes(k))) return "recon";
  return "strike";
};

const toFlight = (state) => {
  const [icao, callsign, country, , , lon, lat, altitude, onGround, velocity, heading] = state;
  const role = inferRole(callsign || "");

  return {
    id: icao,
    callsign: callsign?.trim() || icao,
    type: role === "tanker" ? "KC-135 Stratotanker" : role === "recon" ? "RC-135" : "F-16",
    role,
    lat,
    lon,
    altitude,
    velocity: velocity ? velocity * 1.94384 : 0,
    heading,
    country,
    status: onGround ? "idle" : role === "recon" ? "critical" : "active",
  };
};

const fetchFlights = async () => {
  const response = await fetch("https://opensky-network.org/api/states/all", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`OpenSky response ${response.status}`);

  const data = await response.json();
  const militaryStates = (data.states || []).filter((state) => {
    const callsign = (state[1] || "").toLowerCase();
    return /mil|navy|af|mc|army|rq|rh|rrr|rch|recon/.test(callsign);
  });

  return militaryStates.slice(0, 40).map(toFlight);
};

const clearMarkers = () => {
  markers.forEach((marker) => map.removeLayer(marker));
  markers.clear();
};

const updateMarkers = (flights) => {
  const activeIds = new Set(flights.map((flight) => flight.id));

  markers.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      map.removeLayer(marker);
      markers.delete(id);
    }
  });

  flights.forEach((flight) => {
    if (!flight.lat || !flight.lon) return;

    const popupContent = `
      <strong>${flight.callsign}</strong><br/>
      ${flight.type}<br/>
      ${flight.country}<br/>
      Alt: ${formatNumber(flight.altitude, "ft")}<br/>
      Speed: ${formatNumber(flight.velocity, "kts")}
    `;

    const existing = markers.get(flight.id);
    if (existing) {
      existing.setLatLng([flight.lat, flight.lon]);
      existing.setPopupContent(popupContent);
      return;
    }

    const marker = L.marker([flight.lat, flight.lon], {
      icon: createIcon(flight.status),
    }).addTo(map);

    marker.bindPopup(popupContent);
    marker.on("click", () => {
      selectedFlightId = flight.id;
      renderFlights(latestFlights);
    });
    markers.set(flight.id, marker);
  });
};

const applyFilters = (flights) => {
  const query = searchInput.value.trim().toLowerCase();
  return flights.filter((flight) => {
    const roleMatch = activeFilter === "all" || flight.role === activeFilter;
    const searchMatch = !query || flight.callsign.toLowerCase().includes(query) || flight.country.toLowerCase().includes(query);
    return roleMatch && searchMatch;
  });
};

const focusFlight = (flightId) => {
  const marker = markers.get(flightId);
  const flight = latestFlights.find((f) => f.id === flightId);
  if (!marker || !flight?.lat || !flight?.lon) return;
  map.flyTo([flight.lat, flight.lon], Math.max(map.getZoom(), 4), { duration: 0.8 });
  marker.openPopup();
};

const renderList = (flights) => {
  flightListEl.innerHTML = "";

  if (!flights.length) {
    const empty = document.createElement("article");
    empty.className = "flight-card";
    empty.innerHTML = `<div class="flight-card__title">No matching flights</div>`;
    flightListEl.appendChild(empty);
    return;
  }

  flights.forEach((flight) => {
    const card = document.createElement("article");
    card.className = "flight-card";
    if (flight.id === selectedFlightId) card.classList.add("is-selected");

    card.innerHTML = `
      <div class="flight-card__title">${flight.callsign}</div>
      <div class="flight-card__meta">
        <span>${flight.type}</span>
        <span>${flight.country}</span>
      </div>
      <div class="flight-card__meta">
        <span>Alt ${formatNumber(flight.altitude, "ft")}</span>
        <span>Speed ${formatNumber(flight.velocity, "kts")}</span>
        <span>Hdg ${formatHeading(flight.heading)}</span>
      </div>
      <span class="flight-card__status flight-card__status--${flight.status}">
        ${flight.status === "critical" ? "High priority" : flight.status}
      </span>
    `;

    card.addEventListener("click", () => {
      selectedFlightId = flight.id;
      renderFlights(latestFlights);
      focusFlight(flight.id);
    });

    flightListEl.appendChild(card);
  });
};

const renderFlights = (flights) => {
  const filtered = applyFilters(flights);
  aircraftCountEl.textContent = filtered.length.toString();
  updateMarkers(filtered);
  renderList(filtered);
};

const setActiveFilter = (value) => {
  activeFilter = value;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === value);
  });
  renderFlights(latestFlights);
};

const showError = (message) => {
  clearMarkers();
  latestFlights = [];
  selectedFlightId = null;
  aircraftCountEl.textContent = "0";
  lastUpdateEl.textContent = "—";
  dataStatusEl.textContent = "Offline";
  flightListEl.innerHTML = "";

  const errorCard = document.createElement("article");
  errorCard.className = "flight-card";
  errorCard.innerHTML = `
    <div class="flight-card__title">Live data unavailable</div>
    <div class="flight-card__meta">${message}</div>
  `;
  flightListEl.appendChild(errorCard);
};

const updateLoop = async () => {
  dataStatusEl.textContent = "Loading";
  refreshButton.disabled = true;

  try {
    latestFlights = await fetchFlights();
    dataStatusEl.textContent = "Online";
    renderFlights(latestFlights);
    lastUpdateEl.textContent = new Date().toLocaleTimeString();
  } catch (error) {
    console.error(error);
    showError("Could not fetch OpenSky live data.");
  } finally {
    refreshButton.disabled = false;
  }
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

searchInput.addEventListener("input", () => renderFlights(latestFlights));
refreshButton.addEventListener("click", updateLoop);

initMap();
setActiveFilter("all");
updateLoop();
setInterval(updateLoop, UPDATE_INTERVAL);
