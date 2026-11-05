"""Supervisor para una única instancia web de demostración, sin keep-alive."""
import logging
import os
import signal
import subprocess
import sys
import time
from urllib.parse import urlsplit
import json

logger = logging.getLogger('vista360.demo')


def configure():
    # Render entrega PostgreSQL sin el nombre del driver de SQLAlchemy.
    database = os.environ.get('DATABASE_URL', '')
    for prefix in ('postgres://', 'postgresql://'):
        if database.startswith(prefix):
            os.environ['DATABASE_URL'] = 'postgresql+psycopg://' + database[len(prefix):]
            break
    if not os.environ.get('CORS_ORIGINS'):
        origin = os.environ.get('RENDER_EXTERNAL_URL', '').rstrip('/')
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise RuntimeError('Configurar CORS_ORIGINS o RENDER_EXTERNAL_URL con el origen HTTPS del demo')
        os.environ['CORS_ORIGINS'] = json.dumps([origin])


def main():
    logging.basicConfig(level=logging.INFO)
    configure()
    # Validar variables antes de ejecutar migraciones o iniciar procesos.
    from app.core.config import get_settings
    get_settings()
    subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], check=True, timeout=180)
    children: list[subprocess.Popen] = []
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    def terminate(process, sig):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0',
            '--port', os.environ.get('PORT', '8000'), '--proxy-headers', '--forwarded-allow-ips', '*'], start_new_session=True))
        children.append(subprocess.Popen([sys.executable, '-m', 'app.processing.worker'], start_new_session=True))
        logger.info('Demo: API y worker iniciados; se detienen juntos al suspender el servicio')
        while not stopping:
            if any(process.poll() is not None for process in children):
                raise RuntimeError('Un proceso del demo terminó; se reiniciará el servicio completo')
            time.sleep(0.5)
    finally:
        for process in children:
            terminate(process, signal.SIGTERM)
        deadline = time.monotonic() + 10
        for process in children:
            try:
                process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        # Incluye cualquier subprocess de validación que todavía siga activo.
        for process in children:
            terminate(process, signal.SIGKILL)
            process.wait()


if __name__ == '__main__':
    main()
