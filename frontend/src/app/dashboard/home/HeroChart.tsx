"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { useState, useEffect, useRef, useCallback } from "react";

const SERIES = [
  { key: "alpha", color: "#00d4ff", label: "Alpha" },
  { key: "beta", color: "#8b5cf6", label: "Beta" },
  { key: "gamma", color: "#00ffaa", label: "Gamma" },
];


function generatePoint(prev: number, key: string, momentum: any): number {
  // Random momentum shift — occasionally surges or slows
  momentum[key] = momentum[key] * 0.85 + (Math.random() * 4) * 0.15;
  const surge = Math.random() < 0.12 ? Math.random() * 8 : 0;  // 12% chance of burst
  return prev + momentum[key] + surge + (Math.random() * 0.5);
}

const INIT_DATA = Array.from({ length: 20 }, (_, i) => ({
  t: i,
  alpha: 10 + i * 2 + Math.random() * 4,
  beta:  12 + i * 2 + Math.random() * 4,
  gamma: 11 + i * 2 + Math.random() * 4,
}));

const CustomTooltip = ({ active, payload, label, mouseX }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(6, 12, 26, 0.96)",
      border: "1px solid rgba(0,212,255,0.2)",
      borderRadius: 10,
      padding: "10px 14px",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "0.65rem",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      minWidth: 130,
    }}>
      <div style={{ color: "rgba(0,212,255,0.4)", marginBottom: 6, letterSpacing: 1 }}>
        T+{label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <span style={{ color: p.color, letterSpacing: 0.5 }}>{p.dataKey.toUpperCase()}</span>
          <span style={{ color: "#e0eeff", fontWeight: 700 }}>{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

export default function HeroChart() {
  const [data, setData] = useState(INIT_DATA);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [running, setRunning] = useState(true);
  const tickRef = useRef(20);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const momentum = useRef({ alpha: 1.5, beta: 1.5, gamma: 1.5 });

  const tick = useCallback(() => {
    setData(prev => {
      const last = prev[prev.length - 1];
      const next = {
        t: tickRef.current++,
        alpha: generatePoint(last.alpha, 'alpha', momentum.current),
        beta: generatePoint(last.beta, 'beta', momentum.current),
        gamma: generatePoint(last.gamma, 'gamma', momentum.current),
      };
      return [...prev.slice(-28), next];
    });
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 600);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, tick]);

  // current leaders
  const last = data[data.length - 1];
  const sorted = [...SERIES].sort((a, b) => (last[b.key as keyof typeof last] as number) - (last[a.key as keyof typeof last] as number));

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative", userSelect: "none" }}
      onMouseLeave={() => setMouseX(null)}
    >
      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderTop: "1px solid rgba(0,212,255,0.35)", borderLeft: "1px solid rgba(0,212,255,0.35)" },
        { top: 0, right: 0, borderTop: "1px solid rgba(0,212,255,0.35)", borderRight: "1px solid rgba(0,212,255,0.35)" },
        { bottom: 0, left: 0, borderBottom: "1px solid rgba(0,212,255,0.35)", borderLeft: "1px solid rgba(0,212,255,0.35)" },
        { bottom: 0, right: 0, borderBottom: "1px solid rgba(0,212,255,0.35)", borderRight: "1px solid rgba(0,212,255,0.35)" },
      ].map((s, i) => (
        <div key={i} style={{ position: "absolute", width: 18, height: 18, pointerEvents: "none", zIndex: 3, ...s }} />
      ))}

      {/* Live badge + pause */}
      <div style={{
        position: "absolute", top: 10, left: 14, zIndex: 4,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: running ? "#00d4ff" : "#555",
            boxShadow: running ? "0 0 8px #00d4ff" : "none",
            animation: running ? "heroPulse 1.5s ease-in-out infinite" : "none",
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.55rem", letterSpacing: 2,
            color: running ? "rgba(0,212,255,0.6)" : "rgba(120,150,180,0.4)",
            textTransform: "uppercase",
          }}>
            {running ? "Live" : "Paused"}
          </span>
        </div>
        <button
          onClick={() => setRunning(r => !r)}
          style={{
            background: "rgba(0,212,255,0.06)",
            border: "1px solid rgba(0,212,255,0.18)",
            borderRadius: 5,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.52rem", letterSpacing: 1,
            color: "rgba(0,212,255,0.55)",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}
        >
          {running ? "Pause" : "Resume"}
        </button>
      </div>

      {/* Leaderboard */}
      <div style={{
        position: "absolute", top: 10, right: 14, zIndex: 4,
        display: "flex", flexDirection: "column", gap: 5,
      }}>
        {sorted.map((s, i) => (
          <div key={s.key} style={{
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.6rem",
          }}>
            <span style={{ color: "rgba(120,150,180,0.4)", width: 10 }}>#{i + 1}</span>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
            <span style={{ color: s.color, letterSpacing: 0.5, minWidth: 40 }}>{s.label}</span>
            <span style={{ color: "#e0eeff", fontWeight: 700, minWidth: 32, textAlign: "right" }}>
              {(last[s.key as keyof typeof last] as number).toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #00d4ff; }
          50%       { opacity: 0.4; box-shadow: none; }
        }
      `}</style>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 38, right: 18, bottom: 8, left: -10 }}
          onMouseMove={(e: any) => {
            if (e?.activeLabel !== undefined) setMouseX(e.activeLabel);
          }}
          onMouseLeave={() => setMouseX(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.05)" vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: "rgba(0,212,255,0.25)", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(0,212,255,0.08)" }}
            interval={4}
          />
          <YAxis
            domain={['auto', 100]}
            tick={{ fill: "rgba(0,212,255,0.25)", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            tickCount={5}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={false}
          />

          {/* Vertical comparison line */}
          {mouseX !== null && (
            <ReferenceLine
              x={mouseX}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
          )}

          {SERIES.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: s.color,
                stroke: "rgba(6,12,26,0.8)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}