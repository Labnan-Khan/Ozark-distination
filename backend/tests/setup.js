process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rental_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_PROVIDER = 'memory';
process.env.EMAIL_PROVIDER = 'console';
