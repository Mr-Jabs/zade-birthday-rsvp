export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'https://zade-birthday-api.onrender.com'
).replace(/\/+$/, '');

export function apiUrl(path) {
  return `${API_BASE_URL}/api/v1${path}`;
}
