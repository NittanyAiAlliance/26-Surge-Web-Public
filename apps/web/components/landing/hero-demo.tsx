"use client";

import { useEffect, useState } from "react";

const businesses = [
  { name: "Mario's Pizzeria", type: "Restaurant", location: "Brooklyn, NY" },
  { name: "Bright Smile Dental", type: "Dentist", location: "Austin, TX" },
  { name: "Luxe Hair Studio", type: "Salon", location: "Miami, FL" },
  { name: "Atlas Plumbing Co.", type: "Plumber", location: "Denver, CO" },
  { name: "Chen & Associates", type: "Law Firm", location: "Chicago, IL" },
];

const stages = ["Scraping business data...", "Analyzing reviews & photos...", "Generating website...", "Done!"];

export function HeroDemo() {
  const [businessIndex, setBusIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [typing, setTyping] = useState("");
  const [phase, setPhase] = useState<"typing" | "generating" | "done">("typing");

  const biz = businesses[businessIndex];

  useEffect(() => {
    if (phase === "typing") {
      const target = biz.name;
      if (typing.length < target.length) {
        const timer = setTimeout(() => setTyping(target.slice(0, typing.length + 1)), 60);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase("generating"), 800);
        return () => clearTimeout(timer);
      }
    }
    if (phase === "generating") {
      if (stageIndex < stages.length - 1) {
        const timer = setTimeout(() => setStageIndex((s) => s + 1), 1200);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase("done"), 1000);
        return () => clearTimeout(timer);
      }
    }
    if (phase === "done") {
      const timer = setTimeout(() => {
        setPhase("typing");
        setTyping("");
        setStageIndex(0);
        setBusIndex((i) => (i + 1) % businesses.length);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [phase, typing, stageIndex, biz.name]);

  return (
    <div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur-sm">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="size-3 rounded-full bg-white/10" />
        <span className="size-3 rounded-full bg-white/10" />
        <span className="size-3 rounded-full bg-white/10" />
        <span className="ml-3 font-mono text-xs text-white/30">surge generate</span>
      </div>

      <div className="p-6">
        {/* Input row */}
        <div className="mb-5">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[var(--dash-vermillion)]/70">Business Name</p>
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-white/90">
            {typing}
            {phase === "typing" && (
              <span className="ml-px inline-block h-4 w-[2px] animate-pulse bg-[var(--dash-vermillion)]" />
            )}
          </div>
          <p className="mt-2 font-mono text-xs text-white/30">{biz.location}</p>
        </div>

        {/* Generation stages */}
        {phase !== "typing" && (
          <div className="space-y-2">
            {stages.slice(0, stageIndex + 1).map((stage, i) => (
              <div
                key={stage}
                className="flex items-center gap-2 font-mono text-xs"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {i < stageIndex || phase === "done" ? (
                  <span className="text-emerald-400">&#10003;</span>
                ) : (
                  <span className="inline-block size-3 animate-spin rounded-full border border-[var(--dash-vermillion)]/40 border-t-[var(--dash-vermillion)]" />
                )}
                <span className={i <= stageIndex ? "text-white/70" : "text-white/30"}>
                  {stage}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Done state - preview card */}
        {phase === "done" && (
          <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-xl border border-[var(--dash-vermillion)]/20 bg-gradient-to-br from-[var(--dash-vermillion)]/[0.06] to-transparent p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{biz.name}</p>
                <p className="font-mono text-xs text-white/40">{biz.type}</p>
              </div>
              <div className="rounded-full bg-emerald-400/10 px-3 py-1 font-mono text-[10px] font-medium text-emerald-400">
                LIVE
              </div>
            </div>
            <div className="mt-3 h-20 rounded-lg bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.06]" />
          </div>
        )}
      </div>
    </div>
  );
}
