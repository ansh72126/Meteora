"use client";

import './page.css';
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/welcome");
        return;
      }

      sessionStorage.setItem("auth", "true");
      sessionStorage.removeItem("fileUploaded");
      setChecking(false);

      window.addEventListener("popstate", () => {
        history.pushState(null, "", window.location.href);
      });
    };

    run();
  }, []);

  if (checking) return null;

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload CSV file only");
      return;
    }

    setSelectedFile(file);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        alert("Your session has expired. Please sign in again.");
        router.replace("/welcome");
        setUploading(false);
        return;
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload/`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      console.log(`Uploaded: ${data.rows} rows, ${data.columns.length} columns`);
      sessionStorage.setItem("csvHeaders", JSON.stringify(data.columns ?? []));
      sessionStorage.setItem("csvColumnTypes", JSON.stringify(data.column_types ?? {}));
      sessionStorage.setItem("csvNumericHeaders", JSON.stringify(data.numeric_columns ?? []));
      sessionStorage.setItem("csvCategoricalHeaders", JSON.stringify(data.categorical_columns ?? []));
      sessionStorage.removeItem("csvUploadId");
    } catch (error) {
      alert("Error uploading file");
      console.error(error);
      setUploading(false);
      return;
    }
    document.cookie = "csv_uploaded=1; path=/";
    setUploading(false);
    setUploadDone(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  return (
    <>
      <div className="upload-page">

        {/* Ambient background blobs */}
        <div className="upload-bg-blob upload-bg-blob--1" />
        <div className="upload-bg-blob upload-bg-blob--2" />

        {/* Dot grid */}
        <div className="upload-dot-grid" />

        {/* Logo — top left */}
        <div className="upload-logo">
          <img src="/landing/only-logo.png" alt="Meteora" className="upload-logo-img" />
        </div>

        {/* Centered card */}
        <main className="upload-main">
          <div className="upload-card">

            {/* Top glow edge */}
            <div className="upload-card-glow" />

            <h1 className="upload-title">Upload Dataset</h1>
            <p className="upload-subtitle">Drop a CSV file to begin your analysis</p>

            {/* Drop zone */}
            <div
              className={`upload-zone ${isDragging ? "upload-zone--drag" : ""} ${uploadDone ? "upload-zone--done" : ""}`}
              onClick={() => !uploadDone && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Upload icon — SVG, no emoji */}
              <svg className="upload-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {uploadDone
                  ? <><polyline points="20 6 9 17 4 12" /></>
                  : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>
                }
              </svg>

              {uploadDone ? (
                <p className="upload-zone-text upload-zone-text--done">Dataset ready</p>
              ) : (
                <p className="upload-zone-text">
                  Drag & drop your file or <span>click to browse</span>
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
            </div>

            {/* File name display */}
            {selectedFile && (
              <div className={`upload-file-info ${uploadDone ? "upload-file-info--done" : ""}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="upload-file-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="upload-file-name">{selectedFile.name}</span>
                {uploadDone && <span className="upload-file-badge">Uploaded</span>}
              </div>
            )}

            {/* Upload button */}
            <button
              className={`upload-btn ${uploading ? "upload-btn--loading" : ""} ${uploadDone ? "upload-btn--done" : ""}`}
              disabled={!selectedFile || uploading || uploadDone}
              onClick={() => selectedFile && !uploadDone && handleFile(selectedFile)}
            >
              {uploading ? (
                <>
                  <span className="upload-btn-spinner" />
                  Processing...
                </>
              ) : uploadDone ? (
                "Dataset Uploaded"
              ) : (
                "Upload Dataset"
              )}
            </button>

            <p className="upload-helper">Supported format: CSV</p>


          </div>
        </main>
      </div>

      {/* Dashboard FAB */}
      <button
        className={`proceed-fab ${uploadDone ? "proceed-fab--visible" : ""}`}
        disabled={!uploadDone}
        onClick={() => {
          if (uploadDone) {
            sessionStorage.setItem("fileUploaded", "true");
            router.push("/dashboard/home");
          }
        }}
      >
        <span className="proceed-fab__label">Dashboard</span>
        <svg className="proceed-fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </>
  );
}