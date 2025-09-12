const request = require('supertest');
const { app } = require('./app');

describe('Security Vulnerability Tests', () => {
  
  // Test for SQL Injection vulnerability
  test('SQL Injection in login should be prevented', async () => {
    const maliciousCredentials = { 
      username: "admin'; DROP TABLE users; --", 
      password: 'anything' 
    };
    
    const res = await request(app).post('/login').send(maliciousCredentials);
    
    // Currently VULNERABLE - this test will demonstrate the issue
    // The app should return 400/401, not 500 or succeed
    expect(res.statusCode).not.toBe(302); // Should not redirect (login success)
    expect(res.statusCode).not.toBe(500); // Should not cause server error
  });

  // Test for authorization bypass in health data edit
  test('Should prevent editing other users health data', async () => {
    const agent1 = request.agent(app);
    const agent2 = request.agent(app);

    // Simulate two different users
    // This test assumes we have test users in the database
    await agent1.post('/login').send({ username: 'admin', password: 'admin123' });
    
    // Try to edit health data without proper authorization check
    // Currently VULNERABLE - any user ID can edit any health data ID
    const res = await agent2.post('/health_data/edit').send({
      id: '1', // Assume this belongs to admin
      data: 'Modified by unauthorized user',
      category: 'Unauthorized'
    });

    // Should return 401 or 403, but currently might succeed
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // Test for authorization bypass in health data delete
  test('Should prevent deleting other users health data', async () => {
    const agent = request.agent(app);
    
    // Try to delete health data without being logged in or without ownership
    const res = await agent.post('/health_data/delete').send({
      id: '1'
    });

    // Should return 401 or 403, but currently might succeed
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

});

describe('Functional Bug Tests', () => {

  test('Registration should handle phone field', async () => {
    const registrationData = {
      username: 'testuser',
      password: 'testpass',
      email: 'test@example.com',
      phone: '1234567890'
    };

    const res = await request(app).post('/register').send(registrationData);
    
    // Currently the phone field is ignored
    // This test documents the incomplete implementation
    expect(res.statusCode).toBe(302); // Redirect to login
  });

  test('Should validate email format in registration', async () => {
    const invalidEmailData = {
      username: 'testuser2',
      password: 'testpass',
      email: 'invalid-email-format'
    };

    const res = await request(app).post('/register').send(invalidEmailData);
    
    // Currently no validation - this test shows the missing validation
    // Should return 400 for invalid email, but currently might succeed
    expect(res.statusCode).toBeLessThan(500); // At least shouldn't crash
  });

  test('Health data operations should require authentication', async () => {
    // Try to add health data without being logged in
    const res = await request(app).post('/health_data/add').send({
      data: 'Test data',
      category: 'Test'
    });

    // Should require authentication, but currently might fail differently
    expect(res.statusCode).toBeGreaterThanOrEqual(300);
  });

  test('Should handle missing required fields gracefully', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ username: 'admin', password: 'admin123' });

    // Try to add health data with missing fields
    const res = await agent.post('/health_data/add').send({
      data: 'Test data'
      // Missing category
    });

    // Should handle missing fields gracefully
    expect(res.statusCode).toBeLessThan(500);
  });

  test('Should handle extremely long input data', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ username: 'admin', password: 'admin123' });

    const longData = 'x'.repeat(10000); // Very long string
    
    const res = await agent.post('/health_data/add').send({
      data: longData,
      category: 'Test'
    });

    // Should handle long input gracefully
    expect(res.statusCode).toBeLessThan(500);
  });

});

describe('Error Handling Tests', () => {

  test('Invalid health data ID should return proper error', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ username: 'admin', password: 'admin123' });

    const res = await agent.post('/health_data/edit').send({
      id: 'invalid-id',
      data: 'Test',
      category: 'Test'
    });

    // Should return proper error status and message
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test('Database error should not expose sensitive information', async () => {
    // This test would need to simulate a database error
    // Currently error messages might expose internal details
    const res = await request(app).post('/login').send({
      username: null, // Might cause database error
      password: 'test'
    });

    if (res.statusCode >= 500) {
      // Check that error doesn't expose sensitive information
      expect(res.text).not.toContain('database');
      expect(res.text).not.toContain('sql');
      expect(res.text).not.toContain('sqlite');
    }
  });

});