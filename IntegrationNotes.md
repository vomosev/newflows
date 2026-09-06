# Integration Notes for newflows

## Overview

Newflows is a full-stack task management application for organizing projects and Jira-style task boards. It supports:

- Session-based user signup, login, logout, and session restoration
- Project creation, editing, deletion, and project-key management
- Project backlogs and ordered status columns
- Task status, priority, due dates, filtering, and sortable positions
- Native HTML drag-and-drop task movement
- Per-project issue numbers such as `PROJ-1`
- MySQL-backed application data and sessions

The frontend uses the Next.js App Router and runs separately from the Express REST API. The Express server is responsible for authentication, authorization, validation, and all database access through `mysql2/promise`. The application does not use an ORM.

## Prerequisites

Install the following before setting up the project:

- Node.js matching the version requirement in the `engines` field of `package.json`
- npm
- MySQL, preferably MySQL 8 or a compatible release that enforces the schema constraints
- A modern web browser
- A MySQL account permitted to create databases and users, or an existing database and user supplied by an administrator

Confirm the local tools are available:

```bash
node --version
npm --version
mysql --version
```

The `bcrypt` package may require native build tooling if a prebuilt binary is unavailable for the selected Node.js version or platform.

## Installation

### 1. Install Node.js dependencies

From the project root:

```bash
cd newflows
npm install
```

All frontend and backend dependencies are managed through the root `package.json`. No Python or `pip` installation is required.

### 2. Create the MySQL database and user

The following is an example for a local MySQL installation. Replace the password before using it:

```bash
mysql -u root -p
```

Then run:

```sql
CREATE DATABASE newflows
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'newflows_user'@'localhost'
  IDENTIFIED BY 'replace-with-a-secure-password';

GRANT ALL PRIVILEGES ON newflows.* TO 'newflows_user'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

If the API connects from another host or container, create or grant the MySQL user for the appropriate host rather than only `localhost`.

### 3. Initialize the schema

Import `schema.sql` into the newly created database:

```bash
mysql -u newflows_user -p newflows < schema.sql
```

The schema creates the following tables:

- `users`
- `projects`
- `tasks`
- `sessions`

It also defines primary and foreign keys, cascading deletes, uniqueness constraints, task status and priority constraints, timestamps, positions, project issue counters, and query indexes.

Run the schema before starting the Express server. The custom session store requires the `sessions` table, and the application does not automatically create or migrate tables at startup.

### 4. Create the environment file

Copy the provided template:

```bash
cp .env.example .env
```

Update `.env` with the database credentials, session secret, origins, and ports for the target environment. The file is excluded by `.gitignore` and must not be committed.

A local configuration can resemble:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=newflows_user
DB_PASSWORD=replace-with-a-secure-password
DB_NAME=newflows
SESSION_SECRET=replace-with-a-long-random-session-string
CLIENT_ORIGIN=http://localhost:3000
SERVER_PORT=4000
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NODE_ENV=development
```

Use the same hostname style consistently. For example, `http://localhost:3000` and `http://127.0.0.1:3000` are different origins for CORS and cookie purposes.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DB_HOST` | Hostname of the MySQL server used by the Express API. | `localhost` |
| `DB_PORT` | Integer port on which the MySQL server accepts connections. It is parsed and validated by `server/config/env.js`. | `3306` |
| `DB_USER` | MySQL user with access to the Newflows database and its application tables. | `newflows_user` |
| `DB_PASSWORD` | Password for the configured MySQL user. Store it only in local environment files or a production secret manager. | `replace-with-a-secure-password` |
| `DB_NAME` | Name of the MySQL database containing the Newflows tables. | `newflows` |
| `SESSION_SECRET` | Long random string used by `express-session` to sign the session cookie. This is not a JWT secret because Newflows uses server-side sessions. All API instances must use the same value. | `replace-with-a-long-random-session-string` |
| `CLIENT_ORIGIN` | Exact frontend origin allowed to make credentialed CORS requests to the Express API. Do not include `/api`. | `http://localhost:3000` |
| `SERVER_PORT` | Integer port on which the Express API listens. | `4000` |
| `NEXT_PUBLIC_API_URL` | Browser-accessible base URL for the Express REST API. The `/api` prefix must be included. As a `NEXT_PUBLIC_` value, it is exposed to browser code and may be embedded during the Next.js build. | `http://localhost:4000/api` |
| `NODE_ENV` | Runtime mode used to select development behavior or secure production cookie behavior. Use `development` locally and `production` in production. | `development` |

The Express environment loader in `server/config/env.js` loads `.env`, validates required server settings, and converts `DB_PORT` and `SERVER_PORT` to integers. Invalid or missing required settings prevent normal server startup.

Restart both frontend and backend processes after changing environment values. Rebuild the Next.js application after changing `NEXT_PUBLIC_API_URL` for a production deployment.

## Running the Application

Newflows intentionally runs the frontend and backend as separate processes rather than using `concurrently`.

