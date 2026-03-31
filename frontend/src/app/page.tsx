"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import "./page.css";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconArrowUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
);
const IconArrowRight = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);
const IconUploadCloud = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);
const IconSliders = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);
const IconSigma = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 4H6l6 8-6 8h12" /></svg>
);
const IconBarChart = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);
const IconZap = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
);
const IconDownload = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconShield = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
);
const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IconClose = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconDiamond = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10z" /></svg>
);
const IconGithub = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);
const IconLinkedIn = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
const IconMail = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
);

const TW_WORDS = ["patterns.", "signals.", "trends.", "anomalies.", "correlations.", "story."];

const PAIN_POINTS = [
  { num: "01", title: "Too much setup", desc: "Most tools demand a local Python environment, five libraries, and a Jupyter notebook before you can see a single chart." },
  { num: "02", title: "Too fragmented", desc: "One tool for charts, another for statistics, another to export. Context-switching destroys your analytical flow." },
  { num: "03", title: "Too shallow", desc: "No-code tools look clean but skip the depth. No inference, no correlation, no real statistical insight." },
];

const STEPS = [
  { Icon: IconUploadCloud, num: "01", title: "Upload Your Dataset", desc: "Drag and drop a CSV file. Column headers are parsed instantly — no configuration, no schema definition required." },
  { Icon: IconSliders, num: "02", title: "Configure Your Chart", desc: "Select an analysis type, choose your columns, and tune every visual parameter — palette, scale, clipping, theme." },
  { Icon: IconSigma, num: "03", title: "Explore and Analyse", desc: "Generate the chart, open the inference panel. Correlations, regression metrics, distribution shape — all in one view." },
];

const FEATURES = [
  { Icon: IconBarChart, title: "15+ Chart Types", desc: "Every chart type your exploration demands — distribution curves, scatter relationships, cluster maps, time-series — organised by analytical dimension." },
  { Icon: IconSigma, title: "Deep Statistical Inference", desc: "Correlation matrices, regression R², skewness, kurtosis, outlier detection and class separability — computed on demand, no code required." },
  { Icon: IconSliders, title: "Full Visual Control", desc: "Axis scaling, colour palettes, percentile clipping, marker size, dark and light themes. Every parameter exposed and adjustable." },
  { Icon: IconZap, title: "Instant Rendering", desc: "Server-side chart generation returns in seconds. No client-side lag, no intermediate steps — just your chart, exactly as configured." },
  { Icon: IconDownload, title: "One-Click Export", desc: "Download any chart at full resolution as a PNG. Ready for reports, presentations, or publication." },
  { Icon: IconShield, title: "Secure by Default", desc: "Email verification, login lockout protection, and session-guarded routes. Your data and account are protected at every step." },
];

