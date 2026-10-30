const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'bus_tracker.db');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'gps-bus-tracker-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    )
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_stop TEXT NOT NULL,
      end_stop TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#5aa8ff',
      coordinates TEXT NOT NULL
    )
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS buses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT UNIQUE NOT NULL,
      driver TEXT NOT NULL,
      route_id INTEGER,
      status TEXT NOT NULL DEFAULT 'On time',
      speed REAL NOT NULL DEFAULT 0,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_update TEXT NOT NULL,
      FOREIGN KEY(route_id) REFERENCES routes(id)
    )
  `);

  const userCount = await query('SELECT COUNT(*) AS count FROM users');
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    await runSql(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, ['admin', passwordHash, 'admin']);
  }

  const routeCount = await query('SELECT COUNT(*) AS count FROM routes');
  if (routeCount.count === 0) {
    const seedRoutes = [
      {
        name: 'Central Loop',
        start_stop: 'Union Station',
        end_stop: 'Civic Center',
        color: '#5aa8ff',
        coordinates: JSON.stringify([
          [40.7128, -74.0060],
          [40.7200, -73.9970],
          [40.7290, -73.9890],
          [40.7410, -73.9790],
          [40.7505, -73.9857]
        ])
      },
      {
        name: 'Harbor Express',
        start_stop: 'Pier 7',
        end_stop: 'Old Town',
        color: '#3ad29f',
        coordinates: JSON.stringify([
          [40.7050, -74.0130],
          [40.7120, -74.0020],
          [40.7205, -73.9950],
          [40.7310, -73.9860],
          [40.7390, -73.9780]
        ])
      },
      {
        name: 'North Ridge',
        start_stop: 'Riverside',
        end_stop: 'Elm Park',
        color: '#f5c96b',
        coordinates: JSON.stringify([
          [40.7580, -73.9850],
          [40.7660, -73.9810],
          [40.7730, -73.9750],
          [40.7850, -73.9720],
          [40.7950, -73.9680]
        ])
      }
    ];

    for (const route of seedRoutes) {
      await runSql(
        `INSERT INTO routes (name, start_stop, end_stop, color, coordinates) VALUES (?, ?, ?, ?, ?)`,
        [route.name, route.start_stop, route.end_stop, route.color, route.coordinates]
      );
    }
  }

  const busCount = await query('SELECT COUNT(*) AS count FROM buses');
  if (busCount.count === 0) {
    const routeRows = await queryAll('SELECT * FROM routes ORDER BY id');
    const seedBuses = [
      { plate: 'BUS-101', driver: 'Alicia Harris', route_id: routeRows[0]?.id || 1, status: 'On time', speed: 32.5, latitude: 40.7200, longitude: -73.9970, is_active: 1 },
      { plate: 'BUS-202', driver: 'Marcus Lee', route_id: routeRows[1]?.id || 2, status: 'Delayed', speed: 18.4, latitude: 40.7120, longitude: -74.0020, is_active: 1 },
      { plate: 'BUS-305', driver: 'Priya Nair', route_id: routeRows[2]?.id || 3, status: 'On time', speed: 41.1, latitude: 40.7660, longitude: -73.9810, is_active: 1 },
      { plate: 'BUS-417', driver: 'Daniel Brooks', route_id: routeRows[0]?.id || 1, status: 'Scheduled', speed: 24.8, latitude: 40.7290, longitude: -73.9890, is_active: 1 }
    ];

    for (const bus of seedBuses) {
      await runSql(
        `INSERT INTO buses (plate, driver, route_id, status, speed, latitude, longitude, is_active, last_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bus.plate, bus.driver, bus.route_id, bus.status, bus.speed, bus.latitude, bus.longitude, bus.is_active, new Date().toISOString()]
      );
    }
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'gps-bus-tracking-system' });
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  const user = await query('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  return res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

async function getRoutes() {
  const rows = await queryAll('SELECT * FROM routes ORDER BY id');
  return rows.map((route) => ({
    ...route,
    coordinates: JSON.parse(route.coordinates || '[]')
  }));
}

async function getBuses() {
  const rows = await queryAll(`
    SELECT b.*, r.name AS route_name, r.color AS route_color, r.start_stop, r.end_stop
    FROM buses b
    LEFT JOIN routes r ON r.id = b.route_id
    ORDER BY b.id
  `);

  return rows.map((bus) => ({
    ...bus,
    latitude: Number(bus.latitude),
    longitude: Number(bus.longitude),
    speed: Number(bus.speed),
    is_active: Boolean(bus.is_active),
    route_color: bus.route_color || '#5aa8ff'
  }));
}

app.get('/api/dashboard', async (_req, res) => {
  const [routes, buses] = await Promise.all([getRoutes(), getBuses()]);

  const activeBuses = buses.filter((bus) => bus.is_active).length;
  const onTimeCount = buses.filter((bus) => String(bus.status).toLowerCase() === 'on time').length;
  const avgSpeed = buses.length ? Math.round(buses.reduce((sum, bus) => sum + Number(bus.speed), 0) / buses.length) : 0;
  const alerts = buses.filter((bus) => String(bus.status).toLowerCase() === 'delayed').length;

  res.json({
    user: _req.session.user || null,
    routes,
    buses,
    stats: {
      activeBuses,
      onTimeRate: buses.length ? Math.round((onTimeCount / buses.length) * 100) : 0,
      avgSpeed,
      alertCount: alerts
    }
  });
});

app.get('/api/routes', async (_req, res) => {
  res.json(await getRoutes());
});

app.post('/api/routes', requireAuth, async (req, res) => {
  const { name, startStop, endStop, color, coordinates } = req.body || {};

  if (!name || !startStop || !endStop || !Array.isArray(coordinates) || !coordinates.length) {
    return res.status(400).json({ success: false, message: 'Route name, stops, and coordinates are required.' });
  }

  const normalized = coordinates.map(([lat, lng]) => [Number(lat), Number(lng)]);

  await runSql(
    `INSERT INTO routes (name, start_stop, end_stop, color, coordinates) VALUES (?, ?, ?, ?, ?)`,
    [String(name).trim(), String(startStop).trim(), String(endStop).trim(), color || '#5aa8ff', JSON.stringify(normalized)]
  );

  res.status(201).json({ success: true, message: 'Route created successfully.' });
});

app.get('/api/buses', async (_req, res) => {
  res.json(await getBuses());
});

app.post('/api/buses', requireAuth, async (req, res) => {
  const { plate, driver, routeId, status, speed, latitude, longitude } = req.body || {};

  if (!plate || !driver || !routeId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'Plate number, driver, route, latitude, and longitude are required.' });
  }

  await runSql(
    `INSERT INTO buses (plate, driver, route_id, status, speed, latitude, longitude, is_active, last_update) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [String(plate).trim(), String(driver).trim(), Number(routeId), status || 'On time', Number(speed || 0), Number(latitude), Number(longitude), new Date().toISOString()]
  );

  res.status(201).json({ success: true, message: 'Bus added successfully.' });
});

app.put('/api/buses/:id/location', requireAuth, async (req, res) => {
  const { latitude, longitude, speed, status } = req.body || {};
  const { id } = req.params;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude are required.' });
  }

  await runSql(
    `UPDATE buses SET latitude = ?, longitude = ?, speed = ?, status = ?, last_update = ? WHERE id = ?`,
    [Number(latitude), Number(longitude), Number(speed || 0), status || 'On time', new Date().toISOString(), Number(id)]
  );

  res.json({ success: true, message: 'Bus location updated.' });
});

app.use(express.static(__dirname));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`GPS bus tracking app running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start filesystem server:', error);
  process.exit(1);
});
