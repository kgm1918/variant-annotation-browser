// Thin wrapper around our Node.js API.

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export function fetchVariants(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value !== null && value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  return getJson(`/api/variants${query ? `?${query}` : ""}`);
}

export function fetchVariant(id) {
  return getJson(`/api/variants/${id}`);
}

export function fetchStats() {
  return getJson("/api/stats");
}
