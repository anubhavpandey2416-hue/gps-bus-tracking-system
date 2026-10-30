# Advanced GPS Bus Tracking System

This project is an upgraded transit dashboard with real map integration, a SQLite database, admin authentication, and route management.

## Features

- Live map rendering with Leaflet and OpenStreetMap tiles
- SQLite-backed data persistence for routes and buses
- Secure admin login using express-session and bcrypt
- Route creation and management interface
- Bus fleet table with live monitoring and status badges
- Responsive dashboard layout for desktop and mobile

## Default admin login

- Username: admin
- Password: admin123

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Project structure

- `server.js` — Express server and SQLite setup
- `index.html` — dashboard UI for the app
- `styles.css` — dashboard styling and responsive layout
- `app.js` — frontend logic for auth, map rendering, and admin actions
- `data/bus_tracker.db` — SQLite database created automatically on startup
