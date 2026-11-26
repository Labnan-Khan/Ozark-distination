const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'ozark.tokens';

let tokens = readTokens();
const listeners = new Set();

function readTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getTokens() {
  return tokens;
}

export function setTokens(next) {
  tokens = next;
  if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  else localStorage.removeItem(TOKEN_KEY);
  listeners.forEach((listener) => listener(tokens));
}

export function clearTokens() {
  setTokens(null);
}

export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ApiError extends Error {
  constructor(message, { code, details, status, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details || [];
    this.status = status;
    this.requestId = requestId;
  }
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function refreshTokens() {
  if (!tokens?.refreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken })
  });
  const payload = await parseBody(response);
  if (!response.ok || !payload?.success) return false;
  setTokens(payload.data);
  return true;
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    headers = {},
    signal,
    _retried = false
  } = options;

  const requestHeaders = { ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['content-type'] = 'application/json';
  }
  if (auth && tokens?.accessToken) {
    requestHeaders.authorization = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined
      ? undefined
      : body instanceof FormData
        ? body
        : JSON.stringify(body),
    signal
  });

  if (response.status === 401 && auth && !_retried && tokens?.refreshToken) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request(path, { ...options, _retried: true });
    }
    clearTokens();
  }

  const payload = await parseBody(response);
  if (!response.ok || payload?.success === false) {
    const error = payload?.error || {};
    throw new ApiError(error.message || `Request failed (${response.status})`, {
      code: error.code,
      details: error.details,
      status: response.status,
      requestId: error.requestId
    });
  }

  return { data: payload?.data, meta: payload?.meta };
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' })
};

export function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const money = (amountMinor, currency = 'PKR') => {
  const amount = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};
