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
const BASE_MAX = REQUIREMENTS.reduce((s, r) => s + r.max, 0); // 95
const BONUS_MAX = 15;

function parseRepoUrl(url) {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.replace(/^\/|\/$/g, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

async function ghFetch(path, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "candidate-review-app" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}`);
  return res.json();
}

const RELEVANT_PATTERN = /(package\.json|readme|tsconfig|route\.(t|j)sx?|page\.(t|j)sx?|layout\.(t|j)sx?|chat|compare|notes?|summar|analy|api\/)/i;
const SKIP_PATTERN = /(node_modules|\.lock$|\.png$|\.jpg$|\.svg$|\.ico$|\.woff|package-lock)/i;

async function gatherRepoData(owner, repo, token) {
  const meta = await ghFetch(`/repos/${owner}/${repo}`, token);
  const branch = meta.default_branch || "main";

  let tree;
  try {
    tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token);
  } catch {
    tree = { tree: [] };
  }
  const allPaths = (tree.tree || []).filter((t) => t.type === "blob").map((t) => t.path);
  const candidates = allPaths.filter((p) => RELEVANT_PATTERN.test(p) && !SKIP_PATTERN.test(p));
  const selected = candidates.slice(0, 22);

  const files = [];
  for (const path of selected) {
    try {
      const f = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
      if (f.encoding === "base64" && f.content) {
        let content = Buffer.from(f.content, "base64").toString("utf-8");
        if (content.length > 6000) content = content.slice(0, 6000) + "\n...[truncated]";
        files.push({ path, content });
      }
    } catch {
      // skip unreadable file
    }
  }

  const recentCommits = await ghFetch(`/repos/${owner}/${repo}/commits?per_page=10`, token).catch(() => []);

  return {
    meta: { stars: meta.stargazers_count, language: meta.language, size: meta.size, description: meta.description },
    fileList: allPaths,
    files,
    commitMessages: Array.isArray(recentCommits) ? recentCommits.slice(0, 8).map((c) => c.commit?.message?.split("\n")[0]) : [],
  };
}

async function checkDemo(url) {
  if (!url) return "no demo link provided";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return `HTTP ${res.status}`;
  } catch (e) {
    return `could not verify (${e.name === "AbortError" ? "timed out" : "unreachable"}) — not necessarily broken`;
  }
}

function buildPrompt(data, demoStatus) {
  const rubricText = REQUIREMENTS.map((r) => `- ${r.key} (${r.label}): max ${r.max} pts`).join("\n");
  const filesText = data.files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n").slice(0, 60000);

  return `You are grading a coding challenge submission for a "GitHub Profile Explorer" intern hiring assessment. Score strictly and skeptically — do not give credit for things you cannot verify from the provided code. If a file needed to confirm a requirement wasn't included, say so and score conservatively rather than assuming.

CHALLENGE REQUIREMENTS (candidate had to build):
1. Next.js + TypeScript app
2. Username search input that fetches GitHub profile + repos
3. Show avatar + basic profile info
4. List all repos with name/description/stars
5. Compare two users on metrics (commit frequency, repo count, etc.)
6. AI-generated summary/analysis of a profile
7. AI chat interface about a specific repo — MUST be grounded in real repo data (README/file structure/commits), not just general LLM knowledge. Must stream. Must persist conversation history per repo.
8. Notes feature on a user or repo, persisted and shown on return visits
9. Deployed live demo

SCORING RUBRIC (assign integer points, cannot exceed max):
${rubricText}
Base max total: ${BASE_MAX}
PLUS a separate "bonus" field 0-${BONUS_MAX} for genuinely valuable things beyond the spec. Do not give bonus for things already required.

REPO METADATA:
Stars: ${data.meta.stars}, Primary language: ${data.meta.language}, Description: ${data.meta.description || "none"}
Files present in repo (partial list, ${data.fileList.length} total): ${data.fileList.slice(0, 80).join(", ")}
Recent commit messages: ${data.commitMessages.join(" | ") || "unavailable"}
Demo link check: ${demoStatus}

SOURCE FILES PULLED (partial — the most relevant ${data.files.length} files, may not be exhaustive):
${filesText}

Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "scores": { "setup": 0, "search": 0, "profile_display": 0, "repo_list": 0, "compare": 0, "ai_summary": 0, "ai_chat": 0, "notes": 0, "deploy": 0, "cleanliness": 0, "performance": 0 },
  "bonus": 0,
  "bonus_reason": "one short sentence, or empty string if no bonus",
  "ai_assessment": "2-3 sentences specifically judging the AI-chat grounding, streaming, and summary quality",
  "code_quality_note": "1-2 sentences on cleanliness/organization/scale",
  "red_flags": "1 sentence on any missing/faked/unverifiable requirement, or empty string",
  "summary": "2 sentence overall verdict"
}
Keep every text field terse. No extra keys.`;
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in the environment");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error(`No text response from model. stop_reason=${data.stop_reason}, raw=${JSON.stringify(data).slice(0, 500)}`);
  }
  const clean = textBlock.text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(`Model reply wasn't valid JSON: ${clean.slice(0, 500)}`);
  }
}

export async function POST(req) {
  try {
    const { email, repoUrl, demoUrl } = await req.json();
    if (!email || !repoUrl) {
      return Response.json({ error: "email and repoUrl are required" }, { status: 400 });
    }
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return Response.json({ error: "couldn't parse repo URL" }, { status: 400 });
    }

    const githubToken = process.env.GITHUB_TOKEN || null;
    const data = await gatherRepoData(parsed.owner, parsed.repo, githubToken);
    const demoStatus = await checkDemo((demoUrl || "").trim());
    const prompt = buildPrompt(data, demoStatus);
    const result = await callClaude(prompt);

    const total = REQUIREMENTS.reduce((sum, r) => sum + Math.min(result.scores?.[r.key] || 0, r.max), 0);
    const bonus = Math.min(result.bonus || 0, BONUS_MAX);

    const record = {
      id: `${parsed.owner}-${parsed.repo}-${Date.now()}`,
      email,
      repoUrl,
      demoUrl: demoUrl || "",
      owner: parsed.owner,
      repo: parsed.repo,
      scores: result.scores || {},
      total,
      bonus,
      bonus_reason: result.bonus_reason || "",
      ai_assessment: result.ai_assessment || "",
      code_quality_note: result.code_quality_note || "",
      red_flags: result.red_flags || "",
      summary: result.summary || "",
      demoStatus,
      reviewedAt: new Date().toISOString(),
    };

    return Response.json({ record });
  } catch (e) {
    return Response.json({ error: e.message || "unknown error" }, { status: 500 });
  }
}
