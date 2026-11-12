from app.core.config import get_settings
import json
import pytest


def test_render_environment_keeps_explicit_origin_and_normalizes_driver(monkeypatch):
    from app.demo import configure
    monkeypatch.setenv('DATABASE_URL', 'postgresql://demo:example@db/demo?sslmode=require')
    monkeypatch.setenv('CORS_ORIGINS', '["https://custom.example.com"]')
    configure()
    import os
    assert os.environ['DATABASE_URL'] == 'postgresql+psycopg://demo:example@db/demo?sslmode=require'
    assert json.loads(os.environ['CORS_ORIGINS']) == ['https://custom.example.com']


def test_render_environment_infers_exact_https_origin(monkeypatch):
    from app.demo import configure
    import os
    monkeypatch.setenv('CORS_ORIGINS', '')
    monkeypatch.setenv('RENDER_EXTERNAL_URL', 'https://vision360-demo.onrender.com/')
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://demo:example@db/demo')
    configure()
    assert json.loads(os.environ['CORS_ORIGINS']) == ['https://vision360-demo.onrender.com']


@pytest.mark.parametrize('origin', ['', 'http://example.com', 'https://example.com/path', 'https://user@example.com'])
def test_render_environment_rejects_missing_or_invalid_origin(monkeypatch, origin):
    from app.demo import configure
    monkeypatch.setenv('CORS_ORIGINS', '')
    monkeypatch.setenv('RENDER_EXTERNAL_URL', origin)
    with pytest.raises(RuntimeError):
        configure()


def test_same_origin_frontend_deep_links_and_api_are_separate(clients, tmp_path, monkeypatch):
    frontend = tmp_path / 'frontend'
    (frontend / 'assets').mkdir(parents=True)
    (frontend / 'index.html').write_text('<html>Vision360 demo</html>')
    (frontend / 'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    (frontend / 'assets' / 'app.js').write_text('console.log("demo")')
    monkeypatch.setenv('FRONTEND_DIST_DIR', str(frontend))
    get_settings.cache_clear()
    try:
        client = clients()
        for path in ['/', '/inicio', '/visor', '/studio', '/studio/clientes/00112233-4455-6677-8899-aabbccddeeff', '/studio/mi-cuenta/seguridad', '/studio/trabajos/ejemplo?paso=connections', '/tour/casa', '/embed/casa', '/solicitar/ejemplo', '/cuenta/verificar', '/cuenta/restablecer']:
            response = client.http.get(path)
            assert response.status_code == 200
            assert 'Vision360 demo' in response.text
            assert response.headers['cache-control'] == 'no-cache'
        assert client.http.get('/assets/app.js').status_code == 200
        assert client.http.get('/favicon.svg').status_code == 200
        assert client.http.get('/health').json() == {'status': 'ok'}
        assert client.get('/auth/session').status_code == 200
        assert client.get('/tours').status_code == 401
        for path in ['/api/v1/missing', '/.env', '/Dockerfile', '/backend/.env', '/assets/missing.js']:
            response = client.http.get(path, headers={'Accept': 'text/html'})
            assert response.status_code == 404
            assert 'Vision360 demo' not in response.text
        missing = client.http.get('/pagina-inexistente', headers={'Accept': 'text/html'})
        assert missing.status_code == 404
        assert 'Vision360 demo' in missing.text
        assert missing.headers['cache-control'] == 'no-cache'
        assert 'Vision360 demo' not in client.http.get('/pagina-inexistente').text
        client.register()
        assert client.get('/workspaces').status_code == 200
    finally:
        get_settings.cache_clear()
