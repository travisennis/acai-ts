#!/bin/bash
# Benchmark script to test Node.js compile cache performance

set -e

echo "Benchmarking acai startup performance..."
echo ""

# Clear cache first
echo "Clearing compile cache..."
rm -rf ~/Library/Caches/acai-compile-cache 2>/dev/null || true
rm -rf ~/.cache/acai-compile-cache 2>/dev/null || true

# First run (cold start, no cache)
echo "1. Cold start (no cache):"
time ./bin/acai --version

# Second run (should use cache)
echo ""
echo "2. Warm start (with cache):"
time ./bin/acai --version

# Third run (cache should be fully warmed)
echo ""
echo "3. Third run (cache fully warmed):"
time ./bin/acai --version

echo ""
echo "Benchmark complete!"