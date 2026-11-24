# ICT251 Activity 8: Frontend and Backend Integration (All Code in One File)

## Deploy the current project to Render

The repository includes a Render Blueprint (`render.yaml`) for one web service
that serves both the frontend and API. In Render, create a Blueprint Instance
from this GitHub repository and deploy the `ict251-records-manager` service.
After deployment, use the public `onrender.com` service URL as the app link.
The free service uses temporary SQLite storage, so database contents may reset
when the service restarts or redeploys.

This one file holds everything: the **backend** (Node.js + Express + SQLite), the **frontend** (HTML, CSS, browser JavaScript) and the **deployment steps**.
The assignment says to keep HTML, CSS, browser JS and Node.js in separate files and folders, so each block below says which file to create. Copy each block into its own file using this structure:

```
activity8/
├── backend/
│   ├── package.json
│   ├── server.js
│   └── .env.example
└── frontend/
    ├── index.html          <- must be at the top of the upload folder
    ├── css/style.css
    └── js/
        ├── config.js
        ├── data.js
        └── app.js
```

---

# PART A: BACKEND (Activity 7 API)

If your Activity 7 API already works with the same fields and responses, keep it and only update `CLIENT_ORIGINS`. Otherwise use this version, which matches the Activity 8 requirements.

## backend/package.json

```json
{
  "name": "ict251-records-api",
  "version": "1.0.0",
  "description": "Records API with SQLite for ICT251",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=22.5"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2"
  }
}
```

## backend/server.js

```javascript
const express = require("express");
const cors = require("cors");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "records.db");

const STATUSES = ["Pending", "In progress", "Completed"];

// ---------- CORS ----------
// CLIENT_ORIGINS = comma separated list, e.g.
// https://your-final-site.netlify.app,http://localhost:5500
const defaultOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];
const envOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(
  cors({
    origin(origin, callback) {
      // allow tools like Postman/curl (no Origin header) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "100kb" }));

// ---------- DATABASE ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending','In progress','Completed'))
  )
`);

const q = {
  all: db.prepare("SELECT * FROM records ORDER BY id DESC"),
  one: db.prepare("SELECT * FROM records WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO records (title, category, description, status) VALUES (?, ?, ?, ?)"
  ),
  update: db.prepare(
    "UPDATE records SET title = ?, category = ?, description = ?, status = ? WHERE id = ?"
  ),
  remove: db.prepare("DELETE FROM records WHERE id = ?"),
};

// ---------- VALIDATION ----------
function validate(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { errors: ["Request body must be a JSON object."] };
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";

  if (title.length < 1 || title.length > 100)
    errors.push("Title is required (1 to 100 characters).");
  if (category.length < 1 || category.length > 50)
    errors.push("Category is required (1 to 50 characters).");
  if (description.length > 500)
    errors.push("Description must be 500 characters or fewer.");
  if (!STATUSES.includes(status))
    errors.push("Status must be Pending, In progress or Completed.");

  return { errors, value: { title, category, description, status } };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ message: "ID must be a positive whole number." });
    return null;
  }
  return id;
}

// ---------- ROUTES ----------
app.get("/", (req, res) => {
  res.json({
    name: "ICT251 Records API",
    endpoints: {
      health: "GET /health",
      list: "GET /api/records",
      get: "GET /api/records/:id",
      create: "POST /api/records",
      update: "PUT /api/records/:id",
      delete: "DELETE /api/records/:id",
    },
    fields: ["id", "title", "category", "description", "status"],
    statuses: STATUSES,
  });
});

app.get("/health", (req, res) => {
  try {
    const row = db.prepare("SELECT COUNT(*) AS total FROM records").get();
    res.json({ status: "ok", database: "connected", records: row.total });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
});

app.get("/api/records", (req, res) => {
  res.json(q.all.all());
});

app.get("/api/records/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const record = q.one.get(id);
  if (!record) return res.status(404).json({ message: "Record not found." });
  res.json(record);
});

app.post("/api/records", (req, res) => {
  const { errors, value } = validate(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join(" ") });
  const info = q.insert.run(
    value.title,
    value.category,
    value.description,
    value.status
  );
  res.status(201).json(q.one.get(info.lastInsertRowid));
});

