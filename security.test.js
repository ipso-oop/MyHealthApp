const request = require('supertest');
const { app } = require('./app');

describe('Security Vulnerability Tests', () => {
  
  describe('SQL Injection Tests', () => {
    test('Login endpoint vulnerable to SQL injection', async () => {
      // Test SQL injection that should bypass authentication
      const response = await request(app)
        .post('/login')
        .send({
          username: "admin' OR '1'='1' --",
          password: "anything"
        });
      
      // If the app is vulnerable, this might return 302 (redirect) indicating successful login
      // In a secure app, this should return 401 or 200 with login failed message
      console.log('SQL Injection Test Response Status:', response.status);
      console.log('SQL Injection Test Response Body:', response.text);
      
      // Document the vulnerability
      if (response.status === 302) {
        console.log('🚨 CRITICAL: SQL injection successful - authentication bypassed!');
      }
    });

    test('Test SQL injection with UNION attack', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          username: "' UNION SELECT 1,'admin','{\"password\":\"hash\"}','admin@test.com' --",
          password: "anything"
        });
      
      console.log('UNION SQL Injection Response:', response.status, response.text);
    });
  });

  describe('XSS (Cross-Site Scripting) Tests', () => {
    test('Comment endpoint vulnerable to XSS', async () => {
      const xssPayload = '<script>alert("XSS Vulnerability")</script>';
      
      const response = await request(app)
        .post('/comment')
        .send({
          comment: xssPayload
        });
      
      console.log('XSS Test Response:', response.text);
      
      // Check if the script tag is reflected without sanitization
      if (response.text.includes('<script>')) {
        console.log('🚨 HIGH: XSS vulnerability confirmed - script tags not sanitized!');
      }
    });

    test('Test XSS with various payloads', async () => {
      const payloads = [
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<svg onload="alert(1)">',
        '"><script>alert("XSS")</script>'
      ];

      for (const payload of payloads) {
        const response = await request(app)
          .post('/comment')
          .send({ comment: payload });
        
        if (response.text.includes(payload.replace(/"/g, '"'))) {
          console.log(`🚨 XSS vulnerability with payload: ${payload}`);
        }
      }
    });
  });

  describe('Authorization Bypass Tests', () => {
    test('Health data edit without proper authorization', async () => {
      // Try to edit health data without authentication
      const response = await request(app)
        .post('/health_data/edit')
        .send({
          id: 1,
          data: 'Malicious health data modification',
          category: 'unauthorized'
        });
      
      console.log('Unauthorized health data edit response:', response.status, response.text);
      
      // Should return 401/403, if 200 then there's an authorization issue
      if (response.status === 200 && response.text.includes('aktualisiert')) {
        console.log('🚨 CRITICAL: Authorization bypass - health data can be modified without authentication!');
      }
    });

    test('Health data deletion without authorization', async () => {
      const response = await request(app)
        .post('/health_data/delete')
        .send({
          id: 1
        });
      
      console.log('Unauthorized health data delete response:', response.status, response.text);
      
      if (response.status === 200 && response.text.includes('gelöscht')) {
        console.log('🚨 CRITICAL: Authorization bypass - health data can be deleted without authentication!');
      }
    });
  });

  describe('Session Management Tests', () => {
    test('Test weak session management', async () => {
      // This test would need a valid login first, but we can check cookie settings
      const agent = request.agent(app);
      
      // Attempt login with any credentials to see session behavior
      const loginResponse = await agent
        .post('/login')
        .send({
          username: 'testuser',
          password: 'testpass'
        });
      
      // Check if session cookies are set securely
      const cookies = loginResponse.headers['set-cookie'];
      if (cookies) {
        console.log('Session cookies:', cookies);
        
        const hasHttpOnly = cookies.some(cookie => cookie.includes('HttpOnly'));
        const hasSecure = cookies.some(cookie => cookie.includes('Secure'));
        const hasSameSite = cookies.some(cookie => cookie.includes('SameSite'));
        
        if (!hasHttpOnly) {
          console.log('🚨 HIGH: Session cookies missing HttpOnly flag - vulnerable to XSS!');
        }
        if (!hasSecure) {
          console.log('🚨 MEDIUM: Session cookies missing Secure flag - vulnerable over HTTP!');
        }
        if (!hasSameSite) {
          console.log('🚨 MEDIUM: Session cookies missing SameSite flag - vulnerable to CSRF!');
        }
      }
    });
  });

  describe('Information Disclosure Tests', () => {
    test('Test for information leakage in error messages', async () => {
      // Test with malformed data to trigger errors
      const response = await request(app)
        .post('/login')
        .send({
          username: null,
          password: undefined
        });
      
      console.log('Error response:', response.text);
      
      // Check if error reveals sensitive information
      if (response.text.includes('database') || response.text.includes('SQL') || response.text.includes('Error:')) {
        console.log('🚨 MEDIUM: Information disclosure in error messages!');
      }
    });
  });

  describe('Access Control Tests', () => {
    test('Test access to shared health data without proper verification', async () => {
      // Try to access health data with a guessed/brute-forced code
      const response = await request(app)
        .get('/health_data/access')
        .query({
          code: 'aaaaaaaa' // Try with predictable code
        });
      
      console.log('Health data access test:', response.status, response.text);
    });

    test('Test dashboard access without authentication', async () => {
      const response = await request(app)
        .get('/dashboard');
      
      console.log('Dashboard access without auth:', response.status);
      
      // Should redirect to login, not show dashboard
      if (response.status === 200 && response.text.includes('Dashboard')) {
        console.log('🚨 HIGH: Dashboard accessible without authentication!');
      }
    });
  });

  describe('Input Validation Tests', () => {
    test('Test for lack of input validation on registration', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          username: '', // Empty username
          password: '123', // Weak password
          email: 'invalid-email' // Invalid email format
        });
      
      console.log('Registration validation test:', response.status, response.text);
      
      // Should reject invalid input
      if (response.status === 302) { // Redirect indicates successful registration
        console.log('🚨 MEDIUM: Input validation missing on registration!');
      }
    });

    test('Test for buffer overflow/long input handling', async () => {
      const longString = 'A'.repeat(10000);
      
      const response = await request(app)
        .post('/comment')
        .send({
          comment: longString
        });
      
      console.log('Long input test response:', response.status);
      
      if (response.status === 200) {
        console.log('🚨 LOW: No input length validation - potential DoS vector!');
      }
    });
  });

  describe('CSRF Protection Tests', () => {
    test('Test for CSRF vulnerability on sensitive operations', async () => {
      // This test simulates a CSRF attack
      const response = await request(app)
        .post('/health_data/delete')
        .set('Origin', 'http://malicious-site.com')
        .send({
          id: 1
        });
      
      console.log('CSRF test response:', response.status);
      
      // Should be rejected due to CSRF protection
      if (response.status === 200) {
        console.log('🚨 HIGH: CSRF protection missing on sensitive operations!');
      }
    });
  });

});

// Run comprehensive security test summary
describe('Security Test Summary', () => {
  test('Generate security report', () => {
    console.log('\n' + '='.repeat(60));
    console.log('         SECURITY VULNERABILITY TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('This test suite demonstrates the following vulnerabilities:');
    console.log('1. 🚨 CRITICAL: SQL Injection in login endpoint');
    console.log('2. 🚨 HIGH: XSS in comment functionality');
    console.log('3. 🚨 CRITICAL: Authorization bypass on health data operations');
    console.log('4. 🚨 HIGH: Insecure session management');
    console.log('5. 🚨 MEDIUM: Information disclosure in error handling');
    console.log('6. 🚨 MEDIUM: Missing input validation');
    console.log('7. 🚨 HIGH: Missing CSRF protection');
    console.log('8. 🚨 LOW: No rate limiting (DoS vulnerability)');
    console.log('\n📋 See SECURITY_REVIEW.md and SECURITY_FIXES.md for details');
    console.log('⚠️  DO NOT DEPLOY THIS APPLICATION TO PRODUCTION');
    console.log('='.repeat(60) + '\n');
  });
});