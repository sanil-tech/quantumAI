# QuantumAI cTrader DEMO Operational Runbook

This runbook describes the procedure for running, validating, and troubleshooting the QuantumAI cTrader DEMO integration in Phase 3B.

---

## 1. Architecture Overview

```
QuantumAI AI Engine
        ↓
   TradeProposal
        ↓
  Risk Governance (HMAC Approval Token)
        ↓
  ExecutionSafetyGate (DEMO Mode Guard)
        ↓
   ExecutionRouter
        ↓
   BrokerRegistry
        ↓
   CTraderAdapter
        ↓
 cTrader DEMO Account (Open API 2.0)
        ↓
 BrokerSyncService (Webhook Inbox & Reconciliation)
        ↓
 PostgreSQL Source of Truth
        ↓
 LearningService (Idempotent Post-Mortem Reviews)
```

---

## 2. Required Environment Variables

Set the following variables in `.env` or environment secrets:

```env
EXECUTION_ENVIRONMENT=DEMO

# cTrader DEMO Open API Credentials (SERVER-SIDE ONLY)
CTRADER_CLIENT_ID=your_ctrader_client_id
CTRADER_CLIENT_SECRET=your_ctrader_client_secret
CTRADER_ACCOUNT_ID=your_ctrader_account_id
CTRADER_ACCESS_TOKEN=your_ctrader_access_token
CTRADER_HOST=live.ctraderapi.com
CTRADER_PORT=5035

# Admin API Key (Secures Admin Endpoints)
ADMIN_API_KEY=your_secure_admin_api_key
```

> [!CAUTION]
> **SECURITY NOTICE**: Never commit credentials to Git. Never log secrets. Never expose `CTRADER_CLIENT_SECRET` or `CTRADER_ACCESS_TOKEN` in Vite/React environment variables or API responses.

---

## 3. Credential Setup Instructions

1. Log into Spotware / cTrader Open API Portal (https://openapi.ctrader.com).
2. Create an Application in DEMO mode to obtain `Client ID` and `Client Secret`.
3. Generate an OAuth Access Token for your DEMO Trading Account.
4. Save credentials in `.env` as specified above.

---

## 4. Connectivity Test

Run the safe connectivity validation CLI command:

```bash
npm run ctrader:demo:connectivity
```

Expected Output:
```json
{
  "status": "CONNECTED",
  "connected": true,
  "environment": "DEMO",
  "brokerId": "ctrader-broker-01",
  "accountId": "5877***",
  "balance": 100000,
  "equity": 100000,
  "currency": "USD",
  "leverage": 100
}
```

---

## 5. Controlled Trade Test

To execute a single controlled DEMO trade with explicit confirmation:

```bash
DEMO_CONFIRM_EXECUTION=true npm run ctrader:demo:trade
```

This routes an order through `Risk Governance` -> `RiskApprovalToken` -> `ExecutionRouter` -> `CTraderAdapter`.

---

## 6. Position Close & Learning Verification

Execute closure via Admin API or script:
```bash
POST /api/admin/ctrader/close-demo-trade
Header: x-admin-key: <ADMIN_API_KEY>
Body: { "positionId": "pos_ctrader_demo_...", "closePrice": 1.0920 }
```

Verify that:
1. PostgreSQL position status updates to `CLOSED`.
2. `realized_profit` and `closed_at` are persisted.
3. `EventTypes.TradeClosed` is published.
4. `LearningService` generates a post-mortem review.

---

## 7. Webhook & Reconciliation

Incoming cTrader webhooks are received at `/api/webhooks/ctrader` and processed idempotently via `BrokerSyncService`:
- Webhooks are recorded in `broker_webhook_events` with state `RECEIVED` -> `PROCESSED`.
- Canonical PostgreSQL `positions` table is updated with `broker_order_id`, `broker_position_id`, `broker_deal_id`, and `reconciliation_status = MATCHED`.

---

## 8. Troubleshooting

| Error Code | Cause | Remediation |
| :--- | :--- | :--- |
| `CTRADER_DEMO_CREDENTIALS_MISSING` | Missing cTrader secrets in `.env` | Ensure `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, `CTRADER_ACCOUNT_ID`, `CTRADER_ACCESS_TOKEN` are set. |
| `CTRADER_AUTH_FAILURE` | Invalid or expired OAuth Access Token | Re-authenticate on cTrader Open API portal and update `CTRADER_ACCESS_TOKEN`. |
| `PAPER_ENVIRONMENT_VIOLATION` | Requested cTrader broker in `PAPER` mode | Set `EXECUTION_ENVIRONMENT=DEMO`. |
| `LIVE_EXECUTION_DISARMED` | Requested `LIVE` execution without arming flag | Phase 3B strictly disallows LIVE execution. Keep `EXECUTION_ENVIRONMENT=DEMO`. |

---

## 9. Rollback Procedure

If cTrader DEMO connectivity encounters errors:
1. Revert `EXECUTION_ENVIRONMENT` to `PAPER`.
2. The system automatically switches execution routing to `PaperBrokerAdapter`.
3. Open positions in PostgreSQL remain intact and untouched.