app.put("/api/records/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (!q.one.get(id)) return res.status(404).json({ message: "Record not found." });
  const { errors, value } = validate(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join(" ") });
  q.update.run(value.title, value.category, value.description, value.status, id);
  res.json(q.one.get(id));
});

app.delete("/api/records/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const info = q.remove.run(id);
  if (info.changes === 0)
    return res.status(404).json({ message: "Record not found." });
  res.json({ message: "Record deleted successfully." });
});

// ---------- ERROR HANDLING (always JSON) ----------
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body." });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log("Allowed origins:", allowedOrigins.join(", "));
});
```

## backend/.env.example

```
PORT=3000
CLIENT_ORIGINS=https://your-final-site.netlify.app
DB_PATH=./records.db
```

> On Render, set `CLIENT_ORIGINS` in **Environment** settings (not in a committed file).

---

# PART B: FRONTEND (Activity 6 page connected to the API)

## frontend/js/config.js

```javascript
// Live backend base URL. Use HTTPS and NO final slash.
// This is a public address, not a password.
export const API_BASE_URL = "https://your-backend.onrender.com";
```

> For local testing change it to `http://localhost:3000`, but put the live URL back before publishing.

## frontend/js/data.js

```javascript
import { API_BASE_URL } from "./config.js";

async function request(path, method = "GET", body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(API_BASE_URL + path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "The request failed.");
  }
  return data;
}

export const recordService = {
  list: () => request("/api/records"),
  get: (id) => request(`/api/records/${id}`),
  create: (record) => request("/api/records", "POST", record),
  update: (id, record) => request(`/api/records/${id}`, "PUT", record),
  remove: (id) => request(`/api/records/${id}`, "DELETE"),
};
```

## frontend/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Records Manager | ICT251 Activity 8</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header class="site-header">
    <h1>Records Manager</h1>
    <nav>
      <a href="#records-section">Records</a>
      <a href="#about">About</a>
      <button id="theme-toggle" type="button" aria-label="Toggle colour theme">Toggle theme</button>
    </nav>
  </header>

  <main>
    <div id="message" class="message" role="status" aria-live="polite" hidden></div>

    <section class="card" aria-labelledby="form-title">
      <h2 id="form-title">Add a record</h2>
      <form id="record-form" novalidate>
        <input type="hidden" id="record-id" />

        <label for="title">Title</label>
        <input type="text" id="title" maxlength="100" required />
        <small class="error" id="title-error"></small>

        <label for="category">Category</label>
        <input type="text" id="category" maxlength="50" required />
        <small class="error" id="category-error"></small>

        <label for="description">Description</label>
        <textarea id="description" rows="3" maxlength="500"></textarea>
        <small class="error" id="description-error"></small>

        <label for="status">Status</label>
        <select id="status" required>
          <option value="Pending">Pending</option>
          <option value="In progress">In progress</option>
          <option value="Completed">Completed</option>
        </select>
        <small class="error" id="status-error"></small>

        <div class="actions">
          <button type="submit" id="save-btn" class="primary">Add record</button>
          <button type="button" id="cancel-btn" hidden>Cancel edit</button>
        </div>
      </form>
    </section>

    <section class="card" id="records-section" aria-labelledby="list-title">
      <h2 id="list-title">Records</h2>

      <div class="toolbar">
        <div>
          <label for="search">Search</label>
          <input type="search" id="search" placeholder="Search title, category or description" />
        </div>
        <div>
          <label for="filter-status">Status filter</label>
          <select id="filter-status">
            <option value="All">All</option>
            <option value="Pending">Pending</option>
            <option value="In progress">In progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      <p id="count" class="count">Showing 0 records</p>
      <p id="loading" class="loading" hidden>Loading records...</p>
      <ul id="record-list" class="record-list"></ul>
    </section>

    <section class="card" id="view-panel" hidden aria-labelledby="view-title">
      <h2 id="view-title">Record details</h2>
      <dl id="view-details"></dl>
      <button type="button" id="close-view">Close</button>
    </section>

    <section class="card" id="about" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p><strong>Project name:</strong> Records Manager (ICT251 Activity 8)</p>
      <p><strong>Student number:</strong> YOUR-STUDENT-NUMBER</p>
      <p><strong>How to use:</strong> Fill in the form and press <em>Add record</em>. Use <em>View</em>, <em>Edit</em> and
        <em>Delete</em> on each record. Search and the status filter narrow the list. All records are saved
        in the backend database, so they appear on any device.</p>
      <p>
        <a href="https://your-backend.onrender.com/" target="_blank" rel="noopener">Backend API guide</a> |
        <a href="https://your-backend.onrender.com/health" target="_blank" rel="noopener">/health</a>
      </p>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

