// Set required env vars before any module imports
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_cronapi';
process.env.NODE_ENV = 'test';
