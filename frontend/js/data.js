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
