import dotenv from 'dotenv';
dotenv.config();

// Enforce paper/mock isolation during test runs to prevent accidental demo trade dispatch
process.env.EXECUTION_ENVIRONMENT = 'PAPER';
process.env.CTRADER_CLIENT_ID = 'mock_demo_client_12345';
