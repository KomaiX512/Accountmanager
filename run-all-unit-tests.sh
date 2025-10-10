#!/bin/bash

# Run all unit tests for Gemini AI Edit feature

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                    GEMINI AI EDIT - UNIT TEST SUITE                        ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0
PASSED=0

# Test 1: Image Fetch
echo "▶ Running Test 1: Image Fetching..."
node test-unit-1-image-fetch.js
if [ $? -eq 0 ]; then
  PASSED=$((PASSED + 1))
  echo "✅ Test 1 PASSED"
else
  FAILED=$((FAILED + 1))
  echo "❌ Test 1 FAILED"
fi
echo ""

# Test 2: Base64 Conversion
echo "▶ Running Test 2: Base64 Conversion..."
node test-unit-2-base64-conversion.js
if [ $? -eq 0 ]; then
  PASSED=$((PASSED + 1))
  echo "✅ Test 2 PASSED"
else
  FAILED=$((FAILED + 1))
  echo "❌ Test 2 FAILED"
fi
echo ""

# Test 3: Gemini API
echo "▶ Running Test 3: Gemini API..."
node test-unit-3-gemini-api.js
if [ $? -eq 0 ]; then
  PASSED=$((PASSED + 1))
  echo "✅ Test 3 PASSED"
else
  FAILED=$((FAILED + 1))
  echo "❌ Test 3 FAILED"
fi
echo ""

# Test 4: Backend Endpoint
echo "▶ Running Test 4: Backend Endpoint..."
node test-unit-4-backend-endpoint.js
if [ $? -eq 0 ]; then
  PASSED=$((PASSED + 1))
  echo "✅ Test 4 PASSED"
else
  FAILED=$((FAILED + 1))
  echo "❌ Test 4 FAILED"
fi
echo ""

# Test 5: Service Layer
echo "▶ Running Test 5: Frontend Service Layer..."
node test-unit-5-service-layer.js
if [ $? -eq 0 ]; then
  PASSED=$((PASSED + 1))
  echo "✅ Test 5 PASSED"
else
  FAILED=$((FAILED + 1))
  echo "❌ Test 5 FAILED"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                              TEST SUMMARY                                  ║"
echo "╠════════════════════════════════════════════════════════════════════════════╣"
echo "║  Passed: $PASSED/5                                                               ║"
echo "║  Failed: $FAILED/5                                                               ║"
if [ $FAILED -eq 0 ]; then
  echo "║  Status: ✅ ALL TESTS PASSED                                                ║"
else
  echo "║  Status: ❌ SOME TESTS FAILED                                               ║"
fi
echo "╚════════════════════════════════════════════════════════════════════════════╝"

exit $FAILED
