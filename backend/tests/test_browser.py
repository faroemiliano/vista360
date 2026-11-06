import os
from pathlib import Path
import subprocess

import pytest

from app.core.config import get_settings


@pytest.mark.skipif(os.environ.get("RUN_BROWSER_TESTS") != "1", reason="Activar RUN_BROWSER_TESTS=1 para pruebas HTTP reales en navegador")
def test_frontend_and_real_api(database):
    import json
    from uuid import uuid4
    from sqlalchemy.orm import Session
    from app.modules.auth.models import User
    from app.modules.auth.service import password_hasher
    from app.modules.workspaces.service import ensure_owned_workspace
    admin_id = uuid4()
    with Session(database[0]) as db:
        user = User(id=admin_id, email_normalized='browser-admin@example.com', password_hash=password_hasher.hash('Test-password-123!'))
        db.add(user)
        db.flush()
        ensure_owned_workspace(db, user)
        db.commit()
    environment = os.environ.copy()
    environment.update({
        "DATABASE_URL": database[1], "CSRF_SECRET": get_settings().csrf_secret.get_secret_value(),
        "APP_ENV": "test", "COOKIE_SECURE": "false", "TEST_API": "1", "RESEND_API_KEY": "",
        "PLATFORM_ADMIN_USER_IDS": json.dumps([str(admin_id)]),
        "TEST_ADMIN_EMAIL": "browser-admin@example.com",
    })
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    from PIL import Image
    import tempfile
    with tempfile.TemporaryDirectory(prefix="vista360-browser-input-") as input_directory:
        fixture = Path(input_directory) / "panorama.jpg"
        Image.new("RGB", (1024, 512), "teal").save(fixture, "JPEG")
        environment["TEST_PANORAMA_FILE"] = str(fixture)
        browser_command = ["npm", "run", "test:e2e"]
        if environment.get("BROWSER_TEST_GREP"):
            browser_command += ["--", "--grep", environment["BROWSER_TEST_GREP"]]
        result = subprocess.run(browser_command, cwd=frontend, env=environment,
                                capture_output=True, text=True, timeout=240)
    assert result.returncode == 0, result.stdout + result.stderr