## frontend/css/style.css

```css
:root {
  --bg: #f4f6fb;
  --card: #ffffff;
  --text: #1c2333;
  --muted: #5b6478;
  --primary: #2b59c3;
  --primary-text: #ffffff;
  --border: #d5dae6;
  --danger: #c0392b;
  --ok: #1e7e46;
}

[data-theme="dark"] {
  --bg: #141824;
  --card: #1e2433;
  --text: #e8ebf3;
  --muted: #9aa3b8;
  --primary: #6b92ee;
  --primary-text: #0d1220;
  --border: #35405a;
  --danger: #ff7b6b;
  --ok: #5fd08a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

.site-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--primary);
  color: var(--primary-text);
}
.site-header h1 { margin: 0; font-size: 1.4rem; }
.site-header nav { display: flex; gap: 1rem; align-items: center; }
.site-header a { color: inherit; }

main { max-width: 860px; margin: 1.5rem auto; padding: 0 1rem; }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}

label { display: block; margin-top: 0.75rem; font-weight: 600; }

input, textarea, select {
  width: 100%;
  padding: 0.55rem 0.65rem;
  margin-top: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}

button {
  padding: 0.55rem 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
button.primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
button.danger { color: var(--danger); border-color: var(--danger); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.site-header button { background: transparent; color: inherit; border-color: currentColor; }

.actions { display: flex; gap: 0.5rem; margin-top: 1rem; }

.error { color: var(--danger); display: block; min-height: 1.1em; }

.message { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid; }
.message.success { color: var(--ok); border-color: var(--ok); }
.message.error { color: var(--danger); border-color: var(--danger); }

.toolbar { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
@media (max-width: 600px) { .toolbar { grid-template-columns: 1fr; } }

.count, .loading { color: var(--muted); }

.record-list { list-style: none; padding: 0; margin: 0; }
.record-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.85rem;
  margin-bottom: 0.75rem;
}
.record-item h3 { margin: 0 0 0.25rem; }
.record-meta { color: var(--muted); font-size: 0.9rem; }
.badge {
  display: inline-block;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 0.8rem;
}
.badge.pending { border-color: #d4a017; }
.badge.in-progress { border-color: var(--primary); }
.badge.completed { border-color: var(--ok); }
.record-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }

dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; }
dt { font-weight: 600; }
dd { margin: 0; }
```

## frontend/js/app.js

