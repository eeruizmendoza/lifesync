#!/bin/bash

###############################################################################
# Test Coturn STUN/TURN server connectivity
#
# Usage: ./scripts/test-coturn.sh [ip] [port] [username] [password]
###############################################################################

set -e

# Get parameters or use defaults
STUN_IP=${1:-${COTURN_EXTERNAL_IP:-127.0.0.1}}
STUN_PORT=${2:-3478}
TURN_USERNAME=${3:-${COTURN_USERNAME:-turnuser}}
TURN_PASSWORD=${4:-${COTURN_PASSWORD:-password}}

echo "🧪 Testing Coturn STUN/TURN Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Server: $STUN_IP:$STUN_PORT"
echo "Username: $TURN_USERNAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if server is reachable
echo "1️⃣  Testing connectivity..."
if nc -zv "$STUN_IP" "$STUN_PORT" 2>&1 | grep -q "succeeded\|open"; then
    echo "✅ Server is reachable at $STUN_IP:$STUN_PORT"
else
    echo "⚠️  Server may not be reachable. Checking with timeout..."
    if timeout 2 bash -c "echo > /dev/tcp/$STUN_IP/$STUN_PORT" 2>/dev/null; then
        echo "✅ TCP connection successful"
    else
        echo "⚠️  Cannot reach server at $STUN_IP:$STUN_PORT"
        echo "   Verify firewall settings and that Coturn is running"
    fi
fi

echo ""

# Test with stunclient if available
if command -v stunclient &> /dev/null; then
    echo "2️⃣  Testing STUN protocol..."
    if stunclient "$STUN_IP" "$STUN_PORT" 2>&1 | grep -q "Primary"; then
        echo "✅ STUN protocol working"
    else
        echo "⚠️  STUN test inconclusive"
    fi
    echo ""
fi

# Check if Coturn service is running
echo "3️⃣  Checking Coturn service status..."
if command -v systemctl &> /dev/null; then
    if sudo systemctl is-active --quiet coturn; then
        echo "✅ Coturn service is running"
    else
        echo "❌ Coturn service is NOT running"
        echo "   Start it with: sudo systemctl start coturn"
    fi
elif command -v service &> /dev/null; then
    if sudo service coturn status | grep -q "running"; then
        echo "✅ Coturn service is running"
    else
        echo "❌ Coturn service is NOT running"
    fi
fi

echo ""

# Show configuration details
echo "4️⃣  Configuration for clients:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "STUN Server:"
echo "  stun:$STUN_IP:$STUN_PORT"
echo ""
echo "TURN Server (UDP):"
echo "  turn:$TURN_USERNAME:$TURN_PASSWORD@$STUN_IP:$STUN_PORT?transport=udp"
echo ""
echo "TURN Server (TCP):"
echo "  turn:$TURN_USERNAME:$TURN_PASSWORD@$STUN_IP:$STUN_PORT?transport=tcp"
echo ""
echo "Environment variables:"
echo "  export STUN_SERVERS='stun:$STUN_IP:$STUN_PORT'"
echo "  export TURN_SERVERS='[{\"urls\":[\"turn:$STUN_IP:$STUN_PORT\"],\"username\":\"$TURN_USERNAME\",\"credential\":\"$TURN_PASSWORD\"}]'"
echo ""

# Show logs if there are errors
if [[ -f "/var/log/coturn/turnserver.log" ]]; then
    echo "5️⃣  Recent Coturn logs:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    sudo tail -10 /var/log/coturn/turnserver.log 2>/dev/null || echo "   (Cannot read logs - permission denied)"
fi

echo ""
echo "✅ Test complete!"
echo ""
echo "To test with a real WebRTC connection, use these URLs in your client:"
echo "  - STUN: stun:$STUN_IP:$STUN_PORT"
echo "  - TURN: turn:$TURN_USERNAME:***@$STUN_IP:$STUN_PORT"
