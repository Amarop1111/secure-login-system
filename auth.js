const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const speakeasy = require('speakeasy');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── Input sanitization helper ───────────────────────────────────────────────
// All user input is validated via express-validator before hitting the DB.
// DB queries use parameterized statements (no string interpolation) to
// prevent SQL injection.

// ─── Register ────────────────────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('enable2fa').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, enable2fa } = req.body;

  try {
    // Check if user already exists (parameterized query)
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Hash password with bcrypt (cost factor 12)
    const hash = await bcrypt.hash(password, 12);

    // Generate 2FA secret if requested
    let twoFactorSecret = null;
    let twoFactorQR = null;
    if (enable2fa) {
      const secret = speakeasy.generateSecret({ name: `SecureAuth (${email})` });
      twoFactorSecret = secret.base32;
      twoFactorQR = secret.otpauth_url;
    }

    // Insert user (parameterized)
    await db.run(
      'INSERT INTO users (name, email, password_hash, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, twoFactorSecret, enable2fa ? 1 : 0]
    );

    res.status(201).json({
      message: 'Account created successfully.',
      twoFactorQR: twoFactorQR || null,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Parameterized query prevents SQL injection
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    // Constant-time comparison via bcrypt even if user doesn't exist
    const dummyHash = '$2a$12$invalidhashfortimingnormalization0000000000000000000000';
    const passwordMatch = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.two_factor_enabled) {
      // Store partial auth state — don't fully log in yet
      req.session.pendingUserId = user.id;
      return res.status(200).json({ requires2FA: true });
    }

    // Fully authenticated — regenerate session to prevent fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.userId = user.id;
      req.session.userName = user.name;
      res.json({ message: 'Login successful.', user: { name: user.name, email: user.email } });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── Verify 2FA ───────────────────────────────────────────────────────────────
router.post('/verify-2fa', [
  body('token').trim().isLength({ min: 6, max: 6 }).isNumeric(),
], async (req, res) => {
  if (!req.session.pendingUserId) {
    return res.status(401).json({ error: 'No pending authentication.' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token } = req.body;

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.session.pendingUserId]);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token,
      window: 1, // Allow 30s clock drift
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid or expired 2FA code.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.userId = user.id;
      req.session.userName = user.name;
      res.json({ message: '2FA verified.', user: { name: user.name, email: user.email } });
    });
  } catch (err) {
    console.error('2FA error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed.' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// ─── Get current user ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, name, email, two_factor_enabled, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
