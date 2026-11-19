import React, { createContext, useState, useEffect, useCallback } from 'react';
import api, { getErrorMessage } from '../utils/axios';

export const AuthContext = createContext();

const saveSession = (data) => {
    localStorage.setItem('userInfo', JSON.stringify(data));
    localStorage.setItem('token', data.token);
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            const userInfo = localStorage.getItem('userInfo');
            if (userInfo) setUser(JSON.parse(userInfo));
        } catch {
            // corrupted storage - start logged out
            localStorage.removeItem('userInfo');
            localStorage.removeItem('token');
        }
        setLoading(false);
    }, []);

    const login = useCallback(async (email, password) => {
        try {
            const { data } = await api.post('/auth/login', { email, password });
            setUser(data);
            saveSession(data);
            return data;
        } catch (error) {
            // Unverified account: hand the whole payload (needsVerification, emailSent, message) to the page
            if (error.response?.data?.needsVerification) throw error.response.data;
            throw getErrorMessage(error, 'Login failed');
        }
    }, []);

    const register = useCallback(async (name, email, password) => {
        try {
            const { data } = await api.post('/auth/register', { name, email, password });
            return data; // { message, email, emailSent }
        } catch (error) {
            throw getErrorMessage(error, 'Registration failed');
        }
    }, []);

    const verifyOTP = useCallback(async (email, otp) => {
        try {
            const { data } = await api.post('/auth/verify-otp', { email, otp });
            setUser(data);
            saveSession(data);
            return data;
        } catch (error) {
            throw getErrorMessage(error, 'OTP verification failed');
        }
    }, []);

    const resendOTP = useCallback(async (email) => {
        try {
            const { data } = await api.post('/auth/resend-otp', { email });
            return data;
        } catch (error) {
            throw getErrorMessage(error, 'Could not resend OTP');
        }
    }, []);

    const logout = useCallback(() => {
        setUser(null);
        localStorage.removeItem('userInfo');
        localStorage.removeItem('token');
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, register, verifyOTP, resendOTP, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
