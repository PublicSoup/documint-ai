import axios from 'axios';

// Use environment variable for production, fallback to localhost for dev
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - attach auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor - handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authApi = {
    login: async (email, password) => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        const response = await api.post('/auth/token', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return response.data;
    },
    signup: async (email, password) => {
        const response = await api.post('/auth/signup', { email, password });
        return response.data;
    },
    getMe: async () => {
        const response = await api.get('/auth/users/me');
        return response.data;
    },
};

// Analysis API
export const analyzeApi = {
    analyze: async (code, language = 'python') => {
        const response = await api.post('/analyze', { code, language });
        return response.data;
    },
};

// Billing API
export const billingApi = {
    createCheckout: async (tier) => {
        const response = await api.post(`/billing/create-checkout-session?tier=${tier}`);
        return response.data;
    },
    getPortal: async () => {
        const response = await api.get('/billing/customer-portal');
        return response.data;
    },
};

export default api;
