import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import useCountdown from '../hooks/useCountdown';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [showOTP, setShowOTP] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, startCooldown] = useCountdown();

    const { login, verifyOTP, resendOTP } = useContext(AuthContext);
    const navigate = useNavigate();

    const goHome = (data) => navigate(data.role === 'admin' ? '/admin' : '/dashboard');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setInfo('');
        try {
            const data = showOTP ? await verifyOTP(email, otp.trim()) : await login(email, password);
            goHome(data);
        } catch (err) {
            if (err && err.needsVerification) {
                // Account exists but is not verified yet -> switch to the OTP box
                setShowOTP(true);
                if (err.emailSent) {
                    setInfo('Account not verified. We sent a 6-digit code to your email (check spam too).');
                    startCooldown(30);
                } else {
                    setError(err.message); // email really failed - say so, user can press "Resend"
                }
            } else {
                setError(typeof err === 'string' ? err : err?.message || 'Something went wrong');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setInfo('');
        try {
            await resendOTP(email);
            setInfo('A new code has been sent to your email.');
            startCooldown(30);
        } catch (err) {
            setError(err);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Welcome Back</h2>
                <p className="text-gray-500">Sign in to your Eventora account</p>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-center shadow-inner border border-red-100">{error}</div>}
            {info && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-6 text-center border border-green-200">{info}</div>}

            <form onSubmit={handleSubmit} className="space-y-6">
                {!showOTP ? (
                    <>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                            <input
                                type="email"
                                required
                                autoComplete="email"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 focus:border-gray-700 transition shadow-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 focus:border-gray-700 transition shadow-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </>
                ) : (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Verification Code (OTP)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            placeholder="6-digit code"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 transition shadow-sm font-bold tracking-widest text-center text-lg"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                            maxLength={6}
                        />
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={cooldown > 0}
                            className="mt-3 text-sm font-semibold text-gray-700 hover:underline disabled:text-gray-400 disabled:no-underline"
                        >
                            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                        </button>
                    </div>
                )}
                <button
                    type="submit"
                    disabled={loading || (showOTP && otp.length !== 6)}
                    className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-black focus:ring-4 focus:ring-gray-200 transition shadow-md disabled:opacity-60"
                >
                    {loading ? 'Processing...' : (showOTP ? 'Verify OTP & Log In' : 'Sign In')}
                </button>
            </form>

            <p className="text-center mt-8 text-gray-600">
                Don't have an account? <Link to="/register" className="text-gray-900 font-bold hover:underline">Sign up</Link>
            </p>
        </div>
    );
};

export default Login;
