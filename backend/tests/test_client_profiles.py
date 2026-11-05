from uuid import uuid4
import pytest

from test_business import organization, org_tour


@pytest.mark.parametrize('kind', ['agency', 'individual'])
def test_profile_creation_update_clear_and_preserved_tours(clients, kind):
    owner = clients(); owner.register()
    data = dict(name='Cliente', kind=kind, legal_name='Empresa SA' if kind == 'agency' else None,
                email='contact@example.com', phone='+54 11 1234', locality='Palermo',
                contact_name='Ana' if kind == 'agency' else None, address='Calle 123', notes='Nota privada')
    created = owner.mutate('POST', '/organizations', data)
    assert created.status_code == 201
    org = created.json()
    for field, value in data.items():
        assert org[field] == value
    tour = org_tour(owner, org)
    path = f"/organizations/{org['id']}"
    updated = owner.mutate('PUT', path, dict(name='Nuevo nombre', email='new@example.com', phone='123', locality='Belgrano'))
    assert updated.status_code == 200
    assert updated.json()['workspace_id'] == org['workspace_id']
    assert updated.json()['kind'] == kind
    assert owner.get('/organizations').json()[0]['email'] == 'new@example.com'
    assert owner.get(f"/tours/{tour['id']}").status_code == 200
    cleared = owner.mutate('PUT', path, dict(name='Nuevo nombre', email='  ', phone='', notes=''))
    assert cleared.status_code == 200
    assert cleared.json()['email'] is None
    assert cleared.json()['phone'] is None
    assert cleared.json()['notes'] is None
    assert owner.mutate('DELETE', path).status_code == 204
    assert owner.get(f"/tours/{tour['id']}").status_code == 200
    assert owner.mutate('PUT', path, {'name': 'No reactivar'}).status_code == 409


def test_profile_authorization_validation_and_csrf(clients):
    owner = clients(); owner.register()
    other = clients(); other.register('other@example.com')
    org = organization(owner)
    path = f"/organizations/{org['id']}"
    assert other.mutate('PUT', path, {'name': 'Ajeno'}).status_code == 404
    assert owner.http.put('/api/v1' + path, json={'name': 'Sin CSRF'}).status_code == 403
    for role in ['viewer', 'editor', 'admin']:
        assert owner.mutate('PUT', path + '/members', {'email': 'other@example.com', 'role': role}).status_code == 200
        result = other.mutate('PUT', path, {'name': 'Editado'})
        assert result.status_code == (200 if role == 'admin' else 403)
    for data in [{'name': ' '}, {'name': 'Bien', 'email': 'invalido'}, {'name': 'Bien', 'phone': 'x' * 51},
                 {'name': 'Bien', 'notes': 'x' * 2001}, {'name': 'Bien', 'workspace_id': str(uuid4())},
                 {'name': 'Bien', 'kind': 'individual'}]:
        assert owner.mutate('PUT', path, data).status_code == 422
