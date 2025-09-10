# Security Fixes and Remediation Guide

This document provides specific fixes for the security vulnerabilities identified in the MyHealthApp security review.

## 1. Fix SQL Injection Vulnerability

### Current Vulnerable Code:
```javascript
db.get(`SELECT * FROM users WHERE username = '${req.body.username}'`,(err, user) => {
```

### Secure Fix:
```javascript
// Use parameterized queries to prevent SQL injection
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Input validation
  if (!username || !password) {
    return res.status(400).send('Username and password required');
  }
  
  // Parameterized query prevents SQL injection
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error('Database error:', err.message); // Don't log user data
      return res.status(500).send('Internal server error');
    }
    
    if (user && bcrypt.compareSync(password, user.password)) {
      // Secure session management (see session fixes below)
      const sessionId = crypto.randomBytes(32).toString('hex');
      // Store session in database/Redis with expiration
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 60 * 1000 // 30 minutes
      });
      res.redirect('/dashboard');
    } else {
      res.status(401).send('Invalid credentials');
    }
  });
});
```

## 2. Fix Authorization Bypass

### Current Vulnerable Code:
```javascript
app.post('/health_data/edit', (req, res) => {
  const { id, data, category } = req.body;
  db.run("UPDATE health_data SET data = ?, category = ? WHERE id = ?", [data, category, id], (err) => {
```

### Secure Fix:
```javascript
// Add authentication middleware
function requireAuth(req, res, next) {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) {
    return res.status(401).redirect('/login');
  }
  
  // Verify session (implement session store)
  db.get("SELECT user_id FROM sessions WHERE session_id = ? AND expires_at > ?", 
    [sessionId, new Date()], (err, session) => {
    if (err || !session) {
      return res.status(401).redirect('/login');
    }
    req.userId = session.user_id;
    next();
  });
}

// Secure health data edit with ownership verification
app.post('/health_data/edit', requireAuth, (req, res) => {
  const { id, data, category } = req.body;
  const userId = req.userId;
  
  // Input validation
  if (!id || !data || !category) {
    return res.status(400).send('Missing required fields');
  }
  
  // Verify ownership before allowing edit
  db.get("SELECT user_id FROM health_data WHERE id = ?", [id], (err, record) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).send('Internal server error');
    }
    
    if (!record) {
      return res.status(404).send('Health data not found');
    }
    
    if (record.user_id !== userId) {
      return res.status(403).send('Access denied');
    }
    
    // Now safe to update
    db.run("UPDATE health_data SET data = ?, category = ? WHERE id = ? AND user_id = ?", 
      [data, category, id, userId], (err) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).send('Update failed');
      }
      res.send('Data updated successfully');
    });
  });
});
```

## 3. Fix XSS Vulnerability

### Current Vulnerable Code:
```javascript
app.post('/comment', (req, res) => {
  const comment = req.body.comment;
  res.send(`Kommentar erhalten: ${comment}`);
});
```

### Secure Fix:
```javascript
const validator = require('validator');

app.post('/comment', requireAuth, (req, res) => {
  const { comment } = req.body;
  
  // Input validation
  if (!comment || comment.trim().length === 0) {
    return res.status(400).send('Comment cannot be empty');
  }
  
  if (comment.length > 1000) {
    return res.status(400).send('Comment too long');
  }
  
  // Sanitize input to prevent XSS
  const sanitizedComment = validator.escape(comment);
  
  // Store in database instead of reflecting directly
  db.run("INSERT INTO comments (user_id, comment, created_at) VALUES (?, ?, ?)", 
    [req.userId, sanitizedComment, new Date()], (err) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).send('Failed to save comment');
    }
    res.send('Comment saved successfully');
  });
});
```

## 4. Fix Information Disclosure

### Current Vulnerable Code:
```javascript
console.log(req.body.username);
console.log(req.body.password);
console.log(user);
```

