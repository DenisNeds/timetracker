# Time Tracker

A web app that records how much time each logged-in user spends on each of its
three pages (Home, Articles, Statistics). The time is measured on the backend
and stored in PostgreSQL. The Statistics page updates live: a user sees their
own numbers, an admin sees everyone's.

**Stack:** React + Vite (frontend, served by nginx) · Node.js + Express + `ws`
(backend) · PostgreSQL 16 · Docker Compose

## 1. Setup

Requirements: Docker with Docker Compose.

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

- Register a new account on the login page (every new account is a normal user), or
- log in as the admin: **`admin` / `admin123`**

The defaults work without any configuration. To change them, copy `.env.example`
to `.env` and edit it:

| Variable | Default | Purpose |
|---|---|---|
| `FRONTEND_PORT` | `8080` | Port of the app in the browser (change it if 8080 is taken) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | The admin account, created on first start |
| `JWT_SECRET` | `dev-secret-change-me` | Signs the login tokens; **change it for anything real** |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `tracker` | Database credentials |
| `IDLE_TIMEOUT_SECONDS` | (per page) | One idle timeout for all pages, e.g. `15` to test idle detection quickly |

On start the backend runs the database migration, creates the admin account if
it doesn't exist yet, and closes any visits left open by a previous run.

### Local development (optional)

```bash
docker compose up -d db backend   # database + API on :3000
cd frontend && npm install && npm run dev   # app on http://localhost:5173
```

Vite forwards `/api` and `/ws` to the backend, just like nginx does in Docker.
`backend/requests.http` has example API requests, and `backend/scripts/` has
small WebSocket test scripts (run them with `docker compose exec backend node scripts/<name>.js`).

### How it works

```
browser ──HTTP /api──▶ nginx ──▶ Express  (login, logout, stats)
        ──WebSocket /ws──▶     ──▶ ws server (page changes, activity, live stats)
                                     │
                                     ▼
                                 PostgreSQL: users, page_visits
```

Each tab keeps one WebSocket open. It tells the server which page is open and
whether the user is active; the **server** decides when time starts and stops
and writes it to the database. Every continuous stretch of time on one page is
one row in `page_visits` (`started_at`, `ended_at`, `last_seen_at`). A user's
time on a page is the sum of their rows for that page; an open row
(`ended_at IS NULL`) counts up to the current moment.

## 2. Design decisions

### How do users log in, and how is the admin told apart from a normal user?

- **Username and password.** Passwords are hashed with bcrypt. Registration is
  open, and validates the input on the server.
- After login the server sets a **JWT in an httpOnly cookie** (7 days).
  JavaScript can't read it, which protects it from XSS; `sameSite: lax`
  protects against CSRF. Because nginx serves the app and the API on the same
  origin, the cookie works without any CORS setup.
- `users.role` is `'user'` or `'admin'` (enforced by a `CHECK` constraint).
  **Registration always creates a normal user.** The only admin is created by
  a seed from environment variables, so nobody can make themselves an admin.
- The role is read from the verified token on the **server**, both by the REST
  endpoint (`GET /api/stats`) and by the WebSocket. A normal user can't get
  other users' stats by changing the frontend: the server never sends them.
- The WebSocket checks the cookie during the HTTP upgrade, before the
  connection is accepted.

### How does the app detect that the browser was closed or the connection lost?

The browser keeps a **WebSocket** open for as long as the app is open:

| What happens | How it's detected | Where the time stops |
|---|---|---|
| Tab or browser closed, navigating away | The socket closes right away | Now |
| Logout | `POST /api/auth/logout` closes the visit and every socket of that user (close code 4001, so other tabs go to the login page too) | Now |
| Lost connection, laptop closed, browser crashed | The server **pings every 10 s**; a socket that misses a ping is terminated (within 10–20 s) | At the user's **last activity** (`last_seen_at`) |
| Server crash or restart | On start, every visit still open is closed | At `last_seen_at` |

Ending at the last activity, rather than at the moment the problem was
noticed, means a dead connection or downtime never adds time the user didn't
actually spend.

Being connected isn't the same as reading, so the server also stops counting when:

- **The user isn't looking at the app.** The tab is hidden (another tab,
  minimized) or the window lost focus (another program in front). The browser
  sends `pause`, and `enter` again when the user comes back.
- **The user is idle.** The browser reports mouse, keyboard, scroll and touch
  activity (at most every 5 s). With no activity for 2 minutes on Home or
  5 minutes on Articles and Statistics (pages you read or watch without
  touching anything), the visit ends at the last activity. The next activity
  starts a new one.

**Several tabs:** a user can only be on one page at a time. A partial unique
index (`one open visit per user`) enforces it in the database. Starting a visit
closes the user's other open visit, so time is never counted twice; the
other tab shows "another tab is active" until the user uses it again.

