#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
INSTALL_MODE="${INSTALL_MODE:-auto}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[error] Python not found: $PYTHON_BIN"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm is not installed. Install Node.js first."
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "[warn] .env file not found at project root."
  echo "       Copy .env.example -> .env and fill required values."
fi

if [[ ! -d "$VENV_DIR" ]]; then
  echo "[setup] Creating virtualenv at $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

echo "[info] Python: $(python -V 2>&1)"

# Check if backend runtime deps are available.
if ! python - <<'PY' >/dev/null 2>&1
import fastapi, uvicorn
print(fastapi.__version__, uvicorn.__version__)
PY
then
  if [[ "$INSTALL_MODE" == "never" ]]; then
    echo "[error] Backend dependencies missing and INSTALL_MODE=never"
    exit 1
  fi

  echo "[setup] Installing backend dependencies"
  python -m pip install --upgrade pip setuptools wheel
  python -m pip install -r "$ROOT_DIR/backend/requirements.txt"
fi

if [[ ! -d "$ROOT_DIR/Devfest/node_modules" ]]; then
  echo "[setup] Installing frontend dependencies"
  (cd "$ROOT_DIR/Devfest" && npm install)
fi

cleanup() {
  echo
  echo "[shutdown] Stopping processes..."
  kill "${BACKEND_PID:-0}" "${FRONTEND_PID:-0}" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

echo "[start] Backend on http://localhost:${BACKEND_PORT}"
(
  cd "$ROOT_DIR/backend"
  python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

# Give backend a short head start.
sleep 2

echo "[start] Frontend on http://localhost:${FRONTEND_PORT}"
(
  cd "$ROOT_DIR/Devfest"
  npm run dev -- --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo "[ready] ThirdEye demo stack is starting."
echo "        Backend docs:  http://localhost:${BACKEND_PORT}/docs"
echo "        Frontend app:  http://localhost:${FRONTEND_PORT}"

wait "$BACKEND_PID" "$FRONTEND_PID"
