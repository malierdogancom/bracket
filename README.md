# Bracket — bracket.malierdogan.com

Tournament bracket and team generator for events and competitions.

## What It Does

- **Tournament Bracket:** Create elimination-style brackets, track match winners round by round
- **Team Generator:** Randomly split a list of participants into balanced teams
- **Foosball Generator:** Upload CSV files of players, generate balanced squads with contact info
- **Admin Dashboard:** Manage all events; archive or delete past events
- **Public View:** Anyone can view active events without logging in

## Why It Was Built

Originally built for the İTÜ (Istanbul Technical University) foosball club to organize their tournaments — a simple tool to generate brackets and team splits on the fly instead of doing it manually. The architecture is generic enough to extend into a broader matchmaking platform.

## Tech Stack

- **Framework:** Next.js 16 (static export)
- **Styling:** Tailwind CSS 4
- **Backend:** Firebase Firestore + Authentication (email/password)
- **Hosting:** Firebase Hosting (target: `bracket-portfolio-mali`)

## Authentication

Admin functions require login at `/login`. Only authenticated users can create/manage events; each user sees only their own data. Public visitors can view active events without an account.

## Deployment

Push to `main` → GitHub Actions builds and deploys automatically. PRs get a preview URL.

```bash
npm run dev    # local development
npm run build  # static export → out/
```
