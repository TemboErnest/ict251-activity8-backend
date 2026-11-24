if (window.location.hostname === "127.0.0.1") {
  const localUrl = new URL(window.location.href);
  localUrl.hostname = "localhost";
  window.location.replace(localUrl.href);
}

import { recordService } from "./data.js";
import { API_BASE_URL } from "./config.js";

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
const apiGuideLink = document.getElementById("api-guide-link");
const healthLink = document.getElementById("health-link");

const STATUSES = ["Pending", "In progress", "Completed"];
let records = [];

const apiBaseUrl = API_BASE_URL.replace(/\/+$/, "");
apiGuideLink.href = `${apiBaseUrl}/api`;
healthLink.href = `${apiBaseUrl}/health`;

// ---------- Moving star field ----------
const starCanvas = document.getElementById("star-field");
const starContext = starCanvas.getContext("2d");
let stars = [];

function createStars() {
  const count = Math.min(180, Math.floor((window.innerWidth * window.innerHeight) / 9000));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    radius: Math.random() * 2.8 + 1.2,
    speed: Math.random() * 0.4 + 0.12,
    drift: (Math.random() - 0.5) * 0.18,
    alpha: Math.random() * 0.7 + 0.3,
  }));
}

function resizeStarField() {
  const ratio = window.devicePixelRatio || 1;
  starCanvas.width = Math.floor(window.innerWidth * ratio);
  starCanvas.height = Math.floor(window.innerHeight * ratio);
  starCanvas.style.width = window.innerWidth + "px";
  starCanvas.style.height = window.innerHeight + "px";
  starContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  createStars();
}

function animateStars() {
  starContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  stars.forEach((star) => {
    star.y += star.speed;
    star.x += star.drift;
    if (star.y > window.innerHeight) {
      star.y = -2;
      star.x = Math.random() * window.innerWidth;
    }
    if (star.x < 0) star.x = window.innerWidth;
    if (star.x > window.innerWidth) star.x = 0;
    starContext.beginPath();
    starContext.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    starContext.fillStyle = `rgba(225, 230, 255, ${star.alpha})`;
    starContext.shadowBlur = star.radius * 3;
    starContext.shadowColor = `rgba(190, 200, 255, ${star.alpha})`;
    starContext.fill();
  });
  starContext.shadowBlur = 0;
  requestAnimationFrame(animateStars);
}

resizeStarField();
window.addEventListener("resize", resizeStarField);
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  animateStars();
}

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
  applyTheme(localStorage.getItem("theme") || "dark");
} catch (e) {
  applyTheme("dark");
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
