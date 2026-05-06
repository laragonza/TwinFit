#!/bin/bash

cd "$(dirname "$0")" || exit 1

clear
echo "==================================================="
echo "    Arrancando los servidores de TwinFit..."
echo "==================================================="
echo

if ! command -v deno >/dev/null 2>&1; then
    echo "[ERROR] No encuentro Deno en este Mac."
    echo "Instala Deno desde https://deno.com/ y vuelve a intentarlo."
    echo
    read -r -p "Pulsa Enter para salir..."
    exit 1
fi

if [ ! -f ".env" ] || [ ! -f "backend/.env" ]; then
    echo "[AVISO] No encuentro los archivos .env."
    echo "Crea .env y backend/.env a partir de los .env.example antes de probar todo."
    echo
fi

cleanup() {
    echo
    echo "Cerrando servidores de TwinFit..."
    if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null; fi
    if [ -n "$FRONTEND_PID" ]; then kill "$FRONTEND_PID" 2>/dev/null; fi
    exit 0
}

trap cleanup INT TERM

echo "[INFO] Iniciando backend en http://localhost:4000 ..."
deno task backend > backend/twinfit-backend.log 2>&1 &
BACKEND_PID=$!

echo "[INFO] Iniciando frontend en http://127.0.0.1:4509 ..."
deno task frontend > twinfit-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 4

echo "[INFO] Abriendo la aplicacion en el navegador..."
open "http://127.0.0.1:4509/"

echo
echo "==================================================="
echo "[EXITO] TwinFit esta corriendo."
echo "Deja esta ventana abierta mientras uses la aplicacion."
echo "Para cerrar los servidores, pulsa Ctrl+C."
echo "==================================================="

wait
