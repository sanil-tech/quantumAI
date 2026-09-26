# ============================================================
# deploy-to-vps.ps1
# Jalankan dari Windows PowerShell (BUKAN dari SSH session)
# Usage: .\scripts\deploy-to-vps.ps1
# ============================================================

$VPS_HOST = "root@167.86.122.238"
$VPS_PATH = "/var/www/quantumai"
$LOCAL = "c:\Users\sanil\OneDrive\Desktop\studyquest-ai-1\quantumAI"

$files = @(
  @{ src = "$LOCAL\apps\decision-agent\src\services\aiDecisionEngine.ts"; dst = "$VPS_PATH/apps/decision-agent/src/services/" },
  @{ src = "$LOCAL\apps\decision-agent\src\services\signalIntelligenceService.ts"; dst = "$VPS_PATH/apps/decision-agent/src/services/" },
  @{ src = "$LOCAL\apps\decision-agent\src\services\researchLearningEngine.ts"; dst = "$VPS_PATH/apps/decision-agent/src/services/" },
  @{ src = "$LOCAL\src\server\routes\decision.ts"; dst = "$VPS_PATH/src/server/routes/" },
  @{ src = "$LOCAL\src\server\services\pairDailyRangeService.ts"; dst = "$VPS_PATH/src/server/services/" },
  @{ src = "$LOCAL\src\server\services\demoAutonomousTradingService.ts"; dst = "$VPS_PATH/src/server/services/" },
  @{ src = "$LOCAL\src\server\services\autonomousMarketScannerService.ts"; dst = "$VPS_PATH/src/server/services/" },
  @{ src = "$LOCAL\src\server\services\base44AiService.ts"; dst = "$VPS_PATH/src/server/services/" },
  @{ src = "$LOCAL\src\server\services\strategyEngineService.ts"; dst = "$VPS_PATH/src/server/services/" },
  @{ src = "$LOCAL\src\server\services\validation\signalValidationGate.ts"; dst = "$VPS_PATH/src/server/services/validation/" },
  @{ src = "$LOCAL\src\components\AdaptiveLearningModal.tsx"; dst = "$VPS_PATH/src/components/" },
  @{ src = "$LOCAL\src\components\UserDashboard.tsx"; dst = "$VPS_PATH/src/components/" },
  @{ src = "$LOCAL\src\components\Header.tsx"; dst = "$VPS_PATH/src/components/" },
  @{ src = "$LOCAL\src\components\VipSubscriberCockpit.tsx"; dst = "$VPS_PATH/src/components/" },
  @{ src = "$LOCAL\src\components\InteractiveTradeStatisticsCockpit.tsx"; dst = "$VPS_PATH/src/components/" },
  @{ src = "$LOCAL\src\components\onboarding\ClientExperienceHub.tsx"; dst = "$VPS_PATH/src/components/onboarding/" },
  @{ src = "$LOCAL\src\components\onboarding\CommercialOnboardingModal.tsx"; dst = "$VPS_PATH/src/components/onboarding/" }
)

Write-Host "=== QuantumAI VPS Deploy ===" -ForegroundColor Cyan
ssh $VPS_HOST "mkdir -p $VPS_PATH/src/components/onboarding $VPS_PATH/src/server/services/validation $VPS_PATH/apps/decision-agent/src/services"

$ok = 0; $fail = 0
foreach ($f in $files) {
  $name = Split-Path $f.src -Leaf
  Write-Host "[UPLOAD] $name" -ForegroundColor Yellow
  scp $f.src "${VPS_HOST}:$($f.dst)"
  if ($LASTEXITCODE -eq 0) { Write-Host "  OK" -ForegroundColor Green; $ok++ }
  else { Write-Host "  GAGAL" -ForegroundColor Red; $fail++ }
}

Write-Host "`nUpload: $ok OK, $fail gagal"
if ($fail -eq 0) {
  Write-Host "[BUILD+RESTART]" -ForegroundColor Yellow
  ssh $VPS_HOST "cd /var/www/quantumai && npm run build 2>&1 | tail -3 && pm2 restart quantum-engine && pm2 status"
  Write-Host "DONE!" -ForegroundColor Green
}