export default function MeteoraLanding() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [twText, setTwText] = useState("");
  const [cursorPos, setCursorPos] = useState({ x: -2000, y: -2000 });
  const [showcaseVals, setShowcaseVals] = useState({ leftTX: "-105%", leftOp: 0, rightTX: "105%", rightOp: 0 });
  const [leftPinned, setLeftPinned] = useState(false);
  const [rightPinned, setRightPinned] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const showcaseRef = useRef<HTMLElement>(null);
  const twRef = useRef({ wordIdx: 0, charIdx: 0, deleting: false });
  const twTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", fn, { passive: true });
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const tick = () => {
      const s = twRef.current;
      const word = TW_WORDS[s.wordIdx];
      if (!s.deleting) {
        s.charIdx++;
        setTwText(word.slice(0, s.charIdx));
        if (s.charIdx === word.length) { s.deleting = true; twTimer.current = setTimeout(tick, 2000); }
        else twTimer.current = setTimeout(tick, 110);
      } else {
        s.charIdx--;
        setTwText(word.slice(0, s.charIdx));
        if (s.charIdx === 0) { s.deleting = false; s.wordIdx = (s.wordIdx + 1) % TW_WORDS.length; twTimer.current = setTimeout(tick, 350); }
        else twTimer.current = setTimeout(tick, 38);
      }
    };
    twTimer.current = setTimeout(tick, 1600);
    return () => { if (twTimer.current) clearTimeout(twTimer.current); };
  }, []);

  useEffect(() => {
    let rafId: number;
    const fn = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!showcaseRef.current) return;
        const rect = showcaseRef.current.getBoundingClientRect();
        const scrollable = showcaseRef.current.offsetHeight - window.innerHeight;
        if (scrollable <= 0) return;

        const earlyStart = window.innerHeight;
        const p = Math.max(0, Math.min(1,
          (-rect.top + earlyStart) / (scrollable + earlyStart)
        ));

        const lOp = Math.min(1, Math.max(0, (p - 0.0) / 0.35));
        const rOp = Math.min(1, Math.max(0, (p - 0.35) / 0.30));

        setLeftPinned(prev => prev || lOp >= 0.98);
        setRightPinned(prev => prev || rOp >= 0.98);

        setShowcaseVals({
          leftTX: `${-105 + lOp * 75}%`,
          leftOp: lOp,
          rightTX: `${105 - rOp * 75}%`,
          rightOp: rOp,
        });
      });
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => { window.removeEventListener("scroll", fn); cancelAnimationFrame(rafId); };
  }, []);

  useEffect(() => {
    let heroVis = true, footVis = false;
    const update = () => setShowScrollTop(!heroVis && !footVis);
    const hObs = new IntersectionObserver(([e]) => { heroVis = e.isIntersecting; update(); }, { threshold: 0.05 });
    const fObs = new IntersectionObserver(([e]) => { footVis = e.isIntersecting; update(); }, { threshold: 0.05 });
    if (heroRef.current) hObs.observe(heroRef.current);
    if (footerRef.current) fObs.observe(footerRef.current);
    return () => { hObs.disconnect(); fObs.disconnect(); };
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const handleGetStarted = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/welcome");
      return;
    }

    const uploaded = sessionStorage.getItem("fileUploaded");
    router.push(uploaded ? "/dashboard/home" : "/dashboard/upload");
  };

  const scrollTo = (id: string) => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  const year = new Date().getFullYear();

  return (
    <div className="mtr">
      <div className="mtr-cursor-glow" style={{ left: cursorPos.x, top: cursorPos.y }} />

      {/* NAVBAR */}
      <nav className={`mtr-nav ${scrolled ? "mtr-nav--glass" : ""}`}>
        <div className="mtr-nav__inner">
          <button className="mtr-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <img src="/landing/meteora-cut-removebg-preview.png" alt="Meteora" className="mtr-nav__logo-img" />
          </button>
          <ul className="mtr-nav__links">
            {[["Features", "features"], ["How It Works", "process"], ["Studio", "showcase"]].map(([lbl, id]) => (
              <li key={id}><button className="mtr-nav__link" onClick={() => scrollTo(id!)}>{lbl}</button></li>
            ))}
          </ul>
          <div className="mtr-nav__actions">
            <button className="mtr-nav__cta" onClick={handleGetStarted}>Get Started <IconArrowRight /></button>
          </div>
          <button className="mtr-nav__burger" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
        <div className={`mtr-nav__mobile ${menuOpen ? "mtr-nav__mobile--open" : ""}`}>
          {[["Features", "features"], ["How It Works", "process"], ["Studio", "showcase"]].map(([lbl, id]) => (
            <button key={id} className="mtr-nav__mob-link" onClick={() => scrollTo(id!)}>{lbl}</button>
          ))}
          <button className="mtr-nav__mob-cta" onClick={handleGetStarted}>Get Started</button>
        </div>
      </nav>

      {/* HERO */}
      <section ref={heroRef} id="hero" className="mtr-hero">
        <div className="mtr-dots" />
        <div className="mtr-hero__glow" />
        <div className="mtr-hero__glow mtr-hero__glow--r" />

        <div className="mtr-hero__body">
          <div className="mtr-pill mtr-pill--live reveal">
            <span className="mtr-pill__dot" />DATA VISUALISATION STUDIO
          </div>
          <h1 className="mtr-hero__h1 reveal reveal--d1">
            Your data reveals<br className="mtr-hero__br" /> its{" "}
            <span className="mtr-hero__tw">
              <span className="mtr-hero__tw-word">{twText}</span>
              <span className="mtr-hero__cursor" />
            </span>
          </h1>
          <p className="mtr-hero__sub reveal reveal--d2">
            Upload a CSV once. Generate charts, run statistical inference,
            and uncover patterns&nbsp;&mdash; no code, no setup, no noise.
          </p>
          <div className="mtr-hero__btns reveal reveal--d3">
            <button className="mtr-btn mtr-btn--primary" onClick={handleGetStarted}>
              Start Exploring <IconArrowRight />
            </button>
            <button className="mtr-btn mtr-btn--ghost" onClick={() => scrollTo("process")}>
              See How It Works
            </button>
          </div>
        </div>

        <div className="mtr-stats reveal reveal--d4">
          {[
            { num: "15+", lbl: "Chart Types" },
            { num: "Σ", lbl: "Statistical Inference" },
            { num: "∞", lbl: "Datasets" },
            { num: "1", lbl: "Click to Upload" },
          ].map((s, i) => (
            <div key={s.lbl} className="mtr-stat-group">
              {i > 0 && <div className="mtr-stats__div" />}
              <div className="mtr-stat">
                <span className="mtr-stat__num">{s.num}</span>
                <span className="mtr-stat__lbl">{s.lbl}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Scroll indicator — inside hero, absolutely positioned */}
        <div className="mtr-hero__scroll">
          <div className="mtr-hero__scroll-track">
            <div className="mtr-hero__scroll-dot" />
          </div>
          <span>scroll</span>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="mtr-problem">
        <div className="mtr-break__grid mtr-break__grid--subtle" />
        <div className="mtr-problem__inner">
          <span className="mtr-pill mtr-pill--section reveal">THE PROBLEM</span>
          <h2 className="mtr-section-h reveal reveal--d1">Why most EDA tools<br /><em className="mtr-em">fail you</em></h2>
          <p className="mtr-section-sub mtr-section-sub--center reveal reveal--d2">
            Existing tools force you to choose between simplicity and depth. Meteora doesn&rsquo;t make you choose.
          </p>
          <div className="mtr-pain-grid">
            {PAIN_POINTS.map((p, i) => (
              <div key={i} className={`mtr-pain reveal reveal--d${i + 1}`}>
                <span className="mtr-pain__num">{p.num}</span>
                <h3 className="mtr-pain__title">{p.title}</h3>
                <p className="mtr-pain__desc">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="mtr-problem__closer reveal reveal--d3">
            Meteora does all of it in one place.{" "}<em className="mtr-em">Upload once, explore everything.</em>
          </p>
        </div>
      </section>

      {/* SHOWCASE */}
      <section ref={showcaseRef} id="showcase" className="mtr-showcase">
        <div className="mtr-showcase__sticky">
          <div className="mtr-dots mtr-dots--dim" />
          <div className="mtr-showcase__hdr">
            <span className="mtr-pill mtr-pill--section">THE STUDIO</span>
            <h2 className="mtr-section-h">Everything at your<br /><em className="mtr-em">fingertips</em></h2>
            <p className="mtr-section-sub mtr-section-sub--center">From raw numbers to deep statistical insight — all in one place.</p>
          </div>

          <div className="mtr-showcase__screens">
            <div className="mtr-showcase__screen"
              style={{ transform: leftPinned ? "translateX(-30%)" : `translateX(${showcaseVals.leftTX})`, opacity: leftPinned ? 1 : showcaseVals.leftOp }}>
              <div className="mtr-shine-wrap">
                <div className="mtr-screen">
                  <img src="/landing/dashboard.png" alt="Meteora stat page" />
                </div>
              </div>
              <div className="mtr-showcase__label">
                <span className="mtr-pill mtr-pill--sm">DASHBOARD</span>
                <p>All chart types, organised by analytical dimension</p>
              </div>
            </div>

            <div className="mtr-showcase__screen mtr-showcase__screen--r"
              style={{ transform: rightPinned ? "translateX(30%)" : `translateX(${showcaseVals.rightTX})`, opacity: rightPinned ? 1 : showcaseVals.rightOp }}>
              <div className="mtr-shine-wrap">
                <div className="mtr-screen">
                  <img src="/landing/plot.png" alt="Meteora plot page" />
                </div>
              </div>
              <div className="mtr-showcase__label mtr-showcase__label--left">
                <span className="mtr-pill mtr-pill--sm">PLOT STUDIO</span>
                <p>Controls, statistical inference, and PNG export</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="process" className="mtr-process">
        <div className="mtr-dots mtr-dots--dim" />
        <div className="mtr-process__inner">
          <span className="mtr-pill mtr-pill--section reveal">PROCESS</span>
          <h2 className="mtr-section-h reveal reveal--d1">How It <em className="mtr-em">Works</em></h2>
          <div className="mtr-steps">
            <div className="mtr-steps__line" />
            {STEPS.map(({ Icon, num, title, desc }, i) => (
              <div key={i} className={`mtr-step reveal reveal--d${i + 1}`}>
                <div className="mtr-step__top">
                  <div className="mtr-step__icon-wrap">
                    <div className="mtr-step__icon"><Icon /></div>
                    <div className="mtr-step__badge">{num}</div>
                  </div>
                </div>
                <h3 className="mtr-step__title">{title}</h3>
                <p className="mtr-step__desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mtr-features">
        <div className="mtr-break__grid mtr-break__grid--subtle" />
        <div className="mtr-features__inner">
          <span className="mtr-pill mtr-pill--section reveal">CAPABILITIES</span>
          <h2 className="mtr-section-h reveal reveal--d1">Built for<br /><em className="mtr-em">serious analysis</em></h2>
          <p className="mtr-section-sub mtr-section-sub--center reveal reveal--d2">
            Every tool you need to go from raw CSV to publishable insight —
            charts, statistics, and export, all in one studio.
          </p>
          <div className="mtr-feat-grid">
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <div key={i} className={`mtr-feat reveal reveal--d${(i % 3) + 1}`}>
                <div className="mtr-feat__icon-wrap">
                  <div className="mtr-feat__icon"><Icon /></div>
                  <div className="mtr-feat__icon-ring" />
                </div>
                <h3 className="mtr-feat__title">{title}</h3>
                <p className="mtr-feat__desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="mtr-cta">
        <div className="mtr-dots" />
        <div className="mtr-cta__glow" /><div className="mtr-cta__glow mtr-cta__glow--r" />
        <div className="mtr-cta__inner reveal">
          <span className="mtr-pill mtr-pill--section mtr-pill--bright">READY TO START</span>
          <h2 className="mtr-cta__h">Stop wrestling<br />with your data.</h2>
          <p className="mtr-cta__sub">Meteora turns any CSV into a full analytical studio in seconds.</p>
          <button className="mtr-btn mtr-btn--primary mtr-btn--lg" onClick={handleGetStarted}>
            Start Now <IconArrowRight />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer ref={footerRef} className="mtr-footer">
        <div className="mtr-footer__edge" />
        <div className="mtr-footer__inner">
          <div className="mtr-footer__left">
            <div className="mtr-footer__logo">
              <img src="/landing/only-logo.png" alt="Meteora" className="mtr-footer__logo-img" />
            </div>
            <p className="mtr-footer__copy">Made by <strong>Ansh Soni</strong></p>
          </div>
          <div className="mtr-footer__center">
            <a href="https://github.com/ansh72126" target="_blank" rel="noopener noreferrer" className="mtr-footer__soc" aria-label="GitHub"><IconGithub /></a>
            <a href="https://www.linkedin.com/in/ansh72126/" target="_blank" rel="noopener noreferrer" className="mtr-footer__soc" aria-label="LinkedIn"><IconLinkedIn /></a>
            <a href="mailto:ansh72126@gmail.com" className="mtr-footer__soc" aria-label="Email"><IconMail /></a>
          </div>
          <div className="mtr-footer__right">
            <a href="/privacy" className="mtr-footer__privacy">Privacy Policy</a>
            <p className="mtr-footer__made">&copy; {year} Meteora.</p>
          </div>
        </div>
      </footer>

      <button className={`mtr-top ${showScrollTop ? "mtr-top--on" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
        <IconArrowUp />
      </button>
    </div>
  );
}