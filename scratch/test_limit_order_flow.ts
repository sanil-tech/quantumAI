import { canonicalExecutionRouter } from '../src/server/routes/execution';

console.log('✅ canonicalExecutionRouter loaded successfully!');
console.log('Broker adapters registered:', Object.keys((canonicalExecutionRouter as any).brokerAdapters || {}));
process.exit(0);
