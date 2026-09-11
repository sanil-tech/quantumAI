import 'dotenv/config';
import { AutomatedTechnicalAuditService } from '../src/server/services/automatedTechnicalAuditService';

async function testAudit() {
  const service = AutomatedTechnicalAuditService.getInstance();
  const report = await service.runAuditCycle();
  console.log('Technical Audit Report:', JSON.stringify(report, null, 2));
  process.exit(0);
}

testAudit().catch(console.error);
