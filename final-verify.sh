#!/bin/bash
# Final verification: cold bootstrap + all 3 test layers (API E2E + Security + Real Browser).
ROOT=/home/user/affiliate-launch-kit
cd $ROOT

echo "############ 1. COLD BOOTSTRAP ############"
bash dev-up.sh 2>&1 | tail -4

echo ""
echo "############ 2. BACKEND API E2E (expect 23/23) ############"
bash backend/run-e2e.sh 2>&1 | sed -n '/E2E RESULTS/,/============/p' | grep -E "PASS|FAIL|REAL|checks"

echo ""
echo "############ 3. SECURITY AUDIT (expect 11/11) ############"
bash backend/run-audit.sh 2>&1 | sed -n '/AUDIT RESULTS/,/===========/p' | grep -E "PASS|FAIL"

echo ""
echo "############ 4. REAL BROWSER E2E (expect 25/25) ############"
bash e2e/run-browser-e2e.sh 2>&1 | grep -E "PASS|FAIL|REAL BROWSER E2E:"

echo ""
echo "############ 5. RESPONSIVE E2E (8 devices, expect 56/56) ############"
bash e2e/run-responsive.sh 2>&1 | grep -E "RESPONSIVE E2E:"

echo ""
echo "############ 6. FRONTEND BUILD ############"
cd $ROOT/frontend && npm run build 2>&1 | grep -E "✓ built|transformed|error"
cd $ROOT
echo ""
echo "############ VERIFICATION COMPLETE ############"
