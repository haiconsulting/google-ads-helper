# Google Ads Helper

Agency-facing **Google Ads Advisor** UI: pick a client, describe the new direction, optionally paste campaign data and/or upload Google Ads screenshots; recommendations stream from Claude via `/api/recommend`.

The harness MCP connector lives in `mcp/` and is served at `POST /api/mcp`. See `mcp/README.md`. It is read-only and does not use the advisor model key.

## Getting Started

Create `.env.local` in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Run the dev server:

```bash
npm run dev
```

Open the URL shown in the terminal (often [http://localhost:3000](http://localhost:3000); use your port if you pass `--port`, e.g. `3002`).

## Troubleshooting

### “Failed to fetch” / `net::ERR_EMPTY_RESPONSE` on `/api/recommend`

1. **Terminal (local)** — In the same window where `npm run dev` is running, look for lines starting with **`[recommend]`** and any **`Anthropic error`** or stack trace immediately after. Each request has a **request id** (UUID) you can match to the UI error.
2. **Missing API key** — If `ANTHROPIC_API_KEY` is unset, the API returns JSON `503` with a clear message. Restart the dev server after editing `.env.local`.
3. **Anthropic errors** — Invalid model name, billing, or rate limits show up in the terminal and are also appended to the streamed reply when possible (the stream is no longer aborted with `controller.error()`, which often caused empty responses in the browser).
4. **Large uploads** — Many large screenshots can exceed host body limits (stricter on Vercel than local). Try fewer or smaller images.

### Logs on Vercel

**Project → Deployments → [deployment] → Logs**, or the **Observability / Runtime Logs** views. Filter by function or search for `[recommend]`. Set `ANTHROPIC_API_KEY` under **Settings → Environment Variables** for Production (and Preview if needed).

## GitHub and Vercel

1. Authenticate GitHub CLI (once): `gh auth login -h github.com`
2. From this project directory, create the remote repo and push (pick your account/org):

```bash
git add -A && git commit -m "Initial Google Ads Helper"
gh repo create google-ads-helper --public --source=. --remote=origin --push
```

If the repo already exists on GitHub: `git remote add origin https://github.com/YOU/google-ads-helper.git` then `git push -u origin main`.

3. In [Vercel](https://vercel.com/new), **Import** that repository, add `ANTHROPIC_API_KEY`, deploy.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
