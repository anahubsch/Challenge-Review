"use client";
import { useState, useEffect } from "react";

const REQUIREMENTS = [
  { key: "setup", label: "Next.js + TypeScript setup", max: 5 },
  { key: "search", label: "Username search + profile fetch", max: 8 },
  { key: "profile_display", label: "Avatar + basic info display", max: 5 },
  { key: "repo_list", label: "Repo listing with details", max: 8 },
  { key: "compare", label: "Compare two users feature", max: 12 },
  { key: "ai_summary", label: "AI profile summary/analysis", max: 12 },
  { key: "ai_chat", label: "AI chat (grounded, streaming, persisted)", max: 15 },
  { key: "notes", label: "Notes feature (persisted, shown on load)", max: 10 },
  { key: "deploy", label: "Live deploy works", max: 5 },
  { key: "cleanliness", label: "Code cleanliness / organization", max: 10 },
  { key: "performance", label: "Performance / scalability", max: 5 },
];
const BASE_MAX = REQUIREMENTS.reduce((s, r) => s + r.max, 0);
const STORAGE_KEY = "candidate_review_records";

const inputStyle = {
  background: "#23272f",
  border: "1px solid #2c313b",
  borderRadius: 6,
  padding: "9px 10px",
  color: "#e7e9ee",
  fontSize: 13,
  width: "100%",
};

function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, color: "#8b93a1", fontFamily: "ui-monospace,monospace" }}>{label}</label>
      {children}
    </div>
  );
}