```javascript
import { recordService } from "./data.js";

// ---------- Element references ----------
const form = document.getElementById("record-form");
const idInput = document.getElementById("record-id");
const titleInput = document.getElementById("title");
const categoryInput = document.getElementById("category");
const descriptionInput = document.getElementById("description");
const statusInput = document.getElementById("status");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formTitle = document.getElementById("form-title");
const searchInput = document.getElementById("search");
const filterStatus = document.getElementById("filter-status");
const listEl = document.getElementById("record-list");
const countEl = document.getElementById("count");
const loadingEl = document.getElementById("loading");
const messageEl = document.getElementById("message");
const viewPanel = document.getElementById("view-panel");
const viewDetails = document.getElementById("view-details");
const closeView = document.getElementById("close-view");
const themeToggle = document.getElementById("theme-toggle");

const STATUSES = ["Pending", "In progress", "Completed"];
let records = [];

// ---------- Messages ----------
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = "message " + type;
  messageEl.hidden = false;
}
function clearMessage() {
  messageEl.hidden = true;
  messageEl.textContent = "";
}

// ---------- Theme (preference only, allowed in localStorage) ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
try {
  applyTheme(localStorage.getItem("theme") || "light");
} catch (e) {
  applyTheme("light");
}
themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
});

// ---------- Validation (quick browser feedback; backend validates too) ----------
function clearErrors() {
  ["title", "category", "description", "status"].forEach((f) => {
    document.getElementById(f + "-error").textContent = "";
  });
}

function readForm() {
  return {
    title: titleInput.value.trim(),
    category: categoryInput.value.trim(),
    description: descriptionInput.value.trim(),
    status: statusInput.value,
  };
}

function validateRecord(r) {
  clearErrors();
  let ok = true;
  if (r.title.length < 1 || r.title.length > 100) {
    document.getElementById("title-error").textContent = "Title is required (max 100 characters).";
    ok = false;
  }
  if (r.category.length < 1 || r.category.length > 50) {
    document.getElementById("category-error").textContent = "Category is required (max 50 characters).";
    ok = false;
  }
  if (r.description.length > 500) {
    document.getElementById("description-error").textContent = "Description must be 500 characters or fewer.";
    ok = false;
  }
  if (!STATUSES.includes(r.status)) {
    document.getElementById("status-error").textContent = "Choose a valid status.";
    ok = false;
  }
  return ok;
}

// ---------- Rendering ----------
function badgeClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function getFiltered() {
  const term = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  return records.filter((r) => {
    const matchesStatus = status === "All" || r.status === status;
    const text = `${r.title} ${r.category} ${r.description}`.toLowerCase();
    return matchesStatus && (term === "" || text.includes(term));
  });
}

function render() {
  const shown = getFiltered();
  listEl.replaceChildren();

  shown.forEach((r) => {
    const li = document.createElement("li");
    li.className = "record-item";

    const h3 = document.createElement("h3");
    h3.textContent = r.title;

    const meta = document.createElement("p");
    meta.className = "record-meta";
    meta.textContent = `Category: ${r.category} `;
    const badge = document.createElement("span");
    badge.className = "badge " + badgeClass(r.status);
    badge.textContent = r.status;
    meta.appendChild(badge);

    const desc = document.createElement("p");
    desc.textContent = r.description || "No description.";

    const actions = document.createElement("div");
    actions.className = "record-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => handleView(r.id));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEdit(r));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => handleDelete(r));

    actions.append(viewBtn, editBtn, delBtn);
    li.append(h3, meta, desc, actions);
    listEl.appendChild(li);
  });

  countEl.textContent = `Showing ${shown.length} of ${records.length} record${records.length === 1 ? "" : "s"}`;
}

// ---------- Loading from the API ----------
async function loadRecords() {
  loadingEl.hidden = false;
  listEl.replaceChildren();
  try {
    records = await recordService.list();
    render();
  } catch (err) {
    records = [];
    render();
    showMessage(
      "Could not load records. The server may be unavailable or waking up. Details: " + err.message,
      "error"
    );
  } finally {
    loadingEl.hidden = true;
  }
}

// ---------- View ----------
async function handleView(id) {
  clearMessage();
  try {
    const r = await recordService.get(id);
    viewDetails.replaceChildren();
    [
      ["ID", r.id],
      ["Title", r.title],
      ["Category", r.category],
      ["Description", r.description || "No description."],
      ["Status", r.status],
    ].forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = String(v);
      viewDetails.append(dt, dd);
    });
    viewPanel.hidden = false;
    viewPanel.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showMessage("Could not load that record: " + err.message, "error");
  }
}
closeView.addEventListener("click", () => { viewPanel.hidden = true; });

// ---------- Edit / cancel ----------
function startEdit(r) {
  clearMessage();
  clearErrors();
  idInput.value = r.id;
  titleInput.value = r.title;
  categoryInput.value = r.category;
  descriptionInput.value = r.description;
  statusInput.value = r.status;
  formTitle.textContent = "Edit record";
  saveBtn.textContent = "Save changes";
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
  titleInput.focus();
}

function resetForm() {
  form.reset();
  idInput.value = "";
  clearErrors();
  formTitle.textContent = "Add a record";
  saveBtn.textContent = "Add record";
  cancelBtn.hidden = true;
}

cancelBtn.addEventListener("click", () => {
  resetForm();
  clearMessage();
});

// ---------- Add / save ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  const record = readForm();
  if (!validateRecord(record)) return;

  const editingId = idInput.value;
  saveBtn.disabled = true;
  try {
    if (editingId) {
      await recordService.update(editingId, record);
    } else {
      await recordService.create(record);
    }
    // Success is shown only after the backend confirmed the action
    showMessage(editingId ? "Record updated successfully." : "Record added successfully.", "success");
    resetForm();
    await loadRecords();
  } catch (err) {
    // Keep the input so the user can retry
    showMessage("Could not save the record: " + err.message, "error");
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- Delete ----------
async function handleDelete(r) {
  if (!window.confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
  clearMessage();
  try {
    await recordService.remove(r.id);
    if (idInput.value === String(r.id)) resetForm();
    showMessage("Record deleted successfully.", "success");
    await loadRecords();
  } catch (err) {
    showMessage("Could not delete the record: " + err.message, "error");
  }
}

// ---------- Search and filter ----------
searchInput.addEventListener("input", render);
filterStatus.addEventListener("change", render);

// ---------- Start ----------
loadRecords();
```

