const express = require("express");
const cors = require("cors");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "records.db");
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
if (pool) {
  pool.on("error", (err) => console.error("Unexpected PostgreSQL pool error:", err));
}

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
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ---------- DATABASE ----------
let db;
let q;

if (!pool) {
  db = new DatabaseSync(DB_PATH);
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
  q = {
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
}

async function initializePostgres() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending','In progress','Completed'))
    )
  `);
}

async function listRecords() {
  if (pool) {
    const result = await pool.query("SELECT * FROM records ORDER BY id DESC");
    return result.rows;
  }
  return q.all.all();
}

async function getRecord(id) {
  if (pool) {
    const result = await pool.query("SELECT * FROM records WHERE id = $1", [id]);
    return result.rows[0] || null;
  }
  return q.one.get(id) || null;
}

async function createRecord(record) {
  if (pool) {
    const result = await pool.query(
      "INSERT INTO records (title, category, description, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [record.title, record.category, record.description, record.status]
    );
    return result.rows[0];
  }
  const info = q.insert.run(
    record.title,
    record.category,
    record.description,
    record.status
  );
  return q.one.get(info.lastInsertRowid);
}

async function updateRecord(id, record) {
  if (pool) {
    const result = await pool.query(
      "UPDATE records SET title = $1, category = $2, description = $3, status = $4 WHERE id = $5 RETURNING *",
      [record.title, record.category, record.description, record.status, id]
    );
    return result.rows[0] || null;
  }
  q.update.run(record.title, record.category, record.description, record.status, id);
  return q.one.get(id) || null;
}

async function deleteRecord(id) {
  if (pool) {
    const result = await pool.query("DELETE FROM records WHERE id = $1", [id]);
    return result.rowCount > 0;
  }
  return q.remove.run(id).changes > 0;
}

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

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// ---------- ROUTES ----------
app.get("/api", (req, res) => {
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

app.get("/health", asyncRoute(async (req, res) => {
  try {
    const records = await listRecords();
    res.json({
      status: "ok",
      database: "connected",
      records: records.length,
    });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(500).json({ status: "error", database: "disconnected" });
  }
}));

app.get("/api/records", asyncRoute(async (req, res) => {
  res.json(await listRecords());
}));

app.get("/api/records/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const record = await getRecord(id);
  if (!record) return res.status(404).json({ message: "Record not found." });
  res.json(record);
}));

app.post("/api/records", asyncRoute(async (req, res) => {
  const { errors, value } = validate(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join(" ") });
  res.status(201).json(await createRecord(value));
}));

app.put("/api/records/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (!await getRecord(id)) return res.status(404).json({ message: "Record not found." });
  const { errors, value } = validate(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join(" ") });
  const record = await updateRecord(id, value);
  if (!record) return res.status(404).json({ message: "Record not found." });
  res.json(record);
}));

app.delete("/api/records/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (!await deleteRecord(id))
    return res.status(404).json({ message: "Record not found." });
  res.json({ message: "Record deleted successfully." });
}));

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

async function start() {
  await initializePostgres();
  app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
    console.log(`Database: ${pool ? "PostgreSQL" : "SQLite"}`);
    console.log("Allowed origins:", allowedOrigins.join(", "));
  });
}

start().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
