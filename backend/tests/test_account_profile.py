from io import BytesIO
from uuid import UUID

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User, AuthAction
from app.modules.auth import actions, mail
from app.modules.assets.models import ProcessingJob
from app.storage.factory import get_storage
from conftest import ORIGIN
from test_assets import drain, jpeg
from test_account_security import action_token


def profile(**updates):
    return dict(display_name='Emiliano Faro', account_kind='company', phone='+54 9 11 2345-6789', company_name='Farixio', **updates)


def upload(client, body, mime='image/jpeg'):
    return client.http.put('/api/v1/auth/avatar', content=body, headers={'Origin': ORIGIN, 'X-CSRF-Token': client.csrf, 'Content-Type': mime})


def test_profile_is_private_and_does_not_change_workspace_or_permissions(clients):
    owner = clients(); user = owner.register().json()['user']; before = owner.get('/workspaces').json()
    saved = owner.mutate('PUT', '/auth/profile', profile())
    assert saved.status_code == 200, saved.text
    assert saved.json()['phone'] == '+5491123456789'
    assert saved.json()['display_name'] == 'Emiliano Faro' and saved.json()['account_kind'] == 'company'
    assert owner.get('/workspaces').json() == before
    other = clients(); other.register('other@example.com')
    assert other.get('/auth/session').json()['user']['display_name'] == ''
    assert owner.get('/auth/session').json()['user']['display_name'] == 'Emiliano Faro'
    assert owner.mutate('PUT', '/auth/profile', {**profile(), 'email_normalized': 'steal@example.com'}).status_code == 422
    assert owner.mutate('PUT', '/auth/profile', {**profile(), 'account_kind': 'admin'}).status_code == 422
    assert clients().mutate('PUT', '/auth/profile', profile()).status_code == 401
    assert owner.http.put('/api/v1/auth/profile', json=profile()).status_code == 403
    assert owner.mutate('PUT', '/auth/profile', {**profile(), 'account_kind': 'individual'}).json()['company_name'] is None


def test_avatar_is_optimized_private_and_old_objects_cleaned(clients, database):
    owner = clients(); user_id = UUID(owner.register().json()['user']['id'])
    response = upload(owner, jpeg(exif=True))
    assert response.status_code == 200, response.text
    avatar_url = response.json()['avatar_url']
    assert 'avatar_key' not in response.json() and avatar_url.startswith('/api/v1/auth/avatar?v=')
    content = owner.http.get(avatar_url)
    assert content.status_code == 200 and content.headers['content-type'] == 'image/jpeg'
    with Image.open(BytesIO(content.content)) as image:
        assert image.size == (256, 256) and not image.getexif()
    assert clients().http.get(avatar_url).status_code == 401
    other = clients(); other.register('other@example.com')
    assert other.http.get(avatar_url).status_code == 404
    with Session(database[0]) as db:
        original_key = db.get(User, user_id).avatar_key
    assert upload(owner, jpeg(color='orange')).status_code == 200
    drain(database)
    assert not get_storage('local').path(original_key).exists()
    response = owner.mutate('DELETE', '/auth/avatar')
    assert response.status_code == 200 and response.json()['avatar_url'] is None
    drain(database)
    assert owner.get('/auth/avatar').status_code == 404
    assert not list(get_storage('local').root.rglob('*.jpg'))


def test_avatar_rejects_invalid_formats_bytes_dimensions_and_large_uploads(clients):
    owner = clients(); owner.register()
    assert upload(owner, b'<svg/>', 'image/svg+xml').status_code == 415
    assert upload(owner, b'not-an-image').status_code == 422
    assert upload(owner, b'x'*(5*1024*1024+1)).status_code == 413
    output = BytesIO(); Image.new('RGB', (8193, 1), 'teal').save(output, 'PNG')
    assert upload(owner, output.getvalue(), 'image/png').status_code == 422
    assert owner.get('/auth/session').json()['user']['avatar_url'] is None


def test_email_change_requires_password_and_confirmation_and_revokes_old_access(clients, database, monkeypatch):
    monkeypatch.setattr(get_settings(), 'public_app_url', 'https://vision.example.com')
    owner = clients(); owner.register()
    owner.mutate('POST', '/auth/forgot-password', {'email': 'owner@example.com'})
    reset_token, _ = action_token(database)
    payload = {'email': 'new@example.com', 'current_password': 'Test-password-123!'}
    assert owner.mutate('POST', '/auth/change-email', {**payload, 'current_password': 'Wrong-password-123!'}).status_code == 401
    assert owner.mutate('POST', '/auth/change-email', payload).status_code == 200
    state = owner.get('/auth/session').json()['user']
    assert state['email_normalized'] == 'owner@example.com' and state['pending_email'] == 'new@example.com'
    token, action_id = action_token(database, purpose='change_email')
    with Session(database[0]) as db:
        action = db.get(AuthAction, action_id); user = db.get(User, action.user_id)
        assert mail.payload(action, user)['to'] == ['new@example.com']
    visitor = clients()
    assert visitor.mutate('POST', '/auth/verify-email', {'token': token}).status_code == 400
    assert visitor.mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 200
    assert owner.get('/workspaces').status_code == 401
    assert visitor.mutate('POST', '/auth/reset-password', {'token': reset_token, 'password': 'New-password-456!'}).status_code == 400
    assert visitor.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': 'Test-password-123!'}).status_code == 401
    result = visitor.mutate('POST', '/auth/login', {'email': 'new@example.com', 'password': 'Test-password-123!'})
    assert result.status_code == 200 and result.json()['user']['email_verified_at']
    assert result.json()['user']['pending_email'] is None
    assert visitor.mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 400


def test_cancelling_or_replacing_email_request_invalidates_old_link(clients, database):
    owner = clients(); owner.register()
    payload = {'email': 'new@example.com', 'current_password': 'Test-password-123!'}
    owner.mutate('POST', '/auth/change-email', payload)
    token, _ = action_token(database, purpose='change_email')
    assert owner.mutate('DELETE', '/auth/change-email').json()['pending_email'] is None
    assert clients().mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 400
    owner.mutate('POST', '/auth/change-email', payload)
    token, _ = action_token(database, purpose='change_email')
    assert owner.mutate('POST', '/auth/change-email', {**payload, 'email': 'latest@example.com'}).status_code == 200
    assert clients().mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 400
    token, _ = action_token(database, purpose='change_email')
    assert clients().mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 200


def test_email_claimed_before_confirmation_does_not_replace_original(clients, database):
    owner = clients(); owner.register()
    owner.mutate('POST', '/auth/change-email', {'email': 'new@example.com', 'current_password': 'Test-password-123!'})
    token, _ = action_token(database, purpose='change_email')
    other = clients(); other.register('new@example.com')
    assert clients().mutate('POST', '/auth/confirm-email-change', {'token': token}).status_code == 409
    assert owner.get('/auth/session').json()['user']['email_normalized'] == 'owner@example.com'
    assert owner.get('/workspaces').status_code == 200