---

# PART C: RUN LOCALLY FIRST

**Backend**
```bash
cd backend
npm install
npm start
# test: http://localhost:3000/health
```

**Frontend** (ES modules need a server, not double-clicking the file)
1. In `js/config.js` set `API_BASE_URL = "http://localhost:3000"`.
2. Open the `frontend` folder in VS Code and use **Live Server** (usually `http://127.0.0.1:5500`), or run `npx serve frontend`.
3. If you use another port, add that origin to `CLIENT_ORIGINS`.

Quick checks: add, edit, delete a record, then open `http://localhost:3000/api/records` to confirm the change is there.

---

# PART D: HOST THE SYSTEM

## 1. Backend (Render or similar)
1. Push the `backend` folder to GitHub (add `node_modules/` and `*.db` to `.gitignore`).
2. Create a **Web Service** on Render: Build command `npm install`, Start command `npm start`.
3. **Persistence:** SQLite is a file. On Render's free tier the filesystem resets on restart/redeploy, so data can disappear. To keep records after restarts, attach a **persistent disk** (paid) mounted at e.g. `/var/data` and set `DB_PATH=/var/data/records.db`. Alternatives with free persistent SQLite hosting: Fly.io volumes or Railway volumes. Use whichever your Activity 7 used.
4. Check `https://your-backend.onrender.com/health` shows `"database":"connected"`.

## 2. Frontend (Netlify, Vercel, GitHub Pages or Cloudflare Pages)
1. Set `js/config.js` to your **live backend URL** (HTTPS, no final slash).
2. Edit the About section in `index.html`: your student number and the real backend links.
3. Deploy the `frontend` folder (e.g. Netlify drag-and-drop). `index.html` must be at the top of the folder.
4. Copy the final site URL, e.g. `https://your-final-site.netlify.app`.

## 3. Allow the frontend (CORS)
In the backend host's environment settings set:
```
CLIENT_ORIGINS=https://your-final-site.netlify.app
```
(scheme + host only, no path, no final slash; separate several with commas). **Redeploy/restart the backend.**

## 4. Test on the live system (Section 8 checks)
Open the live link in a private/incognito window and from another device:
- [ ] Records load (shows "Loading records..." first)
- [ ] Add a record, it appears, and shows in `/api/records`
- [ ] View, Edit then Save changes, Cancel edit
- [ ] Delete with confirmation
- [ ] Search and status filter, count updates
- [ ] Stop/block the backend: a real error message appears
- [ ] About section has project name, student number, links to API guide and `/health`
- [ ] Browser console has no CORS errors

## 5. Submit
Paste **only the live frontend URL** (not localhost, repo or dashboard link) in the Activity 8 link field before **27 November 2026, 23:59**. Keep frontend, backend and database running until marking is finished.

---

# Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| CORS error in console, works in Postman | Frontend origin missing in `CLIENT_ORIGINS`, trailing slash, or backend not restarted |
| "Failed to fetch" | Wrong `API_BASE_URL`, backend asleep (free tier cold start: wait ~30-60 s), or http/https mix |
| Records vanish after restart | SQLite on non-persistent disk; use a persistent disk and `DB_PATH` |
| Blank page locally | Opened via `file://`; use Live Server (ES modules need http) |
| `node:sqlite` not found | Use Node 22.5 or newer (on Render add env var `NODE_VERSION=22`) |
| 404 on the live site | `index.html` not at top level of the upload folder |