### Start the Express API

In the first terminal, from the project root:

```bash
npm run server
```

The direct server entry point is:

```bash
node server/index.js
```

For local development with Node.js watch mode, the entry point can also be run as:

```bash
node --watch server/index.js
```

During startup, the API validates its environment and tests MySQL connectivity before listening on `SERVER_PORT`. With the example configuration, the API is available at:

```text
http://localhost:4000
```

Verify the health endpoint:

```bash
curl http://localhost:4000/health
```

A healthy server returns HTTP 200 with exactly:

```json
{"status":"ok"}
```

### Start the Next.js frontend

In a second terminal:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The root route redirects to the dashboard. If there is no authenticated server session, `ProtectedRoute` redirects the browser to `/login`. New users can create an account at `/signup`.

### Authentication behavior

Authentication uses an HttpOnly signed session cookie and a server-side session record stored in MySQL. It does not use JWTs.

The frontend API helper in `lib/api.js` sends requests with credentials so that the browser includes the session cookie. For this to work:

- `CLIENT_ORIGIN` must exactly match the frontend origin.
- `NEXT_PUBLIC_API_URL` must be reachable from the browser.
- The Express API must remain configured for credentialed CORS.
- The browser must accept the session cookie.
- Production deployments must use HTTPS when secure production cookies are enabled.

Passwords are hashed with `bcrypt`. Login regenerates the session to reduce session-fixation risk, and logout destroys the server session and clears the cookie.

### REST API overview

The primary endpoints are:

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `GET` | `/health` | No | API health check |
| `POST` | `/api/auth/signup` | No | Create an account and authenticated session |
| `POST` | `/api/auth/login` | No | Authenticate and create a session |
| `POST` | `/api/auth/logout` | Yes | Destroy the active session |
| `GET` | `/api/auth/me` | Yes | Return the current safe user record |
| `GET` | `/api/projects` | Yes | List projects owned by the current user |
| `POST` | `/api/projects` | Yes | Create a project |
| `GET` | `/api/projects/:projectId` | Yes | Retrieve an owned project |
| `PATCH` | `/api/projects/:projectId` | Yes | Update an owned project |
| `DELETE` | `/api/projects/:projectId` | Yes | Delete an owned project and cascading tasks |
| `GET` | `/api/projects/:projectId/tasks` | Yes | List tasks for an owned project |
| `POST` | `/api/projects/:projectId/tasks` | Yes | Create a task and allocate its issue number |
| `PATCH` | `/api/tasks/:taskId` | Yes | Update task data, status, or position |
| `DELETE` | `/api/tasks/:taskId` | Yes | Delete a task |

Project and task access is scoped to `req.session.userId`. Inaccessible records are not returned merely because a caller knows their numeric IDs.

### Production commands

Build the Next.js frontend:

```bash
npm run build
```

Start the built frontend:

```bash
npm run start
```

Start the API as a separate production process:

```bash
node server/index.js
```

Set `NODE_ENV=production` through the deployment environment or `.env` before launching both processes. Use a process supervisor, container platform, or service manager to keep the two processes running independently.

## Project Structure

### Root configuration and database files

- `package.json` — Defines the Node.js requirement, frontend and backend scripts, and all Next.js, React, Express, MySQL, session, CORS, environment, and bcrypt dependencies.
- `next.config.js` — Enables React strict mode and provides the Next.js App Router configuration.
- `.env.example` — Documents all required environment variables without real credentials.
- `.gitignore` — Excludes dependencies, Next.js output, local environment files, logs, coverage files, and editor or operating-system artifacts.
- `schema.sql` — Creates the users, projects, tasks, and MySQL-backed sessions schema.
- `README.md` — Provides the main repository-level setup, API, authentication, production, and structure reference.

### Frontend routes

- `app/layout.jsx` — Root layout, metadata, global CSS import, and shared `AuthProvider`.
- `app/globals.css` — Responsive styles for navigation, forms, project cards, modals, filters, boards, task cards, badges, errors, and drag-and-drop states.
- `app/page.jsx` — Redirects the root route to the dashboard flow.
- `app/login/page.jsx` — Login page using the shared authentication form.
- `app/signup/page.jsx` — Account registration page with password confirmation.
- `app/dashboard/page.jsx` — Protected project dashboard with project counts, creation, loading, empty, and error states.
- `app/projects/[projectId]/page.jsx` — Protected project detail route with task board and owner edit/delete controls.

### Frontend state, API, and constants

- `context/AuthContext.jsx` — Loads the current session and exposes signup, login, logout, user, and loading state.
- `lib/api.js` — Credentialed request helper and authentication, project, and task API clients.
- `lib/taskConstants.js` — Shared ordered status definitions, priorities, labels, and lookup helpers.

### Frontend components

