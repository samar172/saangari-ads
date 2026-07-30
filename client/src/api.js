import axios from 'axios';

// In production (Vercel) set VITE_API_URL=https://api.saangariads.com/api
// Falls back to '/api' for local dev with the Vite proxy.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.includes('login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Trigger a file download from an authenticated endpoint
export async function downloadFile(url, fallbackName) {
  const res = await api.get(url, { responseType: 'blob' });
  const disp = res.headers['content-disposition'] || '';
  const match = disp.match(/filename="?([^"]+)"?/);
  const name = match ? match[1] : fallbackName;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(res.data);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Trigger a file download from an authenticated POST endpoint (JSON body).
export async function downloadPost(url, body, fallbackName) {
  const res = await api.post(url, body, { responseType: 'blob' });
  const disp = res.headers['content-disposition'] || '';
  const match = disp.match(/filename="?([^"]+)"?/);
  const name = match ? match[1] : fallbackName;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(res.data);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default api;
