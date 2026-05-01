# SecureAuth — Secure Login System

A full-stack secure login web application built with **Node.js**, **Express**, and **SQLite**.

## Features

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt (cost factor 12) via `bcryptjs` |
| SQL injection protection | Parameterized queries only — no string interpolation |
| Input validation | `express-validator` — server-side for all fields |
| Session management | `express-session` with HttpOnly, SameSite cookies |
| Brute-force protection | `express-rate-limit` — 10 requests / 15 min per IP |
| Security headers | `helmet` — CSP, X-Frame-Options, HSTS, etc. |
| Optional 2FA | TOTP via `speakeasy` (Google Authenticator compatible) |
| Session fixation prevention | `req.session.regenerate()` on login |

---

## Project Structure

```
secure-login-system/
├── server.js              # Express app, middleware, routes
├── package.json
├── .env.example           # Environment variable template
├── .gitignore
├── config/
│   └── database.js        # SQLite setup with parameterized query helpers
├── middleware/
│   └── auth.js            # requireAuth middleware
├── routes/
│   └── auth.js            # /register, /login, /verify-2fa, /logout, /me
└── public/
    ├── index.html          # Single-page frontend
    ├── style.css
    └── app.js             # Frontend JS (fetch API calls)
```

---

## Getting Started

### Prerequisites
- Node.js v16 or higher
- npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/secure-login-system.git
cd secure-login-system

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET

# 4. Start the server
npm start
# For development with auto-restart:
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/verify-2fa` | Verify TOTP 2FA code |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Get current user (requires auth) |

### Register
```json
POST /api/auth/register
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "SecurePass1",
  "enable2fa": false
}
```

### Login
```json
POST /api/auth/login
{
  "email": "jane@example.com",
  "password": "SecurePass1"
}
```

---

## Security Details

### Password Hashing
Passwords are hashed using **bcrypt with cost factor 12** before storage. The plaintext password is never stored or logged.

```js
const hash = await bcrypt.hash(password, 12);
```

### SQL Injection Prevention
All database queries use **parameterized statements** with `?` placeholders. User input is never interpolated into SQL strings.

```js
// Safe — parameterized
db.get('SELECT * FROM users WHERE email = ?', [email]);

// Never done — vulnerable to injection
db.get(`SELECT * FROM users WHERE email = '${email}'`); // ❌
```

### Session Security
- Sessions use **HttpOnly** cookies (inaccessible to JavaScript)
- **SameSite: strict** prevents CSRF attacks
- **Session is regenerated** after login to prevent session fixation
- Sessions expire after 2 hours

### Two-Factor Authentication
When enabled, the server generates a **TOTP secret** (RFC 6238) compatible with Google Authenticator, Authy, and similar apps. The user scans the QR code and must enter a valid 6-digit code on every login.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Set to `production` for secure cookies |
| `SESSION_SECRET` | *(required)* | Long random string for signing sessions |

---

## License

MIT
