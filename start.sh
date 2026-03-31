#!/bin/bash
set -e

echo ""
echo "  ◈ SIGIL v4 — AI Dependency Execution Firewall"
echo "  ─────────────────────────────────────────────"
echo ""

# Backend
echo "→ Starting backend..."
cd backend
if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  Created venv"
fi
source venv/bin/activate
pip install -r requirements.txt -q
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACK_PID=$!
echo "  ✓ Backend: http://127.0.0.1:8000  (PID: $BACK_PID)"
cd ..

# Frontend
echo "→ Starting frontend..."
cd frontend
npm install -q
npm run dev &
FRONT_PID=$!
echo "  ✓ Frontend: http://127.0.0.1:3000  (PID: $FRONT_PID)"
cd ..

echo ""
echo "  ✓ SIGIL v4 running!"
echo ""
echo "  Open:  http://127.0.0.1:3000"
echo "  API:   http://127.0.0.1:8000/docs"
echo ""
echo "  Quick start:"
echo "    node sdk/bin/sigil.js init"
echo "    node sdk/bin/sigil.js install pandas"
echo "    node sdk/bin/sigil.js install crypto-stealer"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

trap "kill $BACK_PID $FRONT_PID 2>/dev/null; exit" INT TERM
wait
