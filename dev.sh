#!/bin/bash


DIR="$(cd "$(dirname "$0")" && pwd)"

kill $(lsof -t -i:3001) 2>/dev/null
kill $(lsof -t -i:5173) 2>/dev/null
sleep 0.5

cd "$DIR/admin/be" && npm run dev &
BE_PID=$!

cd "$DIR/admin/fe" && npm run dev &
FE_PID=$!

trap 'kill $BE_PID $FE_PID 2>/dev/null; exit 0' SIGINT SIGTERM

echo ""
echo "  Backend  → http://127.0.0.1:3001"
echo "  Frontend → http://127.0.0.1:5173"
echo ""
echo "  Press any key to stop both servers..."
echo ""

read -rsn1

kill $BE_PID $FE_PID 2>/dev/null
wait $BE_PID $FE_PID 2>/dev/null
echo "Servers stopped."
