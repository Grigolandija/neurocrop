(function () {
  const config = window.NEUROCROP_CONFIG || {};
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");

  async function request(path, options = {}) {
    if (!apiBaseUrl) {
      throw new Error("API base URL is not configured.");
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `API request failed with ${response.status}.`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function queryString(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    const serialized = query.toString();
    return serialized ? `?${serialized}` : "";
  }

  // This is the frontend/backend contract. The backend owns credentials,
  // ChirpStack connectivity, validation, and database queries.
  window.NeuroCropApi = {
    isConnected: () => Boolean(apiBaseUrl),
    login: (email, password) => request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
    getDashboard: () => request("/dashboard"),
    getLatestReadings: (blockId) => request(`/readings/latest${queryString({ blockId })}`),
    getHistory: (params) => request(`/history${queryString(params)}`),
    getLocations: () => request("/locations"),
    getBlocks: (locationId) => request(`/blocks${queryString({ locationId })}`),
    getNodes: (blockId) => request(`/nodes${queryString({ blockId })}`)
  };
})();
