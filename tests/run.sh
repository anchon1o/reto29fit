#!/bin/bash
# Arranca el servidor local, ejecuta el script indicado y lo para.
cd "$(dirname "$0")/.." && python3 dev_server.py 5173 >/dev/null 2>&1 & SRV=$!
sleep 1.2; cd "$(dirname "$0")"; PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node "${1:-e2e.mjs}"; R=$?; kill $SRV; exit $R