function NoteBlock({ title, text, flag }) {
  if (!text) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #2c313b" }}>
      <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#8b93a1", fontFamily: "ui-monospace,monospace", margin: "0 0 6px" }}>{title}</h3>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: flag ? "#e8a33d" : "#cfd3da" }}>{text}</p>
    </div>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState(false);
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const items = JSON.parse(raw);
        items.sort((a, b) => b.total + b.bonus - (a.total + a.bonus));
        setCandidates(items);
      } catch {}
    }
  }, []);

  const persist = (items) => {
    items.sort((a, b) => b.total + b.bonus - (a.total + a.bonus));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    setCandidates([...items]);
  };

  const runReview = async () => {
    setErr(false);
    if (!email.trim() || !repoUrl.trim()) {
      setErr(true);
      setStatus("candidate email and repo URL are required");
      return;
    }
    setRunning(true);
    setStatus("reviewing — this can take 20-40s per candidate...");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), repoUrl: repoUrl.trim(), demoUrl: demoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "review failed");

      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      existing.push(data.record);
      persist(existing);

      setStatus(`done — ${data.record.email} scored ${data.record.total + data.record.bonus}/${BASE_MAX}${data.record.bonus ? "+" + data.record.bonus : ""}`);
      setEmail("");
      setRepoUrl("");
      setDemoUrl("");
    } catch (e) {
      setErr(true);
      setStatus(`failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const removeCandidate = (id) => {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    persist(existing.filter((c) => c.id !== id));
  };

  const exportToExcel = async () => {
    if (candidates.length === 0) return;
    setStatus("preparing export...");
    try {
      const XLSX = await import("xlsx");
      const overviewRows = candidates.map((c, i) => {
        const row = {
          Rank: i + 1,
          Email: c.email,
          "Repo URL": c.repoUrl,
          "Demo URL": c.demoUrl,
          "Total (base)": c.total,
          Bonus: c.bonus,
          "Grand Total": c.total + c.bonus,
          "Max Possible": BASE_MAX,
        };
        REQUIREMENTS.forEach((r) => {
          row[r.label] = Math.min(c.scores?.[r.key] || 0, r.max);
        });
        row["Summary"] = c.summary;
        row["AI Feature Assessment"] = c.ai_assessment;
        row["Code Quality Note"] = c.code_quality_note;
        row["Bonus Reason"] = c.bonus_reason;
        row["Red Flags"] = c.red_flags;
        row["Demo Check"] = c.demoStatus;
        row["Reviewed At"] = c.reviewedAt;
        return row;
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(overviewRows);
      ws["!cols"] = Object.keys(overviewRows[0]).map((k) =>
        ["Summary", "AI Feature Assessment", "Code Quality Note", "Red Flags", "Demo Check"].includes(k) ? { wch: 50 } : { wch: 20 }
      );
      XLSX.utils.book_append_sheet(wb, ws, "Candidate Scores");
      XLSX.writeFile(wb, `candidate_review_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setStatus("exported.");
    } catch (e) {
      setErr(true);
      setStatus(`export failed: ${e.message}`);
    }
  };

  return (
    <div style={{ fontFamily: "-apple-system,Segoe UI,Inter,sans-serif", color: "#e7e9ee", minHeight: "100vh", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <p style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#4fd1c5", margin: "0 0 4px" }}>Candidate Review</p>
        <h1 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 650 }}>GitHub Challenge Scoring</h1>
        <p style={{ color: "#8b93a1", fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>
          Fetches each repo's file tree and key source files server-side, checks the demo link, then scores it
          against the fixed rubric. Demo functionality is not verified beyond reachability — only inferred from
          code. Results are saved in this browser only (not shared across devices).
        </p>

        <div style={{ background: "#1b1e24", border: "1px solid #2c313b", borderRadius: 10, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="CANDIDATE EMAIL">
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" disabled={running} />
            </Field>
            <Field label="GITHUB REPO URL">
              <input style={inputStyle} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo" disabled={running} />
            </Field>
            <Field label="LIVE DEMO URL">
              <input style={inputStyle} value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://repo.vercel.app" disabled={running} />
            </Field>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={runReview}
              disabled={running}
              style={{
                background: running ? "#23272f" : "#4fd1c5",
                color: running ? "#8b93a1" : "#0b1414",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              {running ? "Reviewing..." : "Run review"}
            </button>
            <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: err ? "#e8664f" : "#8b93a1", whiteSpace: "pre-wrap" }}>{status}</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "30px 0 10px" }}>
          <h2 style={{ fontSize: 14, margin: 0, fontFamily: "ui-monospace,monospace", letterSpacing: ".04em", color: "#8b93a1", textTransform: "uppercase" }}>
            Leaderboard ({candidates.length})
          </h2>
          {candidates.length > 0 && (
            <button
              onClick={exportToExcel}
              style={{ background: "transparent", border: "1px solid #2c313b", color: "#4fd1c5", padding: "7px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
            >
              Export to Excel
            </button>
          )}
        </div>

        {candidates.length === 0 && <div style={{ textAlign: "center", color: "#8b93a1", fontSize: 13, padding: "30px 0" }}>No candidates reviewed yet.</div>}

        {candidates.map((c, i) => {
          const isOpen = openId === c.id;
          return (
            <div key={c.id} style={{ background: "#1b1e24", border: "1px solid #2c313b", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div onClick={() => setOpenId(isOpen ? null : c.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: "#8b93a1", width: 22 }}>#{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                  {c.email}
                  <span style={{ display: "block", fontWeight: 400, fontSize: 11, color: "#8b93a1", fontFamily: "ui-monospace,monospace", marginTop: 2 }}>
                    {c.owner}/{c.repo}
                  </span>
                </div>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 18, fontWeight: 700, color: "#4fd1c5" }}>
                  {c.total}
                  <span style={{ fontSize: 11, color: "#8b93a1", fontWeight: 400 }}>/{BASE_MAX}</span>
                  {c.bonus > 0 && <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: "#e8a33d", marginLeft: 6 }}>+{c.bonus} bonus</span>}
                </div>
              </div>

              {isOpen && (
                <div style={{ borderTop: "1px solid #2c313b", padding: 16 }}>
                  {REQUIREMENTS.map((r) => {
                    const pts = Math.min(c.scores?.[r.key] || 0, r.max);
                    return (
                      <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, marginBottom: 8 }}>
                        <div style={{ width: 220, color: "#8b93a1", flexShrink: 0 }}>{r.label}</div>
                        <div style={{ flex: 1, height: 6, background: "#23272f", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "#4fd1c5", width: `${(pts / r.max) * 100}%` }} />
                        </div>
                        <div style={{ fontFamily: "ui-monospace,monospace", width: 50, textAlign: "right", flexShrink: 0, color: "#8b93a1" }}>
                          {pts}/{r.max}
                        </div>
                      </div>
                    );
                  })}
                  <NoteBlock title="Summary" text={c.summary} />
                  <NoteBlock title="AI feature assessment" text={c.ai_assessment} />
                  <NoteBlock title="Code quality" text={c.code_quality_note} />
                  {c.bonus_reason && <NoteBlock title="Bonus" text={c.bonus_reason} />}
                  {c.red_flags && <NoteBlock title="Red flags" text={c.red_flags} flag />}
                  <NoteBlock title="Demo check" text={c.demoStatus} />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                      onClick={() => removeCandidate(c.id)}
                      style={{ background: "transparent", border: "1px solid #2c313b", color: "#8b93a1", padding: "6px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
