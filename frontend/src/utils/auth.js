const AUTH_STORAGE_KEY = "worldracers_auth";
const USER_STORAGE_KEY = "worldracers_user";
const API_BASE_URL = import.meta.env.VITE_API_URL;

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

export const saveUserData = (userData) => {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
};

export const getUserData = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("Error parsing user data:", error);
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
  localStorage.removeItem(USER_STORAGE_KEY);
};

export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Authentication required");
  }

  const url = `${API_BASE_URL}/api${endpoint}`;
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
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
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

  // Get user data after successful registration
  await fetchUserData();

  return authData;
};

export const fetchUserData = async () => {
  try {
    const response = await fetchWithAuth("/users/me");

    if (!response.ok) {
      throw new Error("Failed to fetch user data");
    }

    const userData = await response.json();
    saveUserData(userData);
    return userData;
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error;
  }
};
