# CampusLoop — Campus Lost & Found Portal

**Helping lost belongings find their way home.**

CampusLoop is a full-stack campus lost-and-found portal where students can publish lost or found item reports, search campus listings, submit and review claims, and receive email updates. It combines a responsive React interface with a FastAPI backend and PostgreSQL database.

> **Project status:** Deployed on Render. The live backend, PostgreSQL database, Google OAuth, email OTP verification, and email notifications have been tested successfully.

## Contents

- [Why CampusLoop?](#why-campusloop)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Run locally](#run-locally)
- [Environment configuration](#environment-configuration)
- [Deployment](#deployment)
- [Google OAuth setup](#google-oauth-setup)
- [API overview](#api-overview)
- [Validation and build](#validation-and-build)
- [Security notes](#security-notes)
- [Roadmap](#roadmap)

## Why CampusLoop?

Lost items are common on campus, but finding the owner can be difficult. CampusLoop provides one shared place to publish reports, discover items, and manage claims with clear statuses.

The project was built as a practical full-stack application, with authentication, database-backed records, file uploads, email workflows, and a responsive user interface.

## Features

### Item reports
- Create lost and found reports with a title, description, category, location, date, and optional photo.
- Browse reports and search/filter listings.
- View report details, including the poster's name and email.
- Manage your own reports.

### Accounts and authentication
- Register with an email address and verify it using a one-time email code (OTP).
- Log in with email and password.
- Sign in or register with Google OAuth.
- Access protected actions through authenticated API requests.

### Claims and notifications
- Submit a claim for a found item.
- Let the report owner review and approve or reject claims.
- Track claim and report statuses, including open, claim requested, and resolved workflows.
- Send email notifications for relevant report and claim activity, plus confirmation messages for user actions.

### Analytics and interface
- Dashboard with report and claim metrics, category breakdowns, and activity summaries.
- Responsive, light-theme interface with a navy-and-violet visual identity.
- Separate dialogs for authentication, claims, personal reports, and analytics.

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, CSS, Lucide React |
| Backend | Python, FastAPI, Pydantic |
| Database | PostgreSQL, SQLAlchemy |
| Authentication | JWT-based API authentication, email OTP, Google OAuth |
| Email | Nylas Transactional Send API over HTTPS |
| API / development | Uvicorn, Git, GitHub |

## Architecture

```text
Campus-Lost-And-Found-project/
├── backend/
│   ├── app/
│   │   ├── routes/       # Authentication, items, claims, analytics
│   │   ├── models.py     # Database models
│   │   ├── schemas.py    # Request/response validation
│   │   ├── database.py   # Database and environment settings
│   │   └── main.py       # FastAPI application
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # Dialogs and dashboard components
│   │   ├── lib/          # API client
│   │   ├── App.tsx
│   │   └── ...
│   └── package.json
└── README.md
```

## Run locally

### Prerequisites

Install the following before starting:

- Python 3.11 or 3.12
- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the repository

```bash
git clone https://github.com/jakshara637/Campus-Lost-And-Found-project.git
cd Campus-Lost-And-Found-project
```

### 2. Create a PostgreSQL database

Create a database for the project (for example, `campus_lost_found`) using PostgreSQL or pgAdmin. Keep the database username, password, host, and port available for the connection URL.

### 3. Configure the backend

In PowerShell, from the repository root:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create a `.env` file inside the `backend` directory. See [Environment configuration](#environment-configuration) below. Do not commit this file.

Start the API:

```powershell
uvicorn app.main:app --reload
```

The API will normally be available at:

- API root: http://localhost:8000/
- Interactive Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

Keep this terminal open while using the frontend.

### 4. Configure and start the frontend

Open a second terminal from the repository root:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Vite normally serves the site at http://localhost:5173.

The frontend uses `VITE_API_BASE_URL` for the backend URL and defaults to `http://localhost:8000` when the variable is not set.

### 5. Verify the app

1. Open the frontend URL.
2. Register with an email address and complete OTP verification.
3. Log in and create a test lost or found report.
4. Confirm the report appears in Browse Items.
5. Test claim submission and owner review with suitable test accounts.
6. Check the API health endpoint and Swagger documentation if something fails.

## Environment configuration

The backend reads settings from `backend/.env`. Use values appropriate for your own local environment:

```dotenv
DATABASE_URL=postgresql+psycopg://DB_USER:DB_PASSWORD@localhost:5432/campus_lost_found
JWT_SECRET_KEY=replace_with_a_long_random_secret
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email OTP and notification delivery (Nylas HTTPS API)
NYLAS_API_KEY=your_nylas_api_key
NYLAS_DOMAIN=your-verified-domain.nylas.email
NYLAS_FROM_EMAIL=notifications@your-verified-domain.nylas.email
NYLAS_FROM_NAME=CampusLoop
# Optional; default is the Nylas US API endpoint
# NYLAS_API_URL=https://api.us.nylas.com

# Google OAuth (optional until configured)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
SESSION_SECRET_KEY=replace_with_another_long_random_secret
```

**Important:** Use the exact domain that Nylas shows as verified, and a sender address permitted for that domain. `NYLAS_API_KEY` is secret and must only be stored in the backend environment—not in frontend variables or GitHub. Render's free web services block standard outbound SMTP ports, so the backend uses Nylas over HTTPS. Use URL-encoded database credentials if they contain reserved characters. Generate strong, unique secrets and never publish real credentials.

## Google OAuth setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud project and configure the OAuth consent screen.
3. Create an OAuth client ID for a **Web application**.
4. For local development, add `http://localhost:8000/auth/google/callback` as an authorized redirect URI.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `backend/.env`.
6. Restart the backend and test both Google sign-in and registration flows.

For the deployed backend, the callback URL is `https://campus-lost-and-found-project.onrender.com/auth/google/callback`. Add that exact URL to the authorized redirect URIs in your Google OAuth client and set `GOOGLE_REDIRECT_URI` to the same value in Render. Keep the localhost callback for local development.

## Deployment

The backend is deployed on Render and uses a hosted PostgreSQL database. The public API base URL is [`https://campus-lost-and-found-project.onrender.com`](https://campus-lost-and-found-project.onrender.com). You can inspect the API through its [Swagger documentation](https://campus-lost-and-found-project.onrender.com/docs) and check the [health endpoint](https://campus-lost-and-found-project.onrender.com/health).

The React frontend is deployed separately as a Render Static Site. Set the frontend environment variable `VITE_API_BASE_URL` to `https://campus-lost-and-found-project.onrender.com` and ensure the backend's `FRONTEND_ORIGIN` matches the exact deployed frontend origin. Configure all backend secrets and Nylas settings in Render's Environment section; never commit production secrets to the repository. Free services may sleep when idle, so the first request after inactivity can take longer.

## API overview

The main API groups include:

| Area | Representative routes | Purpose |
|---|---|---|
| Health | `GET /`, `GET /health` | Check that the API is running |
| Authentication | `/auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/me` | Registration, verification, login, and current-user details |
| Items | `/items/`, `/items/mine` | Browse and manage reports |
| Claims | `/claims/mine`, `/claims/{claim_id}` | Track and review claims |
| Analytics | `/analytics/dashboard` | Retrieve dashboard metrics |

The exact request schemas and all registered routes can be explored at http://localhost:8000/docs while the backend is running.

## Validation and build

From the `frontend` directory:

```powershell
npm.cmd run lint
npm.cmd run build
```

The build command runs TypeScript checks and creates the production frontend bundle in `frontend/dist`.

For backend development, run the API with Uvicorn and use the interactive API docs to exercise endpoints. End-to-end tests should be completed again after any deployment or authentication configuration changes.

## Security notes

- Never commit `.env` files, OAuth client secrets, SMTP credentials, database passwords, JWT secrets, or real user data.
- Use HTTPS in production.
- Configure production CORS to allow only the deployed frontend origin.
- Set secure cookie/session settings for the production HTTPS environment.
- Use a production database and persistent storage for uploaded images.
- Review authentication, upload limits, email rate limits, backups, and error logging before exposing the application publicly.
- Avoid putting personal contact details in public reports unless that visibility is intentional. Report poster contact information is currently shown in report details.

## Roadmap

- [x] Core lost/found report workflow
- [x] Search and filtering
- [x] Registration with email OTP
- [x] Google OAuth integration
- [x] Claims workflow and email notifications
- [x] Analytics dashboard
- [x] Production deployment on Render with hosted PostgreSQL
- [x] Production email delivery through Nylas HTTPS API
- [ ] Ongoing production hardening, monitoring, and rate-limit review
- [ ] AI-assisted matching of similar lost and found reports

## Contributing

This is a learning and portfolio project. Suggestions, issues, and improvements are welcome. Before submitting a change, run the frontend lint and build checks and verify the affected API workflow locally.

## Author

Built as a full-stack campus utility and portfolio project.

---

**CampusLoop — Lost & Found, Reconnected.**
