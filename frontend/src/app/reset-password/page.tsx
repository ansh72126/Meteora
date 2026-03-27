"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./page.css";

const IconWarn = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const IconCheck = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

export default function ResetPassword() {
    const router = useRouter();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [msgType, setMsgType] = useState<"error" | "success">("error");
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        // Check if already used this reset link
        const resetUsed = sessionStorage.getItem("resetPasswordUsed");
        if (resetUsed === "true") {
            router.replace("/welcome");
            return;
        }

        // Extract access_token from URL hash
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get("access_token");

        if (token) {
            setAccessToken(token);
            setIsValidating(false);
        } else {
            setMessage("Invalid or expired reset link");
            setMsgType("error");
            setIsValidating(false);
            // Redirect after 3 seconds if no valid token
            setTimeout(() => router.replace("/welcome"), 3000);
        }
    }, [router]);

    useEffect(() => {
        if (success) {
            const interval = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [success]);

    useEffect(() => {
        if (success) {
            sessionStorage.setItem("resetPasswordUsed", "true");  // ← set immediately
        }
    }, [success]);

    // Separate effect for navigation
    useEffect(() => {
        if (success && countdown === 0) {
            // Mark this reset session as used
            // sessionStorage.setItem("resetPasswordUsed", "true");
            router.replace("/welcome");
        }
    }, [success, countdown, router]);

    // Prevent back navigation after successful reset
    useEffect(() => {
        if (success) {
            const preventBack = () => {
                window.history.pushState(null, "", window.location.href);
            };

            window.history.pushState(null, "", window.location.href);
            window.addEventListener("popstate", preventBack);

            return () => {
                window.removeEventListener("popstate", preventBack);
            };
        }
    }, [success]);

    const handleResetPassword = async () => {
        if (!accessToken) {
            setMessage("Invalid reset link. Please request a new one.");
            setMsgType("error");
            return;
        }

        if (!newPassword || !confirmPassword) {
            setMessage("Please fill in all fields");
            setMsgType("error");
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage("Passwords do not match");
            setMsgType("error");
            return;
        }

        if (newPassword.length < 8) {
            setMessage("Password must be at least 8 characters");
            setMsgType("error");
            return;
        }

        setLoading(true);
        const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                password: newPassword,
                access_token: accessToken
            }),
        });
        const data = await res.json();
        setLoading(false);

        if (data.error) {
            setMessage(data.error);
            setMsgType("error");
        } else {
            setMessage("Password updated successfully! Redirecting to login...");
            setMsgType("success");
            setSuccess(true);
        }
    };

    // Show loading state while validating
    if (isValidating) {
        return (
            <div className="rp-wrapper">
                <div className="rp-loading">
                    <div className="rp-loading-text">Validating reset link...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="rp-wrapper">
            <div className="rp-container">
                <div className="rp-header">
                    <h1 className="rp-title">Reset Password</h1>
                    <p className="rp-subtitle">
                        Enter your new password below to regain access to your account.
                    </p>
                </div>

                {message && (
                    <div className={`rp-alert rp-alert-${msgType}`}>
                        <span className="rp-alert-icon">
                            {msgType === "success" ? <IconCheck /> : <IconWarn />}
                        </span>
                        <div>
                            <div>{message}</div>
                            {success && (
                                <div className="rp-countdown">
                                    Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!success && accessToken && (
                    <>
                        <div className="rp-field">
                            <label className="rp-label" htmlFor="newPassword">
                                New Password
                            </label>
                            <div className="rp-input-wrap">
                                <input
                                    id="newPassword"
                                    className="rp-input"
                                    type={showPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Min. 8 characters"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    className="rp-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                        </div>

                        <div className="rp-field">
                            <label className="rp-label" htmlFor="confirmPassword">
                                Confirm Password
                            </label>
                            <div className="rp-input-wrap">
                                <input
                                    id="confirmPassword"
                                    className="rp-input"
                                    type={showConfirm ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter new password"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    className="rp-toggle-btn"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    aria-label={showConfirm ? "Hide password" : "Show password"}
                                >
                                    {showConfirm ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            {confirmPassword && confirmPassword !== newPassword && (
                                <p className="rp-hint rp-hint-error">
                                    Passwords do not match
                                </p>
                            )}
                            {confirmPassword && confirmPassword === newPassword && (
                                <p className="rp-hint rp-hint-success">
                                    ✓ Passwords match
                                </p>
                            )}
                        </div>

                        <button
                            className="rp-submit"
                            onClick={handleResetPassword}
                            disabled={loading}
                            type="button"
                        >
                            {loading ? "Updating..." : "Update Password →"}
                        </button>

                        <div className="rp-footer">
                            Remember your password?{" "}
                            <button
                                className="rp-link"
                                onClick={() => router.push("/welcome")}
                                type="button"
                            >
                                Back to login
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}