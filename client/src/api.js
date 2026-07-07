import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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

export default api;
