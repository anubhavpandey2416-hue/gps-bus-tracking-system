const state = {
  user: null,
  routes: [],
  buses: [],
  selectedRouteId: null,
  map: null,
  routeLayers: [],
  busMarkers: []
};

const ui = {
  loginModal: document.getElementById('loginModal'),
  loginForm: document.getElementById('loginForm'),
  loginMessage: document.getElementById('loginMessage'),
  refreshBtn: document.getElementById('refreshBtn'),
  tableRefreshBtn: document.getElementById('tableRefreshBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminPanel: document.getElementById('adminPanel'),
  routeForm: document.getElementById('routeForm'),
  busForm: document.getElementById('busForm'),
  routeSelect: document.getElementById('routeSelect'),
  fleetTableBody: document.getElementById('fleetTableBody'),
  routeSummary: document.getElementById('routeSummary'),
  routeStopsList: document.getElementById('routeStopsList'),
  selectedRouteBadge: document.getElementById('selectedRouteBadge'),
  activeBuses: document.getElementById('activeBuses'),
  onTimeRate: document.getElementById('onTimeRate'),
  avgSpeed: document.getElementById('avgSpeed'),
  alertCount: document.getElementById('alertCount')
};

function initializeMap() {
  state.map = L.map('map').setView([40.7505, -73.9857], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
}

function setAuthState(user) {
  state.user = user;
  ui.adminPanel.classList.toggle('hidden', !user);
  ui.loginModal.classList.toggle('visible', !user);
  ui.logoutBtn.textContent = user ? 'Admin logout' : 'Admin login';
  ui.logoutBtn.style.display = user ? 'inline-flex' : 'none';
}

function parseRouteCoordinates(rawValue) {
  const lines = String(rawValue || '').split(/\n|;/).filter(Boolean);
  const coordinates = [];

  for (const line of lines) {
    const parts = line
      .replace(/[()]/g, '')
      .split(',')
      .flatMap((part) => part.trim().split(/\s+/))
      .filter(Boolean);

    if (parts.length < 2) continue;

    const lat = Number(parts[0]);
    const lng = Number(parts[1]);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      coordinates.push([lat, lng]);
    }
  }

  return coordinates;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('delay')) return 'delayed';
  if (value.includes('scheduled')) return 'scheduled';
  return 'on-time';
}

