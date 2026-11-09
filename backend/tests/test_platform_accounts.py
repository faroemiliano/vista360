from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.auth.security import now


def administrator(client, monkeypatch):
    user = client.register('platform@example.com').json()['user']
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [UUID(user['id'])])
    return user


def test_account_directory_is_only_for_platform_admin(clients, monkeypatch):
    visitor = clients()
    assert visitor.get('/admin/accounts').status_code == 401
    owner = clients(); owner.register()
    assert owner.get('/business/access').json()['platform_admin'] is False
    assert owner.get('/admin/accounts').status_code == 403
    admin = clients(); administrator(admin, monkeypatch)
    result = admin.get('/admin/accounts')
    assert result.status_code == 200 and result.headers['cache-control'] == 'no-store'
    assert result.json()['summary']['total'] == 2
    assert owner.get('/admin/accounts?q=platform').status_code == 403
    # Tener un estudio propio o intentar elevar el perfil no concede administración.
    assert owner.get('/workspaces').json()[0]['is_owner']
    assert owner.mutate('PUT', '/auth/profile', {'display_name': 'Intruso', 'account_kind': 'company', 'platform_admin': True}).status_code == 422
    assert owner.get('/admin/accounts').status_code == 403


def test_directory_counts_profiles_filters_and_pagination(clients, database, monkeypatch):
    admin = clients(); admin_user = administrator(admin, monkeypatch)
    company = clients(); company_user = company.register('empresa@example.com').json()['user']
    assert company.mutate('PUT', '/auth/profile', {
        'display_name': 'Ana Fotógrafa', 'account_kind': 'company',
        'company_name': 'Luz Fotografía', 'phone': '+5491123456789',
    }).status_code == 200
    studio = company.get('/workspaces').json()[0]
    company.mutate('PUT', f"/workspaces/{studio['id']}", {'name': 'Estudio Luz'})
    individual = clients(); individual.register('particular@example.com')
    with Session(database[0]) as db:
        db.get(User, UUID(company_user['id'])).email_verified_at = now()
        db.commit()
    body = admin.get('/admin/accounts?limit=2').json()
    assert body['summary'] == {'total': 3, 'individuals': 2, 'companies': 1, 'verified': 1}
    assert body['filtered_total'] == 3 and len(body['items']) == 2
    next_page = admin.get('/admin/accounts?offset=2&limit=2').json()
    assert len(next_page['items']) == 1
    assert len({u['id'] for u in body['items'] + next_page['items']}) == 3
    company_row = admin.get('/admin/accounts?kind=company').json()
    assert company_row['summary'] == body['summary'] and company_row['filtered_total'] == 1
    row = company_row['items'][0]
    assert row == dict(id=company_user['id'], display_name='Ana Fotógrafa', email='empresa@example.com',
        phone='+5491123456789', account_kind='company', company_name='Luz Fotografía',
        studio_name='Estudio Luz', created_at=company_user['created_at'], email_verified=True, platform_admin=False)
    for term in ('LUZ', 'Ana', 'empresa@', '23456789', 'Estudio Luz'):
        result = admin.http.get('/api/v1/admin/accounts', params={'q': term}).json()
        assert result['filtered_total'] == 1 and result['items'][0]['id'] == company_user['id']
    for term in ('%', '_', 'inexistente'):
        result = admin.http.get('/api/v1/admin/accounts', params={'q': term}).json()
        assert result['filtered_total'] == 0 and result['items'] == []
    admins = admin.get('/admin/accounts?q=platform@').json()['items']
    assert admins[0]['id'] == admin_user['id'] and admins[0]['platform_admin'] is True
    # Cambiar datos de contacto no cambia el permiso, vinculado al ID interno.
    with Session(database[0]) as db:
        db.get(User, UUID(admin_user['id'])).email_normalized = 'nuevo-admin@example.com'
        db.commit()
    assert admin.get('/admin/accounts').status_code == 200


def test_directory_validates_bounded_search_and_pagination(clients, monkeypatch):
    admin = clients(); administrator(admin, monkeypatch)
    for params in ({'limit': 0}, {'limit': 101}, {'offset': -1}, {'kind': 'admin'}, {'q': 'a' * 161}):
        assert admin.http.get('/api/v1/admin/accounts', params=params).status_code == 422
    empty = admin.get('/admin/accounts?offset=100').json()
    assert empty['items'] == [] and empty['filtered_total'] == 1
