import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Load user on mount if token exists
    useEffect(() => {
        const loadUser = async () => {
            if (token) {
                try {
                    const userData = await authApi.getMe();
                    setUser(userData);
                } catch (error) {
                    console.error('Failed to load user:', error);
                    logout();
                }
            }
            setLoading(false);
        };
        loadUser();
    }, [token]);

    const login = async (email, password) => {
        const response = await authApi.login(email, password);
        const { access_token } = response;

        localStorage.setItem('token', access_token);
        setToken(access_token);

        // Fetch user data
        const userData = await authApi.getMe();
        setUser(userData);

        return userData;
    };

    const signup = async (email, password) => {
        const userData = await authApi.signup(email, password);
        // After signup, automatically log in
        await login(email, password);
        return userData;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