### Secure Fix:
```javascript
// Remove all sensitive data logging
// Use structured logging with appropriate levels
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log authentication attempts without sensitive data
app.post('/login', (req, res) => {
  const { username } = req.body;
  
  // Log only non-sensitive information
  logger.info('Login attempt', { 
    username: username ? 'provided' : 'missing',
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // ... rest of secure login logic
});
```

## 5. Fix Insecure Session Management

### Current Vulnerable Code:
```javascript
res.cookie('user', user.id);
```

### Secure Fix:
```javascript
const crypto = require('crypto');

// Create sessions table
const createSessionsTable = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )
`;

// Secure session creation
function createSession(userId, res) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  
  db.run("INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)",
    [sessionId, userId, expiresAt], (err) => {
    if (err) {
      console.error('Session creation failed:', err.message);
      return false;
    }
    
    res.cookie('sessionId', sessionId, {
      httpOnly: true, // Prevent XSS access
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // CSRF protection
      maxAge: 30 * 60 * 1000 // 30 minutes
    });
    return true;
  });
}

// Session cleanup
function cleanupExpiredSessions() {
  db.run("DELETE FROM sessions WHERE expires_at < ?", [new Date()], (err) => {
    if (err) console.error('Session cleanup failed:', err.message);
  });
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
```

## 6. Fix Weak Access Code Generation

### Current Vulnerable Code:
```javascript
const accessCode = Math.random().toString(36).substr(2, 8);
```

### Secure Fix:
```javascript
const crypto = require('crypto');

// Generate cryptographically secure access code
function generateSecureAccessCode() {
  return crypto.randomBytes(16).toString('hex'); // 32 character hex string
}

app.post('/health_data/share', requireAuth, (req, res) => {
  const { healthDataId } = req.body;
  const userId = req.userId;
  
  // Verify ownership
  db.get("SELECT user_id FROM health_data WHERE id = ?", [healthDataId], (err, record) => {
    if (err || !record || record.user_id !== userId) {
      return res.status(404).send('Health data not found');
    }
    
    const accessCode = generateSecureAccessCode();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    db.run("INSERT INTO access_links (health_data_id, access_code, expires_at) VALUES (?, ?, ?)", 
      [healthDataId, accessCode, expiresAt], (err) => {
      if (err) {
        console.error('Access link creation failed:', err.message);
        return res.status(500).send('Failed to create access link');
      }
      res.json({ 
        message: 'Access link created successfully',
        accessCode: accessCode,
        expiresAt: expiresAt 
      });
    });
  });
});
```

## 7. Add Security Headers

```javascript
const helmet = require('helmet');

// Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Add rate limiting
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/login', loginLimiter, /* ... login handler ... */);
```

## 8. Input Validation

```javascript
const { body, validationResult } = require('express-validator');

// Validation middleware for registration
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .isAlphanumeric()
    .withMessage('Username must be 3-30 characters, alphanumeric only'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character')
];

app.post('/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  // ... rest of registration logic
});
```

## 9. Update Dependencies

```bash
# Update package.json with secure versions
npm audit fix
npm update

# Add security-focused packages
npm install helmet express-rate-limit express-validator winston validator
```

## 10. Security Testing

Create `security.test.js`:

```javascript
const request = require('supertest');
const { app } = require('./app');

describe('Security Tests', () => {
  test('Should prevent SQL injection in login', async () => {
    const response = await request(app)
      .post('/login')
      .send({
        username: "admin' OR '1'='1' --",
        password: "anything"
      });
    
    expect(response.status).not.toBe(302); // Should not redirect (login success)
    expect(response.status).toBe(401); // Should be unauthorized
  });
  
  test('Should sanitize XSS in comments', async () => {
    const response = await request(app)
      .post('/comment')
      .send({
        comment: "<script>alert('xss')</script>"
      });
    
    expect(response.text).not.toContain('<script>');
  });
  
  test('Should require authentication for health data operations', async () => {
    const response = await request(app)
      .post('/health_data/edit')
      .send({
        id: 1,
        data: "malicious data",
        category: "test"
      });
    
    expect(response.status).toBe(401);
  });
});
```

This comprehensive fix addresses all identified security vulnerabilities with industry-standard security practices.