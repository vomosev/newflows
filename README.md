# Newflows

Newflows is a full-stack task management application for organizing work into projects and Jira-style task boards. It supports project issue keys, backlogs, workflow statuses, priorities, due dates, filtering, sortable tasks, and native drag-and-drop movement between board columns.

The application uses:

- **Frontend:** Next.js App Router and React
- **Backend:** Node.js and Express
- **Database:** MySQL through `mysql2/promise`
- **Authentication:** Server-side sessions stored in MySQL
- **Password security:** bcrypt password hashing
- **API format:** Credentialed JSON REST requests

Newflows does not use JWT authentication. The browser receives a signed, HttpOnly session cookie, while session data remains on the server and in the MySQL `sessions` table.

## Prerequisites

Install the following before running the application:

- Node.js matching the version requirement in `package.json`
- npm
- MySQL 8 or a compatible MySQL server
- A MySQL user permitted to create and access the Newflows database

Confirm the tools are available:

```bash
node --version
npm --version
mysql --version
```

## Installation

From the project root, install all frontend and backend dependencies:

```bash
npm install
```

The project uses one `package.json` for both the Next.js frontend and Express backend. The two development processes are started separately rather than through a concurrent process manager.

## Database Setup

### 1. Create the database

Connect to MySQL using an administrative account:

```bash
mysql -u root -p
```

Create the database configured by `DB_NAME`:

```sql
CREATE DATABASE newflows
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

If a dedicated application user is required, create and grant it access according to your deployment policy. Do not use a privileged administrative account in production.

Exit the MySQL client:

```sql
EXIT;
```

### 2. Load the schema

The root-level `schema.sql` file creates the following tables:

- `users`
- `projects`
- `tasks`
- `sessions`

It also defines:

- Primary and foreign keys
- Cascading deletion relationships
- Unique user email and project-key constraints
- Per-project issue counters
- Task status and priority constraints
- Due dates and sortable task positions
- Creation and update timestamps
- Query indexes
- Persistent server-session storage

Apply the schema to the database:

```bash
mysql -u root -p newflows < schema.sql
```

Replace the database name and MySQL account in the command when they differ from your configured values.

To confirm the tables were created:

```bash
mysql -u root -p -D newflows -e "SHOW TABLES;"
```

The schema should be initialized before the Express server starts. The server verifies database connectivity during startup and will not begin listening if MySQL cannot be reached.

## Environment Configuration

Copy the provided environment template:

```bash
cp .env.example .env
```

Edit `.env` and supply values appropriate for the local environment.

### Server variables

| Variable | Purpose |
| --- | --- |
| `DB_HOST` | MySQL server hostname |
| `DB_PORT` | MySQL server port |
| `DB_USER` | MySQL application user |
| `DB_PASSWORD` | Password for the MySQL application user |
| `DB_NAME` | Database containing the Newflows tables |
| `SESSION_SECRET` | Random value used by `express-session` to sign session cookies |
| `CLIENT_ORIGIN` | Exact frontend origin permitted by credentialed CORS |
| `SERVER_PORT` | Port used by the Express API |
| `NODE_ENV` | Runtime mode, such as development or production |

### Frontend variable

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser-accessible base URL for the Express API |

`NEXT_PUBLIC_API_URL` is exposed to browser code by Next.js and must point to an address that the user's browser can reach. It should identify the API base origin expected by `lib/api.js`, rather than a private database or container-only hostname.

`CLIENT_ORIGIN` must exactly match the frontend origin, including its protocol and port. Credentialed CORS requests can fail when the configured origin differs by hostname, protocol, or port.

After changing a `NEXT_PUBLIC_*` variable, restart or rebuild the Next.js frontend because public environment values are included in the client bundle.

Never commit `.env`. Use separate values for development and production, and use a long, randomly generated `SESSION_SECRET` in deployed environments.

## Development

The frontend and backend must run in separate terminals.

### Terminal 1: Express API

Start the backend in watch mode:

```bash
npm run server:dev
```

The server will:

1. Load and validate the server environment.
2. Create the MySQL connection pool.
3. Test database connectivity.
4. Configure JSON parsing and credentialed CORS.
5. Attach MySQL-backed session middleware.
6. Mount the health, authentication, project, and task routes.
7. Listen on `SERVER_PORT`.

The API health check is available at:

```text
GET /health
```

A healthy server responds with:

```json
{
  "status": "ok"
}
```

To run the backend without watch mode:

```bash
npm run server
```

### Terminal 2: Next.js frontend

Start the Next.js development server:

```bash
npm run dev
```

Open the URL printed by Next.js in a browser. The root route redirects to the dashboard. Unauthenticated visitors are redirected to the login page.

## Production Build and Startup

Build the Next.js frontend:

```bash
npm run build
```

Run the production frontend:

```bash
npm run start
```

Run the Express API in a separate process:

```bash
npm run server
```

Set `NODE_ENV` to production before starting both processes.

A production deployment should also:

- Use HTTPS for both browser and API traffic.
- Use a strong, deployment-specific `SESSION_SECRET`.
- Restrict `CLIENT_ORIGIN` to the actual frontend origin.
- Keep MySQL on a private network where possible.
- Use a dedicated MySQL account with only required permissions.
- Back up the MySQL database regularly.
- Run the frontend and backend under a process supervisor or container platform.
- Terminate processes gracefully so the backend can close its MySQL pool.
- Avoid exposing database credentials or session secrets to the browser.
- Rebuild the frontend whenever `NEXT_PUBLIC_API_URL` changes.
- Ensure proxy and cookie settings preserve secure credentialed requests.
- Apply `schema.sql` as part of initial deployment before accepting traffic.

The Express application handles termination signals and attempts to close the shared database pool gracefully.

## Authentication Behavior

Authentication is session-based:

1. A user signs up with a name, email address, and password.
2. The server normalizes the email address and validates submitted fields.
3. The password is hashed with bcrypt before storage.
4. On signup or login, the server regenerates the session to prevent session fixation.
5. The authenticated user's ID is stored in the server-side session.
6. The browser receives a signed, HttpOnly session cookie.
7. Session records are persisted in the MySQL `sessions` table.
8. Frontend API requests include browser credentials automatically.
9. Protected backend routes verify `req.session.userId`.
10. Logout destroys the server session and clears the session cookie.

Passwords and password hashes are never returned by the API. User responses contain only safe account fields.

The frontend `AuthProvider` calls the current-session endpoint when the application starts. Protected routes remain in a loading state until that request resolves. Users without a valid session are redirected to the login page.

Because sessions are stored in MySQL, restarting the Express process does not inherently invalidate active sessions that have not expired.

## Application Workflow

### Projects

Authenticated users can:

- View their projects
- Create projects
- Open a project task board
- Edit project metadata
- Delete owned projects

Project keys are normalized to uppercase and are unique. Deleting a project removes its associated tasks through database cascading rules.

### Tasks

Within an owned project, users can:

- View tasks grouped into ordered workflow columns
- Create tasks with a title, description, status, priority, and optional due date
- Edit existing tasks
- Delete tasks
- Filter tasks by text and priority
- Drag tasks between workflow columns
- Reorder tasks using sortable positions

Each task receives a transactionally allocated issue number from its project. The visible issue identifier combines the project key and issue number.

Project access is always checked on the server. Knowing a project or task ID does not grant access to another user's data.

## API Overview

All request and response bodies are JSON unless an endpoint has no response body. Browser requests use credentials so the session cookie is included.

### Health

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Verify that the API process is available |

### Authentication

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | No | Create an account and authenticated session |
| `POST` | `/api/auth/login` | No | Authenticate an existing account |
| `POST` | `/api/auth/logout` | Yes | Destroy the active session |
| `GET` | `/api/auth/me` | Yes | Return the current safe user record |

### Projects

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/projects` | Yes | List projects owned by the current user |
| `POST` | `/api/projects` | Yes | Create a project |
| `GET` | `/api/projects/:projectId` | Yes | Get an owned project and its task summaries |
| `PATCH` | `/api/projects/:projectId` | Yes | Update an owned project |
| `DELETE` | `/api/projects/:projectId` | Yes | Delete an owned project and its tasks |

