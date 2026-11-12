import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

import pytest

BACKEND = Path(__file__).resolve().parents[1]


def wait_for(check, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(.1)
    raise AssertionError('El proceso no alcanzó el estado esperado')


@pytest.mark.parametrize('unexpected_exit', [False, True])
def test_supervisor_stops_both_children(tmp_path, unexpected_exit):
    child = "import os,sys,time; from pathlib import Path; Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(float(sys.argv[2]))"
    files = [tmp_path / 'api.pid', tmp_path / 'worker.pid']
    commands = [[sys.executable, '-c', child, str(files[0]), '60'],
                [sys.executable, '-c', child, str(files[1]), '1' if unexpected_exit else '60']]
    driver = 'from app.demo import supervise; supervise(' + repr(commands) + ')'
    with (tmp_path / 'supervisor.log').open('w+') as output:
        process = subprocess.Popen([sys.executable, '-c', driver], cwd=BACKEND, stdout=output, stderr=output)
        try:
            wait_for(lambda: all(path.exists() for path in files))
            if not unexpected_exit:
                process.send_signal(signal.SIGINT)
            assert process.wait(timeout=15) == (1 if unexpected_exit else 0)
            for path in files:
                with pytest.raises(ProcessLookupError):
                    os.kill(int(path.read_text()), 0)
        finally:
            if process.poll() is None:
                process.terminate(); process.wait(timeout=15)


def test_local_launcher_refuses_busy_port_without_starting_worker():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0)); listener.listen()
        port = listener.getsockname()[1]
        result = subprocess.run([sys.executable, '-m', 'app.dev', '--port', str(port)], cwd=BACKEND,
                                capture_output=True, text=True, timeout=10)
    assert result.returncode == 1 and 'está ocupado' in result.stderr
    assert 'Worker iniciado' not in result.stderr


def test_local_launcher_starts_api_and_worker_and_stops_on_ctrl_c(database, tmp_path):
    from app.core.config import get_settings
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    environment = {**os.environ, 'DATABASE_URL': database[1], 'APP_ENV': 'test',
                   'CSRF_SECRET': get_settings().csrf_secret.get_secret_value(), 'RESEND_API_KEY': ''}
    log = tmp_path / 'dev.log'
    with log.open('w+') as output:
        process = subprocess.Popen([sys.executable, '-m', 'app.dev', '--port', str(port)],
                                   cwd=BACKEND, env=environment, stdout=output, stderr=output)
        def ready():
            if process.poll() is not None:
                raise AssertionError('El iniciador terminó antes de estar listo')
            try:
                with urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                    return response.status == 200 and 'Worker iniciado' in log.read_text()
            except OSError:
                return False
        try:
            wait_for(ready, timeout=30)
            process.send_signal(signal.SIGINT)
            assert process.wait(timeout=20) == 0
            assert 'Application shutdown complete' in log.read_text()
        finally:
            if process.poll() is None:
                process.terminate(); process.wait(timeout=20)
