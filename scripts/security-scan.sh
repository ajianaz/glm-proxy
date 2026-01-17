#!/bin/bash
# Security scanning script using Trivy
# Usage: ./scripts/security-scan.sh

set -e

IMAGE_NAME="${IMAGE_NAME:-proxy-gateway:latest}"
SEVERITY="${SEVERITY:-CRITICAL,HIGH}"

echo "🔒 Security Scanning with Trivy"
echo "================================"
echo "Image: $IMAGE_NAME"
echo "Severity: $SEVERITY"
echo ""

# Check if Trivy is installed
if ! command -v trivy &> /dev/null; then
    echo "⚠️  Trivy not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install trivy
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
        echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
        sudo apt-get update
        sudo apt-get install trivy
    else
        echo "❌ Please install Trivy manually: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
        exit 1
    fi
fi

# Build image if it doesn't exist
if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
    echo "📦 Building Docker image..."
    docker build -t "$IMAGE_NAME" .
fi

# Run vulnerability scan
echo "🔍 Scanning for vulnerabilities..."
echo ""

trivy image \
    --severity "$SEVERITY" \
    --exit-code 1 \
    --no-progress \
    --scanners vuln,config \
    "$IMAGE_NAME"

echo ""
echo "✅ Security scan completed!"

# Optional: Generate report
if [[ "$1" == "--report" ]]; then
    echo "📄 Generating report..."
    trivy image \
        --severity "$SEVERITY" \
        --format json \
        --output security-report.json \
        "$IMAGE_NAME"
    echo "📋 Report saved to: security-report.json"
fi
