"""API y worker locales en una terminal: .venv/bin/python -m app.dev."""
import argparse
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys

from app.demo import supervise


def main():
    parser = argparse.ArgumentParser(description='Iniciar API y worker locales juntos')
    parser.add_argument('--port', type=int, default=8001, help='Puerto de la API (por defecto: 8001)')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('El puerto debe estar entre 1 y 65535')
    os.chdir(Path(__file__).resolve().parents[1])
    logging.basicConfig(level=logging.INFO)
    # Evita iniciar otro worker si ya hay un backend usando este puerto.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(('127.0.0.1', args.port))
        except OSError:
            parser.exit(1, f'El puerto {args.port} está ocupado. Detené el backend anterior con Ctrl+C o elegí --port.\n')
    from app.core.config import get_settings
    get_settings()
    # Si PostgreSQL no responde o falla una migración, no se inician procesos.
    subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], check=True, timeout=180)
    supervise([
        [sys.executable, '-m', 'uvicorn', 'app.main:app', '--reload', '--reload-dir', 'app',
         '--host', '127.0.0.1', '--port', str(args.port)],
        [sys.executable, '-m', 'app.processing.worker'],
    ])


if __name__ == '__main__':
    main()
