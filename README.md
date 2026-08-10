# Candidate Review Tool — Deploy Guide

## Two credentials you need first

**1. Anthropic API key** — this is what pays for and authorizes the AI scoring.
- Go to https://console.anthropic.com → Settings → API Keys → Create Key
- You'll need billing set up on that account (pay-per-use; ~30 candidates will cost a few dollars, not more)
- Copy the key — starts with `sk-ant-`

**2. GitHub personal access token** — this is what lets the app read repos at a higher rate limit
than an anonymous request gets (60/hour vs 5,000/hour).
- Go to https://github.com/settings/tokens → "Generate new token" → "Fine-grained token"
- Give it any name, set expiration, under "Repository access" choose "Public repositories (read-only)"
- No other permissions needed. Copy the token — starts with `github_pat_`

Keep both of these private — they're passwords, not links.

## Deploy to Vercel

1. Create a new GitHub repo and push this project's files to it (or drag-and-drop the folder
   into a new repo via github.com if you're not comfortable with git commands).
2. Go to https://vercel.com → New Project → import that repo.
3. Before deploying, open "Environment Variables" and add both:
   - `ANTHROPIC_API_KEY` = your key from step 1 above
   - `GITHUB_TOKEN` = your token from step 2 above
4. Click Deploy. Vercel gives you a live URL when it's done (~1 minute).
5. Open that URL — that's your tool. Bookmark it.

## Using it

Paste candidate email, repo URL, and demo URL, click "Run review." Each review takes
20-40 seconds (it's actually reading the code, not just checking if the repo exists).
Results build into a leaderboard as you go. Click "Export to Excel" once you've reviewed
everyone to get one spreadsheet with every score and write-up.

Results are saved in your browser's local storage — they'll still be there if you close
the tab and come back, but only on that browser/device. If you review some candidates on
your laptop and some on your phone, they won't merge into one list.
