import axios from 'axios';

const api = axios.create({
    // Set VITE_API_URL in client/.env for production; falls back to local dev server
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    timeout: 20000, // SMTP can be slow, but never hang forever
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Expired / invalid token -> clear the session so the UI doesn't act logged-in
api.interceptors.response.use(
    (res) => res,
    (error) => {
        const url = error.config?.url || '';
        const isAuthCall = url.startsWith('/auth/');
        if (error.response?.status === 401 && !isAuthCall && localStorage.getItem('token')) {
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo');
            window.location.assign('/login');
        }
        return Promise.reject(error);
    }
);

// One place to turn an axios error into text for the user
export const getErrorMessage = (error, fallback = 'Something went wrong') => {
    if (error?.response?.data?.message) return error.response.data.message;
    if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
    if (error?.request) return 'Cannot reach the server. Is the backend running on port 5000?';
    return fallback;
};

export default api;
