# 🗺️ Tour Planner

**Plan a multi-city loop trip and see which route costs the least — all in your browser.**

You pick the cities, the transport, and the times. Tour Planner draws every option on one
interactive map and adds up the cost, so the cheapest way around is obvious at a glance.

It's the [Traveling Salesperson Problem](https://en.wikipedia.org/wiki/Travelling_salesman_problem)
— start and end in the same city, visit places in between — except *you* define the options
instead of letting an algorithm pick. No solver, no magic: just a clear side-by-side compare.

<p align="center">
  <a href="https://tour-planner.parvez.cloud/"><b>▶ Live demo</b></a>
  &nbsp;·&nbsp;
  <a href="#-getting-started">Run it locally</a>
  &nbsp;·&nbsp;
  <a href="#-contributing">Contribute</a>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Built with React + Vite" src="https://img.shields.io/badge/React-18-149eca.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="No backend" src="https://img.shields.io/badge/backend-none-brightgreen.svg" />
</p>

![Tour Planner — one map of every route, cost comparison in the sidebar](docs/screenshot-desktop.png)

<p align="center">
  <img src="docs/screenshot-mobile.png" width="320" alt="Tour Planner on mobile — the panel stacks above the map" />
</p>

## ✨ What you can do

- **See every route on one map.** Legs shared between routes collapse to a single edge; routes
  fork only where they actually differ. Arrows show direction — drag cities, pan, and zoom.
- **Compare costs instantly.** A savings banner, stacked transport/accommodation bars, and a
  per-leg breakdown highlight the cheapest loop.
- **Tune each hop.** Set transport mode (✈ 🚆 🚌 🚗 ⛴ 🚶), 24-hour departure time, fare, nights,
  and accommodation cost. Add several departure options per hop (e.g. morning vs evening flight)
  and pick one — the map shows exactly what the total is built from.
- **Walk for free.** The 🚶 mode has no fare — just a time.
- **Plan for a group.** A travelers multiplier scales transport (accommodation stays a flat
  room cost).
- **Get real dates.** A start date rolls your nights-per-stop up into arrival dates and total
  trip length.
- **Keep notes** per route for booking tips and links.

## 🔒 How it works (and your privacy)

Everything runs in your browser. **There is no backend and no account.**

- Your plan **auto-saves to `localStorage`** — reopen the tab anytime and it's still there.
- **Share via link:** the entire plan is encoded into the URL, so you can send a trip to a
  friend with nothing stored on a server.
- **No tracking, no data collection.** Nothing you type ever leaves your machine unless *you*
  copy a share link or paste it somewhere.

## 🤖 Plan with your own AI (optional)

No AI runs on this site and there's no API key to configure. Instead:

1. Click **Copy AI prompt** — it copies a schema plus your current draft.
2. Paste it into ChatGPT / Claude / Gemini and let it fill in realistic fares, times, and costs.
3. Paste the JSON it returns back into the app to visualize and tweak.

You choose the model; your data stays yours.

## 🚀 Getting started

Prerequisites: **Node.js 18+**.

```bash
git clone https://github.com/parvez-ahammed/tour-planner.git
cd tour-planner
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

## 🧱 Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui (Radix) · React Flow (`@xyflow/react`).
No backend, no database — a fully static single-page app.

## 🤝 Contributing

Contributions are welcome — issues and pull requests both.

1. **Found a bug or have an idea?** [Open an issue](https://github.com/parvez-ahammed/tour-planner/issues)
   and describe what you expected vs. what happened.
2. **Sending a PR?** Fork the repo, create a branch, and make sure it builds:

   ```bash
   npm run build
   ```

3. Keep changes focused and match the surrounding code style. Small, clear PRs get merged fastest.

New to the codebase? Good places to start: `src/lib/trip.ts` (cost math), `src/lib/graph.ts`
(how routes become the map), and `src/components/RoutePanel.tsx` (the editor UI).

## ☁️ Deploy

Deployed on **Vercel** — pushes to `main` build and deploy automatically. Vercel auto-detects
the Vite setup (`npm run build` → static `dist/`), so there's nothing extra to configure. Because
the app is fully static, it will happily host on Netlify, GitHub Pages, Cloudflare Pages, or any
static host.

## 📄 License

[MIT](LICENSE) © Parvez Ahammed — free to use, modify, and share.