- `components/ProtectedRoute.jsx` — Delays rendering until session resolution and redirects unauthenticated users.
- `components/AppHeader.jsx` — Authenticated navigation, user display, dashboard link, and logout control.
- `components/AuthForm.jsx` — Reusable login and signup form with client validation and API errors.
- `components/ProjectForm.jsx` — Reusable create/edit form for project name, key, description, and color.
- `components/TaskBoard.jsx` — Loads tasks, applies filters, renders columns, manages task forms, and performs drag-and-drop updates.
- `components/TaskCard.jsx` — Draggable task summary with issue key, priority, due-date state, and edit/delete controls.
- `components/TaskForm.jsx` — Modal form for task title, description, status, priority, and optional due date.

### Express application and configuration

- `server/index.js` — Configures Express, JSON parsing, credentialed CORS, sessions, routers, health checks, error handling, startup database checks, and graceful shutdown.
- `server/config/env.js` — Loads, validates, parses, and freezes environment configuration.
- `server/config/db.js` — Exports the shared `mysql2/promise` connection pool and lifecycle helpers.
- `server/config/session.js` — Implements the MySQL-backed `express-session` store and signed HttpOnly cookie configuration.

### Express middleware and utilities

- `server/middleware/auth.js` — Requires `req.session.userId` for protected API routes.
- `server/middleware/errors.js` — Defines `HttpError`, async forwarding, not-found handling, and centralized JSON error responses.
- `server/utils/validation.js` — Normalizes and validates authentication, project, status, priority, and task input.

### Express routes

- `server/routes/healthRoutes.js` — Defines the `GET /health` response.
- `server/routes/authRoutes.js` — Defines signup, login, logout, and current-user routes.
- `server/routes/projectRoutes.js` — Defines authenticated project CRUD routes.
- `server/routes/taskRoutes.js` — Defines nested project-task listing/creation and task update/deletion routes.

### Express controllers

- `server/controllers/authController.js` — Handles bcrypt password operations, normalized emails, safe user responses, and secure session lifecycle.
- `server/controllers/projectController.js` — Handles ownership-aware project CRUD, aggregate task counts, and duplicate-project conflicts.
- `server/controllers/taskController.js` — Handles project ownership checks, transactional issue allocation, sortable positions, drag-and-drop updates, and task deletion.

## Next Steps / Production Considerations

- **Protect secrets:** Store `DB_PASSWORD` and `SESSION_SECRET` in a production secret manager. Generate a long random session secret and never expose it through a `NEXT_PUBLIC_` variable.
- **Use HTTPS:** Production session cookies use secure behavior selected by `NODE_ENV`. Terminate TLS at the application or a trusted reverse proxy, and verify Express proxy settings if TLS terminates upstream.
- **Configure origins precisely:** Set `CLIENT_ORIGIN` to the exact deployed frontend origin and `NEXT_PUBLIC_API_URL` to the externally reachable API URL. Review cookie `SameSite`, domain, and secure settings if the frontend and API are deployed on different sites.
- **Run schema changes deliberately:** `schema.sql` initializes a fresh database but is not a migration framework. Introduce versioned migrations before changing production schemas.
- **Back up MySQL:** Schedule encrypted backups and test restoration for `users`, `projects`, `tasks`, and `sessions`.
- **Harden the database connection:** Use a least-privilege MySQL user, restrict network access, enable TLS when connecting across networks, and tune the pool for expected concurrency.
- **Scale sessions consistently:** Multiple API instances can share the MySQL session store, but every instance must use the same `SESSION_SECRET` and access the same sessions table. Monitor session-table growth and expiration cleanup.
- **Add abuse protection:** Consider rate limiting login and signup, account lockout or progressive delays, password-strength requirements, CSRF protections appropriate to the deployment topology, and request-size limits.
- **Deploy separate services:** Run the Next.js frontend and Express API as distinct supervised processes or containers. Configure restarts and graceful termination so `server/index.js` can close the MySQL pool.
- **Use health monitoring:** Point API health checks at `GET /health`. Add deeper readiness checks if deployment orchestration must distinguish an active process from one that can successfully query MySQL.
- **Add observability:** Centralize logs, avoid recording passwords or cookies, capture unexpected server errors, and add metrics for request latency, authentication failures, pool saturation, and transaction failures.
- **Review authorization tests:** Add integration tests confirming users cannot access, modify, or delete another user's projects or tasks.
- **Test transactional workflows:** Exercise concurrent task creation to verify project issue counters remain unique and test drag-and-drop updates for stable status and position ordering.
- **Rebuild public configuration:** Because `NEXT_PUBLIC_API_URL` is browser-exposed and may be embedded during the Next.js build, rebuild the frontend when changing its production value.

## Database Provisioning

A mysql database has been automatically provisioned for this app.

- **Database:** newflows
- **Host:** testdb.gridiron-app.com
- **Port:** 3306
- **User:** newflows
- **Credentials stored in Vault at:** `secret/data/mysql/newflows`

Retrieve the password securely from Vault and set it as an environment variable (e.g. `DB_PASSWORD`) in your deployment settings — do not commit it to source control.
