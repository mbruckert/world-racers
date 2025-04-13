const AUTH_STORAGE_KEY = "worldracers_auth";
const API_BASE_URL = "https://worldracers.warrensnipes.dev/api";

export const saveAuthData = (authData) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
};

export const getAuthData = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("Error parsing auth data:", error);
    return {};
  }
};

export const getAuthToken = () => {
  const authData = getAuthData();
  return authData.access_token;
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

export const clearAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Authentication required");
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuth();
    throw new Error("Authentication expired. Please log in again.");
  }

  return response;
};

export const register = async (name) => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error("Authentication failed");
  }

  const authData = await response.json();
  saveAuthData(authData);
  return authData;
};
