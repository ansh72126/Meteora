"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import "./page.css";

// ── SVG Icons ──────────────────────────────────────────────
const IconEyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconAt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);
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
const IconCheckLg = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconDiamond = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 12l10 10 10-10z" />
  </svg>
);

// ── Password strength ──────────────────────────────────────
function getStrength(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, Math.ceil((s * 4) / 5));
}
const STRENGTH_META = [
  { label: "", color: "" },
  { label: "Weak", color: "#C8502A" },
  { label: "Fair", color: "#D4860E" },
  { label: "Good", color: "#5A8F3C" },
  { label: "Strong", color: "#2D7D46" },
];

const MAX_ATTEMPTS = 3;
const LOCK_SECS = 30;
const REDIRECT_MS = 3000;

// ── Typewriter words ───────────────────────────────────────
const TW_WORDS = [
  "Histogram.",
  "Heatmap.",
  "Scatter Plot.",
  "Time Series.",
  "Box Plot.",
  "KDE Curve.",
  "Pie Chart.",
  "Bar Chart.",
  "Line Chart.",
  "Bell Curve.",
  "ECDF Plot.",
];
const TYPE_MS = 200;
const DELETE_MS = 32;
const HOLD_MS = 1500;
const PAUSE_MS = 300;

// ── Component ──────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const PIN_LENGTH = 8;

  type View = "login" | "signup" | "verify" | "verify-success" | "login-success" | "signup-success" | "forgot-password";
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [identifier, setIdentifier] = useState<string>("");
  const [loggedName, setLoggedName] = useState<string>("");
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [message, setMessage] = useState<string>("");
  const [msgType, setMsgType] = useState<"error" | "success" | "warn">("error");
  const [loading, setLoading] = useState<boolean>(false);

  // password visibility
  const [loginPassVis, setLoginPassVis] = useState<boolean>(false);
  const [signupPassVis, setSignupPassVis] = useState<boolean>(false);
  const [confirmPassVis, setConfirmPassVis] = useState<boolean>(false);
  const [passFocused, setPassFocused] = useState<boolean>(false);

  // lockout
  const [attempts, setAttempts] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);
  const [lockTimer, setLockTimer] = useState<number>(0);

  // redirect progress
  const [progress, setProgress] = useState<number>(0);

  // ── Typewriter state ──────────────────────────────────
  const [twText, setTwText] = useState<string>("");
  const [showPlus, setShowPlus] = useState<boolean>(false);
  const [statN1, setStatN1] = useState<number>(0);
  const [infSymbol, setInfSymbol] = useState<boolean>(false);
  const [sigmaVis, setSigmaVis] = useState<boolean>(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number>(3);

  const twRef = useRef({ wordIdx: 0, charIdx: 0, deleting: false });
  const twTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Typewriter engine ─────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const state = twRef.current;
      const word = TW_WORDS[state.wordIdx] ?? "";

      if (!state.deleting) {
        state.charIdx++;
        setTwText(word.slice(0, state.charIdx));
        if (state.charIdx === word.length) {
          state.deleting = true;
          twTimer.current = setTimeout(tick, HOLD_MS);
        } else {
          twTimer.current = setTimeout(tick, TYPE_MS);
        }
      } else {
        state.charIdx--;
        setTwText(word.slice(0, state.charIdx));
        if (state.charIdx === 0) {
          state.deleting = false;
          state.wordIdx = (state.wordIdx + 1) % TW_WORDS.length;
          twTimer.current = setTimeout(tick, PAUSE_MS);
        } else {
          twTimer.current = setTimeout(tick, DELETE_MS);
        }
      }
    };

    // start after initial fade-in
    twTimer.current = setTimeout(tick, 900);
    return () => { if (twTimer.current) clearTimeout(twTimer.current); };
  }, []);

  // ── Message timer cleanup ──────────────────────────────
  useEffect(() => {
    return () => {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, []);


  // Clear reset password session when returning to login
  // useEffect(() => {
  //   sessionStorage.removeItem("resetPasswordUsed");
  // }, []);

  // ── Restore lockout state from localStorage on mount ──
  useEffect(() => {
    const storedAttempts = localStorage.getItem("loginAttempts");
    const storedLockEnd = localStorage.getItem("lockEndTime");

    if (storedAttempts) {
      setAttempts(parseInt(storedAttempts));
    }

    if (storedLockEnd) {
      const lockEndTime = parseInt(storedLockEnd);
      const now = Date.now();
      const remainingMs = lockEndTime - now;

      if (remainingMs > 0) {
        setLocked(true);
        setLockTimer(Math.ceil(remainingMs / 1000));
        setMessage(`Account locked after ${MAX_ATTEMPTS} failed attempts.`);
        setMsgType("warn");

        // Start the countdown interval
        const interval = setInterval(() => {
          const currentRemaining = lockEndTime - Date.now();
          if (currentRemaining <= 0) {
            clearInterval(interval);
            setLocked(false);
            setAttempts(0);
            setMessage("");
            setMsgType("error");
            localStorage.removeItem("loginAttempts");
            localStorage.removeItem("lockEndTime");
            setLockTimer(0);
          } else {
            setLockTimer(Math.ceil(currentRemaining / 1000));
          }
        }, 1000);

        return () => clearInterval(interval);
      } else {
        // Lock expired, clear storage
        localStorage.removeItem("loginAttempts");
        localStorage.removeItem("lockEndTime");
      }
    }
  }, []);

  // ── Stat count-up animations ──────────────────────────
  useEffect(() => {
    // 15+ count-up
    const steps = 30;
    const duration = 1200;
    const stepMs = duration / steps;
    let i = 0;
    const t1 = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        const p = i / steps;
        const val = Math.round(15 * (1 - Math.pow(1 - p, 2.8)));
        setStatN1(val);
        if (i >= steps) {
          setStatN1(15);
          clearInterval(interval);
          setShowPlus(true);
        }
      }, stepMs);
    }, 1000);

    // ∞ flip
    const t2 = setTimeout(() => setInfSymbol(true), 1100);

    // ∑ pop-in
    const t3 = setTimeout(() => setSigmaVis(true), 1300);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const strength = getStrength(password);
  const strengthMeta = STRENGTH_META[strength] ?? STRENGTH_META[1] ?? { label: "Weak", color: "#C8502A" };

  const showMsg = (msg: string, type: "error" | "success" | "warn" = "error") => {
    setMessage(msg);
    setMsgType(type);

    // clear any existing timer
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);

    // auto-dismiss after 3s
    msgTimerRef.current = setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${r < 10 ? "0" : ""}${r}`;
  };

  // ── Redirect progress bar ──────────────────────────────
  useEffect(() => {
    if (view === "login-success" || view === "signup-success" || view === "verify-success") {
      setProgress(0);
      setRedirectCountdown(3);

      const progressTimer = setTimeout(() => setProgress(100), 60);

      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearTimeout(progressTimer);
        clearInterval(countdownInterval);
      };
    }
  }, [view]);

  useEffect(() => {
    if (view !== "verify-success") return;
    let cancelled = false;

    const redirectTimer = setTimeout(async () => {
      if (cancelled) return;

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      // If the session isn't available yet, go back to /welcome instead of
      // bouncing from /dashboard/upload.
      router.replace(data.session ? "/dashboard/upload" : "/welcome");
    }, REDIRECT_MS);

    return () => {
      cancelled = true;
      clearTimeout(redirectTimer);
    };
  }, [view, router]);

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/sync`,
      },
    })
    if (error) console.error(error)
  }

  // ── Lockout ────────────────────────────────────────────
  const triggerLockout = () => {
    const lockEndTime = Date.now() + (LOCK_SECS * 1000);
    localStorage.setItem("lockEndTime", lockEndTime.toString());
    localStorage.removeItem("loginAttempts"); // Add this line to clear attempts from storage

    setLocked(true);
    setLockTimer(LOCK_SECS);
    setAttempts(0); // Add this line to clear attempts from state

    const interval = setInterval(() => {
      setLockTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setLocked(false);
          setAttempts(0);
          setMessage("");
          setMsgType("error");
          // Clear localStorage when lock expires
          localStorage.removeItem("loginAttempts");
          localStorage.removeItem("lockEndTime");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── SIGNUP ─────────────────────────────────────────────
  const handleSignup = async (): Promise<void> => {
    if (!email || !password || !confirm) { showMsg("Please fill in all fields"); return; }
    if (password !== confirm) { showMsg("Passwords do not match."); return; }
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.username) localStorage.setItem("username", data.username);
    if (!data.error) {
      setView("signup-success");
      setTimeout(() => {
        setMessage("");        // ← clear before showing verify
        setView("verify");
      }, REDIRECT_MS);
    } else {
      showMsg(data.error);
    }
  };

  // ── LOGIN ──────────────────────────────────────────────
  const handleLogin = async (): Promise<void> => {
    if (locked) return;
    if (!identifier || !password) {
      showMsg("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      let emailToUse = identifier.trim();

      // If identifier does NOT look like an email, treat it as username
      if (!emailToUse.includes("@")) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setLoading(false);
          showMsg("You appear to be offline. Please check your internet connection and try again.");
          return;
        }

        let res: Response;
        try {
          res = await fetch("/api/auth/resolve-username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: emailToUse }),
          });
        } catch {
          setLoading(false);
          showMsg("Cannot reach server. Check your internet connection and try again.");
          return;
        }

        let payload: any = null;
        try {
          payload = await res.json();
        } catch {
          // ignore JSON parse errors; handled below
        }

        if (!res.ok) {
          setLoading(false);
          const errText = String(payload?.error || "");
          const looksLikeConnectivity =
            (typeof navigator !== "undefined" && navigator.onLine === false) ||
            res.status >= 500 ||
            /resolve username/i.test(errText) ||
            /network|internet|fetch|offline|timeout|temporarily/i.test(errText);
          showMsg(
            looksLikeConnectivity
              ? "Cannot resolve username right now. Please check your internet connection and try again."
              : (payload?.error ||
                  `Login service error (resolve username failed: ${res.status}). Please try again.`)
          );
          return;
        }

        if (payload?.error || !payload?.email) {
          setLoading(false);
          showMsg(payload?.error || "Username not found.");
          return;
        }

        emailToUse = payload.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      setLoading(false);

      if (error) {
        const next = attempts + 1;
        setAttempts(next);
        localStorage.setItem("loginAttempts", next.toString());
        if (next >= MAX_ATTEMPTS) {
          showMsg(`Account locked after ${MAX_ATTEMPTS} failed attempts.`, "warn");
          triggerLockout();
        } else {
          const msg = String(error.message || "");
          const looksLikeConnectivity =
            (typeof navigator !== "undefined" && navigator.onLine === false) ||
            /failed to fetch|networkerror|load failed|fetch|offline|internet|timeout/i.test(msg);

          // Attempts remaining is shown by the dedicated UI row below the alert.
          showMsg(
            looksLikeConnectivity
              ? "Failed to fetch. Check your internet connection and try again."
              : (msg || "Login failed. Please try again.")
          );
        }
        return;
      }

      const user = data.session?.user;

      const username =
        user?.user_metadata?.username ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "User";

      if (username) {
        localStorage.setItem("username", username);
        setLoggedName(username);
      }
      if (user?.email) {
        localStorage.setItem("email", user.email);
      }

      sessionStorage.setItem("auth", "true");
      setAttempts(0);
      localStorage.removeItem("loginAttempts");
      setView("login-success");
      setTimeout(() => router.replace("/dashboard/upload"), REDIRECT_MS);
    } catch (err: any) {
      setLoading(false);

      const next = attempts + 1;
      setAttempts(next);
      localStorage.setItem("loginAttempts", next.toString());

      if (next >= MAX_ATTEMPTS) {
        showMsg(`Account locked after ${MAX_ATTEMPTS} failed attempts.`, "warn");
        triggerLockout();
        return;
      }

      const msg = String(err?.message || "");
      const looksLikeConnectivity =
        (typeof navigator !== "undefined" && navigator.onLine === false) ||
        /failed to fetch|networkerror|load failed|fetch|offline|internet|timeout/i.test(msg);

      showMsg(
        looksLikeConnectivity
          ? "Failed to fetch. Check your internet connection and try again."
          : (msg || "Unexpected login error.")
      );
    }
  };

  // ── VERIFY ─────────────────────────────────────────────
  const handleVerify = async (): Promise<void> => {
    const pinCode = pin.join("");
    if (pinCode.length !== 8) { showMsg("Please enter all 8 digits"); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: pinCode,
      type: "signup",
    });

    if (error) {
      setLoading(false);
      showMsg(error.message || "Verification failed. Please try again.");
      return;
    }

    // Ensure browser session is available before moving to success redirect.
    for (let i = 0; i < 8; i += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setLoading(false);
        sessionStorage.setItem("auth", "true");
        if (data.session.user.email) localStorage.setItem("email", data.session.user.email);
        setMessage("");
        setView("verify-success");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setLoading(false);
    showMsg("Verification succeeded, but session was not ready. Please sign in again.");
  };

  // ── PIN ────────────────────────────────────────────────
  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < PIN_LENGTH - 1)
      (document.querySelector(`input[data-pin-index="${index + 1}"]`) as HTMLInputElement)?.focus();
  };
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[index] && index > 0)
      (document.querySelector(`input[data-pin-index="${index - 1}"]`) as HTMLInputElement)?.focus();
  };
  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(pasted.split("").concat(Array(PIN_LENGTH).fill("")).slice(0, PIN_LENGTH));
  };


  // ── FORGOT PASSWORD ────────────────────────────────────
  const handleForgotPassword = async (): Promise<void> => {
    if (!identifier) {
      showMsg("Please enter your email address");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.error) {
      showMsg(data.error);
    } else {
      showMsg("Password reset link sent to your email!", "success");
    }
  };

  // ── RENDER ─────────────────────────────────────────────
  return (
    <div className="ax-wrapper">

      {/* ════════════════════════════
          LEFT PANEL — typewriter
      ════════════════════════════ */}
      <div className="ax-panel-left">

        {/* Brand */}
        <div
          className="ax-brand ax-anim-1"
          style={{ cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          <img
            src="/landing/meteora-cut-removebg-preview.png"
            alt="Meteora"
            className="ax-logo-img"
          />
        </div>

        {/* Body */}
        <div className="ax-panel-body">
          <div className="ax-static-line ax-anim-2">
            Your data,<br />visualised as a
          </div>

          <div className="ax-tw-row ax-anim-3">
            <span className="ax-tw-word">{twText}</span>
            <span className="ax-tw-cursor" />
          </div>

          <p className="ax-panel-sub ax-anim-4">
            Upload a CSV once. Explore every dimension &mdash; distributions,
            correlations, trends and computed statistics, instantly.
          </p>
        </div>

        {/* Stats — 15+ | ∞ | ∑ | 1 */}
        <div className="ax-stat-row ax-anim-5">

          {/* 15+ chart types */}
          <div className="ax-stat">
            <div className="ax-stat-number">
              <span>{statN1}</span>
              <span className={`ax-stat-plus${showPlus ? " ax-stat-plus-show" : ""}`}>+</span>
            </div>
            <div className="ax-stat-label">Chart Types</div>
          </div>


          {/* ∑ statistics */}
          <div className="ax-stat">
            <div className={`ax-stat-number ax-stat-sigma${sigmaVis ? " ax-stat-sigma-show" : ""}`}>
              &Sigma;
            </div>
            <div className="ax-stat-label">Statistics</div>
          </div>


          {/* ∞ datasets */}
          <div className="ax-stat">
            <div className={`ax-stat-number ax-stat-inf${infSymbol ? " ax-stat-inf-show" : ""}`}>
              {infSymbol ? "\u221E" : "0"}
            </div>
            <div className="ax-stat-label">Datasets</div>
          </div>

          {/* 1 upload */}
          <div className="ax-stat">
            <div className="ax-stat-number">1</div>
            <div className="ax-stat-label">Click to Upload</div>
          </div>

        </div>
      </div>

      {/* ════════════════════════════
          RIGHT PANEL — unchanged
      ════════════════════════════ */}
      <div className="ax-panel-right">
        <div className="ax-form-container">

          {/* LOGIN SUCCESS */}
          {view === "login-success" && (
            <div className="ax-success-screen">
              <div className="ax-success-ring"><IconCheckLg /></div>
              <div className="ax-success-title">
                Welcome back{loggedName ? `, ${loggedName}` : ""}.
              </div>
              <p className="ax-success-msg">
                Signed in successfully.<br />Redirecting to dashboard&hellip;
              </p>
              <div className="ax-redir-bar">
                <div className="ax-redir-fill"
                  style={{ width: `${progress}%`, transition: `width ${REDIRECT_MS}ms linear` }} />
              </div>
              <div className="ax-redir-hint">Redirecting in {redirectCountdown} second{redirectCountdown !== 1 ? 's' : ''}</div>
            </div>
          )}

          {/* SIGNUP SUCCESS */}
          {view === "signup-success" && (
            <div className="ax-success-screen">
              <div className="ax-success-ring"><IconCheckLg /></div>
              <div className="ax-success-title">Account Created!</div>
              <p className="ax-success-msg">
                Your account is ready.<br />Redirecting to verification&hellip;
              </p>
              <div className="ax-redir-bar">
                <div className="ax-redir-fill"
                  style={{ width: `${progress}%`, transition: `width ${REDIRECT_MS}ms linear` }} />
              </div>
              <div className="ax-redir-hint">Redirecting in 3 seconds</div>
            </div>
          )}

          {/* VERIFY SUCCESS */}
          {view === "verify-success" && (
            <div className="ax-success-screen">
              <div className="ax-success-ring"><IconCheckLg /></div>
              <div className="ax-success-title">Email Verified!</div>
              <p className="ax-success-msg">
                Your account is verified.<br />Redirecting to Upload&hellip;
              </p>
              <div className="ax-redir-bar">
                <div className="ax-redir-fill"
                  style={{ width: `${progress}%`, transition: `width ${REDIRECT_MS}ms linear` }} />
              </div>
              <div className="ax-redir-hint">Redirecting in {redirectCountdown} second{redirectCountdown !== 1 ? "s" : ""}</div>
            </div>
          )}

          {/* LOGIN */}
          {view === "login" && (
            <div className="ax-form-body">
              {locked ? (
                <div className="ax-lockout">
                  <div className="ax-lockout-icon"><IconWarn /></div>
                  <div className="ax-lockout-title">Account Locked</div>
                  <p className="ax-lockout-msg">Too many failed attempts. Please wait before trying again.</p>
                  <div className="ax-lockout-timer">{formatTimer(lockTimer)}</div>
                </div>
              ) : (<>
                <div className="ax-form-header">
                  <div className="ax-form-title">Sign in</div>
                  <div className="ax-form-subtitle">Use your registered credentials to continue.</div>
                </div>

                {message && (
                  <div className={`ax-alert ax-alert-${msgType}`}>
                    <span className="ax-alert-icon">{msgType === "success" ? <IconCheck /> : <IconWarn />}</span>
                    <span>{message}</span>
                  </div>
                )}

                {attempts > 0 && (
                  <div className="ax-attempts-row">
                    {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                      <div key={i} className={`ax-dot${i < attempts ? " ax-dot-used" : ""}`} />
                    ))}
                    <span className="ax-attempts-label">
                      {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} remaining
                    </span>
                  </div>
                )}

                <div className="ax-field">
                  <div className="ax-field-top"><label htmlFor="loginId">Username or Email</label></div>
                  <div className="ax-input-wrap">
                    <span className="ax-ico"><IconUser /></span>
                    <input id="loginId" type="text" placeholder="username or email"
                      value={identifier} onChange={(e: ChangeEvent<HTMLInputElement>) => setIdentifier(e.target.value)}
                      autoComplete="username" spellCheck={false} maxLength={80} />
                  </div>
                </div>

                <div className="ax-field">
                  <div className="ax-field-top">
                    <label htmlFor="loginPass">Password</label>
                    <button
                      className="ax-field-link"
                      type="button"
                      onClick={() => { setView("forgot-password"); setMessage(""); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="ax-input-wrap">
                    <span className="ax-ico"><IconLock /></span>
                    <input id="loginPass" type={loginPassVis ? "text" : "password"} placeholder="Your password"
                      value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      autoComplete="current-password" maxLength={128} />
                    <button className="ax-btn-icon" type="button"
                      onClick={() => setLoginPassVis((v) => !v)} title={loginPassVis ? "Hide" : "Show"}>
                      {loginPassVis ? <IconEyeOpen /> : <IconEyeOff />}
                    </button>
                  </div>
                </div>

                <button className={`ax-btn-submit${loading ? " loading" : ""}`}
                  onClick={handleLogin} disabled={loading} type="button">
                  <span className="ax-btn-sp" />
                  <span className="ax-btn-label">Sign in &rarr;</span>
                </button>

                <div className="ax-form-footer">
                  {/* Divider */}
                  <div className="ax-divider">
                    <span className="ax-divider-line" />
                    <span className="ax-divider-text">or</span>
                    <span className="ax-divider-line" />
                  </div>

                  {/* Google Sign In */}
                  <button className="ax-btn-google" type="button" onClick={handleGoogleSignIn}>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                  Don&rsquo;t have an account?{" "}
                  <button className="ax-link-btn" type="button"
                    onClick={() => { setView("signup"); setMessage(""); setAttempts(0); setPassword(""); setIdentifier(""); }}>
                    Create one
                  </button>
                </div>
              </>)}
            </div>
          )}

          {/* SIGNUP */}
          {view === "signup" && (
            <div className="ax-form-body">
              <div className="ax-form-header">
                <div className="ax-form-title">Create account</div>
                <div className="ax-form-subtitle">Fill in the details below to get started.</div>
              </div>

              {message && (
                <div className={`ax-alert ax-alert-${msgType}`}>
                  <span className="ax-alert-icon">{msgType === "success" ? <IconCheck /> : <IconWarn />}</span>
                  <span>{message}</span>
                </div>
              )}

              <div className="ax-field">
                <div className="ax-field-top"><label htmlFor="suUser">Username</label></div>
                <div className="ax-input-wrap">
                  <span className="ax-ico"><IconAt /></span>
                  <input id="suUser" type="text" placeholder="your_username"
                    value={username} onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                    autoComplete="username" spellCheck={false} maxLength={30} />
                </div>
              </div>

              <div className="ax-field">
                <div className="ax-field-top"><label htmlFor="suEmail">Email Address</label></div>
                <div className="ax-input-wrap">
                  <span className="ax-ico"><IconMail /></span>
                  <input id="suEmail" type="email" placeholder="you@example.com"
                    value={email} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    autoComplete="email" maxLength={80} />
                </div>
              </div>

              <div className="ax-field">
                <div className="ax-field-top"><label htmlFor="suPass">Password</label></div>
                <div className="ax-input-wrap">
                  <span className="ax-ico"><IconLock /></span>
                  <input id="suPass" type={signupPassVis ? "text" : "password"}
                    placeholder="Min. 8 chars, 1 uppercase, 1 symbol"
                    value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    onFocus={() => setPassFocused(true)}
                    autoComplete="off" maxLength={128} />
                  <button className="ax-btn-icon" type="button"
                    onClick={() => setSignupPassVis((v) => !v)} title={signupPassVis ? "Hide" : "Show"}>
                    {signupPassVis ? <IconEyeOpen /> : <IconEyeOff />}
                  </button>
                </div>
                {passFocused && password.length > 0 && (
                  <div className="ax-strength-wrap">
                    {[1, 2, 3, 4].map((bar) => (
                      <div key={bar} className="ax-strength-bar"
                        style={{ background: bar <= strength ? strengthMeta.color : "var(--border)" }} />
                    ))}
                    <span className="ax-strength-label" style={{ color: strengthMeta.color }}>
                      {strengthMeta.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="ax-field">
                <div className="ax-field-top"><label htmlFor="suConf">Confirm Password</label></div>
                <div className="ax-input-wrap">
                  <span className="ax-ico"><IconLock /></span>
                  <input id="suConf" type={confirmPassVis ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={confirm} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                    autoComplete="off" maxLength={128}
                    className={confirm.length > 0 ? (confirm === password ? "ax-input-valid" : "ax-input-invalid") : ""} />
                  <button className="ax-btn-icon" type="button"
                    onClick={() => setConfirmPassVis((v) => !v)} title={confirmPassVis ? "Hide" : "Show"}>
                    {confirmPassVis ? <IconEyeOpen /> : <IconEyeOff />}
                  </button>
                </div>
                {confirm.length > 0 && confirm !== password && (
                  <div className="ax-field-hint ax-field-hint-error">Passwords do not match.</div>
                )}
                {confirm.length > 0 && confirm === password && (
                  <div className="ax-field-hint ax-field-hint-ok">Passwords match.</div>
                )}
              </div>



              <button className={`ax-btn-submit${loading ? " loading" : ""}`}
                onClick={handleSignup} disabled={loading} type="button">
                <span className="ax-btn-sp" />
                <span className="ax-btn-label">Create Account &rarr;</span>
              </button>

                                {/* Divider */}
              <div className="ax-divider">
                <span className="ax-divider-line" />
                <span className="ax-divider-text">or</span>
                <span className="ax-divider-line" />
              </div>

                  {/* Google Sign In */}
              <button className="ax-btn-google" type="button" onClick={handleGoogleSignIn}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="ax-form-footer">
                Already have an account?{" "}
                <button className="ax-link-btn" type="button"
                  onClick={() => { setView("login"); setMessage(""); setPassword(""); setEmail(""); setUsername(""); setConfirm(""); }}>
                  Sign in
                </button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {view === "forgot-password" && (
            <div className="ax-form-body">
              <div className="ax-form-header">
                <div className="ax-form-title">Reset Password</div>
                <div className="ax-form-subtitle">Enter your email to receive a reset link.</div>
              </div>

              {message && (
                <div className={`ax-alert ax-alert-${msgType}`}>
                  <span className="ax-alert-icon">{msgType === "success" ? <IconCheck /> : <IconWarn />}</span>
                  <span>{message}</span>
                </div>
              )}

              <div className="ax-field">
                <div className="ax-field-top"><label htmlFor="forgotEmail">Email Address</label></div>
                <div className="ax-input-wrap">
                  <span className="ax-ico"><IconMail /></span>
                  <input
                    id="forgotEmail"
                    type="email"
                    placeholder="you@example.com"
                    value={identifier}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setIdentifier(e.target.value)}
                    autoComplete="email"
                    maxLength={80}
                  />
                </div>
              </div>

              <button
                className={`ax-btn-submit${loading ? " loading" : ""}`}
                onClick={handleForgotPassword}
                disabled={loading}
                type="button"
              >
                <span className="ax-btn-sp" />
                <span className="ax-btn-label">Send Reset Link &rarr;</span>
              </button>

              <div className="ax-form-footer">
                Remember your password?{" "}
                <button
                  className="ax-link-btn"
                  type="button"
                  onClick={() => { setView("login"); setMessage(""); setIdentifier(""); }}
                >
                  Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* VERIFY */}
          {view === "verify" && (
            <div className="ax-form-body">
              <div className="ax-form-header">
                <div className="ax-form-title">Verify your account</div>
                <div className="ax-form-subtitle">Enter the 8-digit code sent to your email.</div>
              </div>

              {message && (
                <div className={`ax-alert ax-alert-${msgType}`}>
                  <span className="ax-alert-icon">{msgType === "success" ? <IconCheck /> : <IconWarn />}</span>
                  <span>{message}</span>
                </div>
              )}

              <div className="ax-pin-row">
                {pin.map((digit, index) => (
                  <input key={index} type="text" inputMode="numeric" maxLength={1}
                    value={digit} data-pin-index={index}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    onPaste={index === 0 ? handlePinPaste : undefined}
                    className={`ax-pin-input${digit ? " ax-pin-filled" : ""}`}
                    autoFocus={index === 0} />
                ))}
              </div>

              <p className="ax-pin-hint">Digits only &mdash; you can paste the full code.</p>

              <button className={`ax-btn-submit${loading ? " loading" : ""}`}
                onClick={handleVerify} disabled={loading} type="button">
                <span className="ax-btn-sp" />
                <span className="ax-btn-label">Verify &rarr;</span>
              </button>

              <div className="ax-form-footer">
                Didn&rsquo;t receive a code?{" "}
                <button className="ax-link-btn" type="button"
                  onClick={() => showMsg("Verification code resent!", "success")}>
                  Resend code
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}