### Tasks

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/projects/:projectId/tasks` | Yes | List tasks for an owned project |
| `POST` | `/api/projects/:projectId/tasks` | Yes | Create a task in an owned project |
| `PATCH` | `/api/tasks/:taskId` | Yes | Update task details, status, or position |
| `DELETE` | `/api/tasks/:taskId` | Yes | Delete an owned task |

Invalid input produces field-aware validation errors. Requests for inaccessible or missing projects and tasks return a not-found response rather than exposing another user's records. Duplicate email addresses and project keys produce conflict responses.

Unexpected backend errors are handled centrally and do not expose production internals.

## Project Structure

```text
.
├── app/
│   ├── dashboard/
│   │   └── page.jsx
│   ├── login/
│   │   └── page.jsx
│   ├── projects/
│   │   └── [projectId]/
│   │       └── page.jsx
│   ├── signup/
│   │   └── page.jsx
│   ├── globals.css
│   ├── layout.jsx
│   └── page.jsx
├── components/
│   ├── AppHeader.jsx
│   ├── AuthForm.jsx
│   ├── ProjectForm.jsx
│   ├── ProtectedRoute.jsx
│   ├── TaskBoard.jsx
│   ├── TaskCard.jsx
│   └── TaskForm.jsx
├── context/
│   └── AuthContext.jsx
├── lib/
│   ├── api.js
│   └── taskConstants.js
├── server/
│   ├── config/
│   │   ├── db.js
│   │   ├── env.js
│   │   └── session.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── projectController.js
│   │   └── taskController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errors.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── healthRoutes.js
│   │   ├── projectRoutes.js
│   │   └── taskRoutes.js
│   ├── utils/
│   │   └── validation.js
│   └── index.js
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── README.md
└── schema.sql
```

### `app/`

Contains the Next.js App Router pages and global application presentation.

- `layout.jsx` defines application metadata, imports the global stylesheet, and wraps routes with `AuthProvider`.
- `page.jsx` redirects the root route to the dashboard.
- `login/page.jsx` renders existing-user authentication.
- `signup/page.jsx` renders account creation.
- `dashboard/page.jsx` provides the protected project dashboard and project creation workflow.
- `projects/[projectId]/page.jsx` provides the protected project detail page, task board, project editing, and project deletion.
- `globals.css` contains the complete responsive visual system for navigation, forms, cards, boards, filters, dialogs, badges, and drag-and-drop states.

### `components/`

Contains reusable client-facing React components.

- `AppHeader.jsx` displays navigation, the current user, and logout controls.
- `AuthForm.jsx` handles login and signup validation and submission.
- `ProjectForm.jsx` handles controlled project creation and editing.
- `ProtectedRoute.jsx` waits for authentication resolution and redirects unauthenticated users.
- `TaskBoard.jsx` loads, filters, creates, edits, deletes, and reorders project tasks.
- `TaskCard.jsx` displays an individual draggable task.
- `TaskForm.jsx` provides the task create and edit modal.

### `context/`

Contains shared React state.

- `AuthContext.jsx` loads the active session and exposes signup, login, logout, user, and loading state.

### `lib/`

Contains frontend API and task-domain utilities.

- `api.js` centralizes credentialed API requests and exports authentication, project, and task API methods.
- `taskConstants.js` defines the ordered workflow statuses, priorities, labels, and lookup helpers used by the UI.

### `server/`

Contains the Express REST API.

#### `server/config/`

- `env.js` loads and validates required environment variables.
- `db.js` creates the shared `mysql2/promise` connection pool and provides startup and shutdown helpers.
- `session.js` implements the MySQL-backed `express-session` store and cookie configuration.

#### `server/controllers/`

- `authController.js` implements signup, login, logout, and current-user behavior.
- `projectController.js` implements owned project CRUD and task-count summaries.
- `taskController.js` implements owned task CRUD, transactional issue allocation, and drag-and-drop position updates.

#### `server/middleware/`

- `auth.js` rejects requests without an authenticated session.
- `errors.js` provides asynchronous error forwarding, HTTP errors, 404 handling, and centralized JSON error responses.

#### `server/routes/`

- `healthRoutes.js` exposes the health endpoint.
- `authRoutes.js` maps authentication endpoints to their controllers.
- `projectRoutes.js` maps protected project endpoints.
- `taskRoutes.js` maps protected nested-project and task endpoints.

#### `server/utils/`

- `validation.js` normalizes and validates authentication, project, and task payloads.

#### `server/index.js`

Creates the Express application, configures middleware, mounts all routers, verifies MySQL connectivity, starts the server, and handles graceful shutdown.

### Root files

- `.env.example` documents all required environment variables without real credentials.
- `.gitignore` excludes dependencies, builds, local environment files, logs, coverage data, and editor artifacts.
- `next.config.js` contains the Next.js configuration.
- `package.json` contains shared dependencies and separate frontend and backend scripts.
- `schema.sql` defines the complete MySQL schema.
- `README.md` provides setup, operation, API, and architecture documentation.

## Troubleshooting

### The backend exits during startup

Confirm that:

- MySQL is running.
- All required variables exist in `.env`.
- Numeric port values are valid integers.
- The configured database exists.
- `schema.sql` has been applied.
- The configured MySQL user can connect and access the database.
- The configured host and port are reachable from the backend process.

### The frontend reports a network or CORS error

Confirm that:

- The Express server is running.
- `NEXT_PUBLIC_API_URL` points to the browser-accessible API.
- `CLIENT_ORIGIN` exactly matches the frontend origin.
- Both URLs use the expected protocol.
- The frontend was restarted after changing environment variables.

### Login succeeds but the session does not persist

Confirm that:

- Browser cookies are enabled.
- Requests include credentials.
- The `sessions` table exists.
- The session store can write to MySQL.
- HTTPS is enabled when production secure cookies are used.
- The frontend and API origins are compatible with the configured cookie and CORS policy.
- `SESSION_SECRET` remains stable between backend restarts.

Changing `SESSION_SECRET` invalidates existing signed session cookies.

### Project creation reports a conflict

Project keys are unique. Choose a different uppercase project key if the requested key is already in use.

### Tables already exist when applying the schema

Use a clean database for initial setup, or inspect `schema.sql` and the existing database before reapplying it. Do not drop production tables without a verified backup and migration plan.