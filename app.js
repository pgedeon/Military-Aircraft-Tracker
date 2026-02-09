const MAP_START = [20, 0];
const MAP_ZOOM = 2;
const UPDATE_INTERVAL = 15000;

const mockFlights = [
  {
    id: "RCH4102",
    callsign: "RCH4102",
    type: "C-17 Globemaster III",
    role: "tanker",
    lat: 36.2,
    lon: -115.1,
    altitude: 31000,
    velocity: 460,
    heading: 280,
    country: "United States",
    status: "active",
  },
  {
    id: "RRR667",
    callsign: "RRR667",
    type: "RC-135 Rivet Joint",
    role: "recon",
    lat: 51.1,
    lon: -1.8,
    altitude: 34000,
    velocity: 470,
    heading: 90,
    country: "United Kingdom",
    status: "critical",
  },
  {
    id: "DEMON21",
    callsign: "DEMON21",
    type: "F/A-18 Super Hornet",
    role: "strike",
    lat: 15.8,
    lon: 72.2,
    altitude: 0,
    velocity: 0,
    heading: 0,
    country: "India",
    status: "idle",
  },
  {
    id: "OEI339",
    callsign: "OEI339",
    type: "P-8 Poseidon",
    role: "recon",
    lat: -33.9,
    lon: 151.2,
    altitude: 22000,
    velocity: 410,
    heading: 135,
    country: "Australia",
    status: "active",
  },
  {
    id: "SWORD14",
    callsign: "SWORD14",
    type: "F-35 Lightning II",
    role: "strike",
    lat: 24.6,
    lon: 54.7,
    altitude: 28000,
    velocity: 520,
    heading: 45,
    country: "United Arab Emirates",
    status: "active",
  },
];

const statusColors = {
  active: "#41e5ff",
  idle: "#fbbc44",
  critical: "#ff4f6f",
};

const filterButtons = document.querySelectorAll(".filter");
const lastUpdateEl = document.getElementById("last-update");
const aircraftCountEl = document.getElementById("aircraft-count");
const flightListEl = document.getElementById("flight-list");

let activeFilter = "all";
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

const formatNumber = (value, unit) =>
  value === null || value === undefined
    ? "—"
    : `${Math.round(value).toLocaleString()} ${unit}`;

const formatHeading = (heading) =>
  heading === null || heading === undefined
    ? "—"
    : `${Math.round(heading)}°`;

const toFlight = (state) => {
  const [
    icao,
    callsign,
    country,
    ,
    ,
    lon,
    lat,
    altitude,
    onGround,
    velocity,
    heading,
  ] = state;

  const role = inferRole(callsign || "");
  const status = onGround ? "idle" : role === "recon" ? "critical" : "active";

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
    status,
  };
};

const inferRole = (callsign) => {
  const normalized = callsign.toLowerCase();
  if (["tanker", "rch", "qae", "blue"].some((k) => normalized.includes(k))) {
    return "tanker";
  }
  if (["recon", "rrr", "hawk", "sage"].some((k) => normalized.includes(k))) {
    return "recon";
  }
  return "strike";
};

const fetchFlights = async () => {
  try {
    const response = await fetch("https://opensky-network.org/api/states/all", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`OpenSky response ${response.status}`);
    }
    const data = await response.json();
    const states = data.states || [];
    const militaryStates = states.filter((state) => {
      const callsign = (state[1] || "").toLowerCase();
      return /mil|navy|af|mc|army|rq|rh|rrr|rch|recon/.test(callsign);
    });
    const flights = militaryStates.slice(0, 24).map(toFlight);
    if (flights.length) {
      return flights;
    }
  } catch (error) {
    console.warn("Falling back to mock feed", error);
  }
  return mockFlights;
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
    if (!flight.lat || !flight.lon) {
      return;
    }

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
    } else {
      const marker = L.marker([flight.lat, flight.lon], {
        icon: createIcon(flight.status),
      }).addTo(map);
      marker.bindPopup(popupContent);
      markers.set(flight.id, marker);
    }
  });
};

const renderList = (flights) => {
  flightListEl.innerHTML = "";
  flights.forEach((flight) => {
    const card = document.createElement("article");
    card.className = "flight-card";

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

    flightListEl.appendChild(card);
  });
};

const renderFlights = (flights) => {
  const filtered =
    activeFilter === "all"
      ? flights
      : flights.filter((flight) => flight.role === activeFilter);

  aircraftCountEl.textContent = filtered.length.toString();
  updateMarkers(filtered);
  renderList(filtered);
};

const setActiveFilter = (value) => {
  activeFilter = value;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === value);
  });
};

const updateLoop = async () => {
  const flights = await fetchFlights();
  renderFlights(flights);
  lastUpdateEl.textContent = new Date().toLocaleTimeString();
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFilter(button.dataset.filter);
    updateLoop();
  });
});

initMap();
setActiveFilter("all");
updateLoop();
setInterval(updateLoop, UPDATE_INTERVAL);
