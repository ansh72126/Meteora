"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import DeleteAccountDialog from "../../components/DeleteAccountDialog";
import React from 'react';
import dynamic from 'next/dynamic';
import { logoutWithCleanup } from "../../../lib/logout";
import { supabase } from "../../../lib/supabase";
import './page.css';

// Lazy-load the chart so it only runs client-side (Recharts requires window)
const HeroChart = dynamic(() => import('./HeroChart'), { ssr: false });

const GraphVisualizer: React.FC = () => {

  const router = useRouter();   // ← single top-level call
  const [userName, setUserName] = useState("User");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("user@example.com");
  const [checking, setChecking] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const userMenuOpenRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const uploaded = sessionStorage.getItem("fileUploaded");

      if (!data.session) {
        router.replace("/welcome");
      } else if (!uploaded) {
        router.replace("/dashboard/upload");
      } else {
        setChecking(false);
      }
    };

    run();
  }, [router]);


  const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="social-icon-svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );

  const LinkedInIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="social-icon-svg">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );

  const MailIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="social-icon-svg">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );

  const year = new Date().getFullYear();

  useEffect(() => {
    const mainContent = document.querySelector(".hero-title");
    if (!mainContent) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          document.querySelector(".header")?.classList.add("header-hidden");
        } else {
          document.querySelector(".header")?.classList.remove("header-hidden");
        }
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" }
    );
    observer.observe(mainContent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    userMenuOpenRef.current = userMenuOpen;
  }, [userMenuOpen]);
  
  // Scroll listener — uses ref, never re-attaches
  useEffect(() => {
    const fn = () => {
      if (userMenuOpenRef.current) setUserMenuOpen(false);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    const storedEmail = localStorage.getItem("email");
    if (storedUsername) setUserName(storedUsername);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  if (checking) return null;

  const handleLogout = async () => {
    await logoutWithCleanup();
    router.push("/welcome");
    router.refresh();
  };

  // ── CHART DATA ─────────────────────────────────────────────────
  const distributionShapeCharts = [
    { title: 'Histogram', image: 'https://quickchart.io/chart?c={type:%27bar%27,data:{labels:[%2710-20%27,%2720-30%27,%2730-40%27,%2740-50%27,%2750-60%27,%2760-70%27],datasets:[{label:%27Frequency%27,data:[8,15,23,18,12,6],backgroundColor:%27%232196F3%27,borderColor:%27%2364B5F6%27,borderWidth:1,barPercentage:1,categoryPercentage:1}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{display:false},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'histogram' },
    { title: 'KDE Plot', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[0,1,2,3,4,5,6,7,8,9,10],datasets:[{label:%27Density%27,data:[0.5,2,5,9,12,15,12,9,5,2,0.5],borderColor:%27%239C27B0%27,backgroundColor:%27rgba(156,39,176,0.3)%27,fill:true,tension:0.4,pointRadius:0}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'kde' },
    { title: 'Bell Curve', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[-3,-2.5,-2,-1.5,-1,-0.5,0,0.5,1,1.5,2,2.5,3],datasets:[{label:%27Normal%20Distribution%27,data:[0.4,1.8,5,9.2,15,19.5,20,19.5,15,9.2,5,1.8,0.4],borderColor:%27%2300BCD4%27,backgroundColor:%27rgba(0,188,212,0.3)%27,fill:true,tension:0.4,pointRadius:0}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'bell' },
    { title: 'ECDF Plot', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[0,1,2,3,4,5,6],datasets:[{label:%27ECDF%27,data:[0,0.15,0.35,0.55,0.75,0.9,1],borderColor:%27%23607D8B%27,backgroundColor:%27rgba(96,125,139,0.1)%27,fill:true,stepped:true,pointRadius:3,pointBackgroundColor:%27%23607D8B%27}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:1,grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'ecdf' },
  ];

  const summarySpreadCharts = [
    { title: 'Bar Chart', image: 'https://quickchart.io/chart?c={type:%27bar%27,data:{labels:[%27Category%20A%27,%27Category%20B%27,%27Category%20C%27,%27Category%20D%27],datasets:[{label:%27Values%27,data:[42,65,38,75],backgroundColor:[%27%23FF6B35%27,%27%23F7931E%27,%27%234CAF50%27,%27%232196F3%27]}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{display:false},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'barchart' },
    { title: 'Box Plot', image: 'https://quickchart.io/chart?c={type:%27boxplot%27,data:{labels:[%27Dataset%27],datasets:[{label:%27Values%27,data:[[25,35,50,65,85]],backgroundColor:%27rgba(33,150,243,0.5)%27,borderColor:%27%232196F3%27,borderWidth:2,outlierBackgroundColor:%27%23E91E63%27,outlierBorderColor:%27%23E91E63%27}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'boxplot' },
    { title: 'Pie Chart', image: 'https://quickchart.io/chart?c={type:%27doughnut%27,data:{labels:[%27Category%20A%27,%27Category%20B%27,%27Category%20C%27,%27Category%20D%27],datasets:[{data:[30,25,20,25],backgroundColor:[%27%23FFD54F%27,%27%23FF9800%27,%27%23E91E63%27,%27%232196F3%27],borderWidth:0}]},options:{plugins:{legend:{display:false}},cutout:%2740%25%27}}&backgroundColor=transparent&width=200&height=150', plotKey: 'piechart' },
  ];

  const bivariateCharts = [
    { title: 'Line Chart', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[%27Jan%27,%27Feb%27,%27Mar%27,%27Apr%27,%27May%27,%27Jun%27],datasets:[{label:%27Series%27,data:[30,45,35,50,40,60],borderColor:%27%232196F3%27,backgroundColor:%27transparent%27,tension:0.3,pointRadius:4,pointBackgroundColor:%27%232196F3%27}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'linechart' },
    { title: 'Scatter Plot', image: 'https://quickchart.io/chart?c={type:%27scatter%27,data:{datasets:[{label:%27Data%27,data:[{x:10,y:15},{x:20,y:25},{x:30,y:22},{x:40,y:35},{x:50,y:42},{x:60,y:48},{x:70,y:55}],backgroundColor:%27%232196F3%27,borderColor:%27%232196F3%27,pointRadius:5}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'scatterplot' },
    { title: 'Joint Plot (Scatter + Marginals)', image: 'https://media.geeksforgeeks.org/wp-content/uploads/20200716185758/Screenshot367.png', plotKey: 'jointplot' },
  ];

  const multivariateCharts = [
    { title: 'Pair Plot', image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240208155942/pairplot1.webp', plotKey: 'pairplot' },
    { title: 'Cluster Scatter Plot (K-Means)', image: 'https://quickchart.io/chart?c={type:%27scatter%27,data:{datasets:[{label:%27Cluster%201%27,data:[{x:10,y:15},{x:12,y:18},{x:15,y:20}],backgroundColor:%27%23FF6B35%27,pointRadius:6},{label:%27Cluster%202%27,data:[{x:40,y:45},{x:42,y:48},{x:45,y:50}],backgroundColor:%27%232196F3%27,pointRadius:6},{label:%27Cluster%203%27,data:[{x:70,y:25},{x:72,y:28},{x:75,y:30}],backgroundColor:%27%239C27B0%27,pointRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'clusterplot' },
    { title: 'Heatmap (Correlation Matrix)', image: 'https://media.geeksforgeeks.org/wp-content/uploads/20250521114815574591/download.png', plotKey: 'heatmap' },
  ];

  const timeSeriesCharts = [
    { title: 'Time Series Plot', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[%27Jan%27,%27Feb%27,%27Mar%27,%27Apr%27,%27May%27,%27Jun%27,%27Jul%27,%27Aug%27],datasets:[{label:%27Stock%20Price%27,data:[120,135,125,145,155,148,160,158],borderColor:%27%232196F3%27,backgroundColor:%27transparent%27,tension:0.3,pointRadius:3,pointBackgroundColor:%27%232196F3%27}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'timeseries' },
    { title: 'Rolling Mean Plot', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[1,2,3,4,5,6,7,8,9,10],datasets:[{label:%27Original%27,data:[45,52,48,55,50,58,54,60,56,62],borderColor:%27%23ccc%27,backgroundColor:%27transparent%27,borderDash:[5,5],pointRadius:2},{label:%27Rolling%20Mean%27,data:[45,48.5,48.3,51.7,51,54.3,54,57.3,56.7,59.3],borderColor:%27%23FF9800%27,backgroundColor:%27rgba(255,152,0,0.1)%27,fill:true,tension:0.4,pointRadius:3}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}},x:{grid:{color:%27%23333%27},ticks:{color:%27%23999%27}}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'rollingmean' },
    { title: 'Area Chart', image: 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[%27Week%201%27,%27Week%202%27,%27Week%203%27,%27Week%204%27,%27Week%205%27],datasets:[{data:[20,35,45,38,50],backgroundColor:[%27%23E91E63%27,%27%23FF9800%27,%27%23FFD54F%27,%27%234CAF50%27,%27%232196F3%27],fill:true,borderWidth:0}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{display:false},ticks:{color:%27%23999%27}},x:{grid:{display:false},ticks:{color:%27%23999%27}}},elements:{line:{tension:0.4}}}}&backgroundColor=transparent&width=200&height=150', plotKey: 'area' },
  ];

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="graph-visualizer">
      <header className="header">
        <nav className="navbar">
          <div className="logo">
            <img src="/landing/only-logo.png" alt="Meteora" className="logo-img" onClick={() => router.replace("/")} style={{ cursor: "pointer" }}/>
          </div>

          <ul className="nav-menu">
            <li className="nav-item" onClick={() => scrollToSection("univariate")}>Univariate</li>
            <div className="nav-divider" />
            <li className="nav-item" onClick={() => scrollToSection("bivariate")}>Bivariate</li>
            <div className="nav-divider" />
            <li className="nav-item" onClick={() => scrollToSection("multivariate")}>Multivariate</li>
            <div className="nav-divider" />
            <li className="nav-item" onClick={() => scrollToSection("time-series")}>Time-Series</li>
            {/* <div className="nav-divider" />
            <li className="nav-item">Documentation</li> */}
          </ul>

          <div className="desktop-user-section">
            <div className="user-dropdown">
              <button
                className={`user-trigger ${userMenuOpen ? "open" : ""}`}
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
              >
                <span className="user-avatar">{userName.charAt(0).toUpperCase()}</span>
                <div className="user-trigger-info">
                  <span className="user-name">{userName}</span>
                </div>
                <ChevronDownIcon className={`dropdown-icon ${userMenuOpen ? "rotated" : ""}`} />
              </button>

              {userMenuOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setUserMenuOpen(false)} />
                  <div className="dropdown-menu">
                    <div className="dropdown-header">
                      <div className="dropdown-avatar">{userName.charAt(0).toUpperCase()}</div>
                      <div className="dropdown-user-info">
                        <p className="dropdown-name">{userName}</p>
                        <p className="dropdown-email">{userEmail}</p>
                      </div>
                      <div className="dropdown-status-dot" />
                    </div>
                    <div className="dropdown-divider" />
                    <div className="dropdown-actions">
                      <button className="upload-new-btn" onClick={() => {
                        sessionStorage.removeItem("fileUploaded");
                        router.push("/dashboard/upload");
                      }}>
                        <svg className="upload-new-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <span>Upload New Dataset</span>
                      </button>
                    </div>
                    <div className="dropdown-actions">
                      <button className="delete-btn" onClick={() => { setDeleteOpen(true); setUserMenuOpen(false); }}>
                        <svg className="delete-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                        </svg>
                        <span>Delete Account</span>
                      </button>
                    </div>

                    <div className="dropdown-divider" style={{ margin: "4px 0" }} />
                    <div className="dropdown-actions">
                      <button className="logout-btn" onClick={handleLogout}>
                        <svg className="logout-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">EXPLORE DATA LIKE<br />NEVER BEFORE</h1>
          <p className="hero-subtitle">Interactive & Powerful Visualizations</p>
        </div>
        <div className="hero-visual">
          <div className="hero-chart-container">
            <HeroChart />
          </div>
        </div>
      </section>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="main-content">

        <section id="univariate" className="chart-section">
          <h2 className="section-title">UNIVARIATE - DISTRIBUTION & SHAPE</h2>
          <div className="chart-grid">
            {distributionShapeCharts.map((chart, index) => (
              <div key={index} className="chart-card" onClick={() => router.push(`/dashboard/univariate/${chart.plotKey}`)} style={{ cursor: "pointer" }}>
                <div className="chart-image-wrapper"><img src={chart.image} alt={chart.title} className="chart-image" /></div>
                <h3 className="chart-title">{chart.title}</h3>
              </div>
            ))}
          </div>
        </section>

        <section className="chart-section">
          <h2 className="section-title">UNIVARIATE - SUMMARY & SPREAD</h2>
          <div className="chart-grid">
            {summarySpreadCharts.map((chart, index) => (
              <div key={index} className="chart-card" onClick={() => router.push(`/dashboard/univariate/${chart.plotKey}`)} style={{ cursor: "pointer" }}>
                <div className="chart-image-wrapper"><img src={chart.image} alt={chart.title} className="chart-image" /></div>
                <h3 className="chart-title">{chart.title}</h3>
              </div>
            ))}
          </div>
        </section>

        <section id="bivariate" className="chart-section">
          <h2 className="section-title">BIVARIATE - TWO VARIABLE RELATIONSHIPS</h2>
          <div className="chart-grid">
            {bivariateCharts.map((chart, index) => (
              <div key={index} className="chart-card" onClick={() => router.push(`/dashboard/bivariate/${chart.plotKey}`)} style={{ cursor: "pointer" }}>
                <div className="chart-image-wrapper"><img src={chart.image} alt={chart.title} className="chart-image" /></div>
                <h3 className="chart-title">{chart.title}</h3>
              </div>
            ))}
          </div>
        </section>

        <section id="multivariate" className="chart-section">
          <h2 className="section-title">MULTIVARIATE - 3+ VARIABLES</h2>
          <div className="chart-grid">
            {multivariateCharts.map((chart, index) => (
              <div key={index} className="chart-card" onClick={() => router.push(`/dashboard/multivariate/${chart.plotKey}`)} style={{ cursor: "pointer" }}>
                <div className="chart-image-wrapper"><img src={chart.image} alt={chart.title} className="chart-image" /></div>
                <h3 className="chart-title">{chart.title}</h3>
              </div>
            ))}
          </div>
        </section>

        <section id="time-series" className="chart-section">
          <h2 className="section-title">TIME-SERIES & SEQUENTIAL</h2>
          <div className="chart-grid">
            {timeSeriesCharts.map((chart, index) => (
              <div key={index} className="chart-card" onClick={() => router.push(`/dashboard/timeseries/${chart.plotKey}`)} style={{ cursor: "pointer" }}>
                <div className="chart-image-wrapper"><img src={chart.image} alt={chart.title} className="chart-image" /></div>
                <h3 className="chart-title">{chart.title}</h3>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="footer-dot-strip" />
        <div className="footer-inner">
          <div className="footer-left">
          <img src="/landing/full-logo.png" alt="Meteora" className="footer-left-img" />
          </div>
          <div className="footer-center">
            <a href="https://github.com/ansh72126" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="GitHub"><GitHubIcon /></a>
            <a href="https://www.linkedin.com/in/ansh72126/" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="LinkedIn"><LinkedInIcon /></a>
            <a href="mailto:ansh72126@gmail.com" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="Mail"><MailIcon /></a> 
          </div>
          <div className="footer-right">
            <p className="footer-copy">&copy; {year} Meteora.</p>
          </div>
        </div>
      </footer>
      <DeleteAccountDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setIsDeleting(true);

          const email = localStorage.getItem("email");

          const res = await fetch("/api/auth/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          const data = await res.json();
          setIsDeleting(false);

          if (data.error) {
            // optionally show an error toast
            console.error(data.error);
            return;
          }

          // clear everything and redirect
          sessionStorage.clear();
          localStorage.clear();
          setDeleteOpen(false);
          router.replace("/welcome");
        }}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default GraphVisualizer;