**Continuing after re-login:** totals are always summed over all stored visits,
so a new login simply adds new rows on top of the old ones.

### What content do the pages have, and why?

- **Home:** a welcome and a plain explanation of what is tracked and when the
  clock stops. A user should know what is being measured about them.
- **Articles:** several short articles (about time on page, honest measuring,
  WebSockets, mobile-first design). Reading content is where "time on page"
  actually means something, and it gives the idle detection a realistic case.
- **Statistics:** the user's time per page, as numbers and bars showing each
  page's share, updated every second. A **live** tag marks the page the user is
  on right now. The admin sees one card per user. The server computes the
  numbers with one query per second for all viewers together and sends each
  viewer only what their role allows; the browser only displays them.

A status line under the header always shows whether time is being counted
("Tracking: Articles", "Paused: no activity", …), so the tracking is never a
mystery to the user.

## 3. Future improvements

- **Automated tests.** Integration tests for the tracking rules (idle,
  multiple tabs, disconnect, logout) against a test database, and Playwright
  tests for the main flows. So far everything was tested manually with the
  scripts in `backend/scripts/` and `requests.http`.
- **Scaling the live stats.** The stats query sums all visits of all users
  every second. With many users, keep running totals per user and page (updated
  when a visit ends) and only add the open visits on top, or move to
  Postgres `LISTEN/NOTIFY` and push only when something changed.
- **More than one backend instance.** Socket state lives in one process
  memory. With several instances, logout and "another tab took over" would
  need to be broadcast between them (e.g. Redis pub/sub).
- **Security hardening:** rate limiting on login and register, HTTPS with
  `COOKIE_SECURE=true`, a required strong `JWT_SECRET` in production, and a
  way to revoke tokens before they expire.
- **Admin features:** a date range filter (today, last 7 days), sorting and
  searching users, and charts over time. The data per visit is already stored.
- **Account management:** changing the password, deleting the account, and an
  admin managing roles.
- **Accessibility and UX:** a proper audit (screen readers, keyboard
  navigation), and showing a user a small "you were idle" notice.

## 4. Use of AI tools

> ✏️ **Draft — rewrite this in your own words so it's accurate.**

I used Claude Code (an AI coding agent) throughout the project.

- **Planning:** I discussed the task with the AI and we agreed on the stack,
  the database schema and a step-by-step plan, with one commit per step.
- **Backend:** built step by step together. The AI wrote each piece and
  explained it; I reviewed it, asked questions until I understood it, ran and
  tested every step myself (`requests.http`, the WebSocket test scripts,
  checking the database), and made all the commits. Some decisions came from
  my own testing, for example per-page idle detection, and that stats should
  only count while the window is actually in focus.
- **Frontend:** written mostly by the AI (React app, tracker hook, statistics
  page, styles, nginx and the Docker setup). I tested it in the browser and on
  a phone-sized screen and reported the problems I found, which were then fixed.
- **Bugs found by testing:** for example, users showed as "live" on pages they
  had never visited (a `LEFT JOIN` + `BOOL_OR` mistake in the stats query).
- **README:** drafted with the AI, then edited by me.

## 5. Challenges

> ✏️ **Draft — rewrite this in your own words.**

- **Defining "time on a page".** The hardest part wasn't code but deciding
  what should count: a hidden tab, a visible window behind another program, an
  open tab nobody is touching, two tabs at once. Each answer needed a different
  mechanism (visibility, focus, activity, one open visit per user).
- **Detecting a lost connection honestly.** A closed tab is easy, but a dead
  network connection isn't noticed by TCP for a long time. The solution was the
  ping/pong heartbeat, and ending such visits at the last activity rather than
  when the problem was noticed.
- **Race conditions.** Two tabs starting a visit at the same moment, or
  messages from one socket being handled out of order. Solved with a row lock
  in the database transaction and a per-socket queue.
- **First full app.** This was my first complete application, so Docker
  networking, cookies across the proxy and WebSockets through nginx were all new.

## 6. Open questions

> ✏️ **Draft — check these match what you actually wondered about.**

- **Does a background tab count?** The task says time is recorded while the
  user is on a page, but not what "on" means. I decided it only counts while
  the user is actually looking at the app: visible tab, focused window, and
  some activity in the last few minutes. That was my own choice; a simpler
  reading ("the page is open") would count much more time.
- **How long is "idle"?** There's no right number. I chose 2 minutes for Home
  and 5 for the reading pages, configurable through `IDLE_TIMEOUT_SECONDS`.
- **Is the admin tracked too?** I assumed yes: the admin is also a user of the
  app, so their time is recorded and shown like everyone else's.
- **Several tabs.** Should two open tabs count twice, or once? I decided once
  (the last used tab wins), since one person can only read one page at a time.
- **How is the admin created?** Not specified. I chose a seed from environment
  variables, so that registering can never create an admin.