function formatDate(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function updateSummary(stats) {
  const active = stats?.activeBuses ?? 0;
  const onTimeRate = stats?.onTimeRate ?? 0;
  const avgSpeed = stats?.avgSpeed ?? 0;
  const alerts = stats?.alertCount ?? 0;

  ui.activeBuses.textContent = String(active);
  ui.onTimeRate.textContent = `${onTimeRate}%`;
  ui.avgSpeed.textContent = `${avgSpeed} km/h`;
  ui.alertCount.textContent = String(alerts).padStart(2, '0');
}

function renderRouteOptions(routes) {
  ui.routeSelect.innerHTML = routes
    .map((route) => `<option value="${route.id}">${route.name}</option>`)
    .join('');

  if (state.selectedRouteId) {
    ui.routeSelect.value = String(state.selectedRouteId);
  } else if (routes[0]) {
    state.selectedRouteId = routes[0].id;
    ui.routeSelect.value = String(routes[0].id);
  }
}

function renderRouteDetail() {
  const route = state.routes.find((item) => item.id === Number(state.selectedRouteId)) || state.routes[0];

  if (!route) {
    ui.routeSummary.innerHTML = '<p>No routes available.</p>';
    ui.routeStopsList.innerHTML = '';
    ui.selectedRouteBadge.textContent = 'Live';
    return;
  }

  const routeStops = [
    { label: route.start_stop || 'Start', value: 'Departure' },
    ...((route.coordinates || []).slice(1, 4).map((_, index) => ({
      label: `Checkpoint ${index + 1}`,
      value: `${Math.max(3, 8 + index * 4)} min`
    }))),
    { label: route.end_stop || 'End', value: 'Arrival' }
  ];

  ui.routeSummary.innerHTML = `
    <div>
      <p>Current trip</p>
      <h4>${route.name}</h4>
    </div>
    <div class="eta-box">
      <span>ETA</span>
      <strong>${Math.max(4, 9 + (route.id % 6))} min</strong>
    </div>
  `;

  ui.routeStopsList.innerHTML = routeStops
    .map((stop) => `<li><span>${stop.label}</span><strong>${stop.value}</strong></li>`)
    .join('');

  ui.selectedRouteBadge.textContent = route.name.toUpperCase();
}

function renderFleetTable() {
  if (!state.buses.length) {
    ui.fleetTableBody.innerHTML = '<tr><td colspan="6">No buses available.</td></tr>';
    return;
  }

  ui.fleetTableBody.innerHTML = state.buses
    .map((bus) => {
      const status = bus.status || 'On time';
      return `
        <tr>
          <td>#${bus.plate.replace('BUS-', '')}</td>
          <td>${bus.route_name || 'Unassigned'}</td>
          <td>${bus.driver}</td>
          <td>${Number(bus.speed || 0).toFixed(1)} km/h</td>
          <td><span class="status-badge ${statusClass(status)}">${status}</span></td>
          <td>${formatDate(bus.last_update)}</td>
        </tr>
      `;
    })
    .join('');
}

function clearMarkers() {
  if (!state.map) return;

  state.routeLayers.forEach((layer) => state.map.removeLayer(layer));
  state.busMarkers.forEach((marker) => state.map.removeLayer(marker));
  state.routeLayers = [];
  state.busMarkers = [];
}

function renderMap() {
  if (!state.map) return;

  clearMarkers();

  state.routes.forEach((route) => {
    const points = (route.coordinates || []).map(([lat, lng]) => [lat, lng]);
    if (points.length > 1) {
      const polyline = L.polyline(points, {
        color: route.color || '#5aa8ff',
        weight: 4,
        opacity: 0.9
      }).addTo(state.map);
      state.routeLayers.push(polyline);
    }
  });

  const activeBuses = state.buses.filter((bus) => bus.is_active);
  activeBuses.forEach((bus) => {
    const marker = L.marker([Number(bus.latitude), Number(bus.longitude)])
      .addTo(state.map)
      .bindPopup(`<div><strong>Bus ${bus.plate}</strong></div><div>${bus.driver}</div><div>${bus.route_name || 'No route'}</div><div>${bus.status}</div>`);
    state.busMarkers.push(marker);
  });

  if (activeBuses.length) {
    const bounds = L.latLngBounds(activeBuses.map((bus) => [Number(bus.latitude), Number(bus.longitude)]));
    state.map.fitBounds(bounds.pad(0.35));
  }
}

function renderDashboard(data) {
  state.routes = data.routes || [];
  state.buses = data.buses || [];
  updateSummary(data.stats || {});
  renderRouteOptions(state.routes);
  renderRouteDetail();
  renderFleetTable();
  renderMap();
}

async function fetchDashboard() {
  try {
    const response = await fetch('/api/dashboard');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not load dashboard.');
    }

    setAuthState(data.user || null);
    renderDashboard(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function login(event) {
  event.preventDefault();
  const formData = new FormData(ui.loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      ui.loginMessage.textContent = data.message || 'Sign in failed.';
      return;
    }

    ui.loginMessage.textContent = 'Welcome back, admin.';
    setAuthState(data.user);
    await fetchDashboard();
  } catch (error) {
    ui.loginMessage.textContent = 'Unable to sign in at the moment.';
  }
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout request failed:', error);
  }

  setAuthState(null);
  ui.loginMessage.textContent = '';
  ui.loginModal.classList.add('visible');
}

async function createRoute(event) {
  event.preventDefault();
  if (!state.user) return;

  const formData = new FormData(ui.routeForm);
  const coordinates = parseRouteCoordinates(formData.get('coordinates'));

  if (coordinates.length < 2) {
    alert('Enter at least two coordinate pairs in lat, lng format.');
    return;
  }

  const payload = {
    name: formData.get('name'),
    startStop: formData.get('startStop'),
    endStop: formData.get('endStop'),
    color: formData.get('color'),
    coordinates
  };

  try {
    const response = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create route');
    }

    ui.routeForm.reset();
    await fetchDashboard();
    alert(data.message || 'Route created.');
  } catch (error) {
    alert(error.message);
  }
}

async function createBus(event) {
  event.preventDefault();
  if (!state.user) return;

  const formData = new FormData(ui.busForm);
  const payload = {
    plate: formData.get('plate'),
    driver: formData.get('driver'),
    routeId: formData.get('routeId'),
    latitude: Number(formData.get('latitude')),
    longitude: Number(formData.get('longitude')),
    speed: Number(formData.get('speed')),
    status: formData.get('status')
  };

  try {
    const response = await fetch('/api/buses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to add bus');
    }

    ui.busForm.reset();
    await fetchDashboard();
    alert(data.message || 'Bus added successfully.');
  } catch (error) {
    alert(error.message);
  }
}

ui.loginForm.addEventListener('submit', login);
ui.logoutBtn.addEventListener('click', () => {
  if (state.user) {
    logout();
  }
});
ui.routeForm.addEventListener('submit', createRoute);
ui.busForm.addEventListener('submit', createBus);
ui.refreshBtn.addEventListener('click', fetchDashboard);
ui.tableRefreshBtn.addEventListener('click', fetchDashboard);
ui.routeSelect.addEventListener('change', (event) => {
  state.selectedRouteId = Number(event.target.value);
  renderRouteDetail();
});

initializeMap();
fetchDashboard();
