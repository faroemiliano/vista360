import logging
from types import SimpleNamespace
from uuid import uuid4

from botocore.exceptions import ClientError
from fastapi import HTTPException
import pytest

from app.modules.auth import avatar


@pytest.mark.parametrize('error,diagnostic', [
    (ClientError({'Error': {'Code': 'AccessDenied', 'Message': 'private-secret-message'},
                  'ResponseMetadata': {'HTTPStatusCode': 403,
                                       'HTTPHeaders': {'Authorization': 'private-secret-header'}}},
                 'PutObject'), 'exception=ClientError s3_code=AccessDenied http_status=403'),
    (RuntimeError('https://private-endpoint.example/private-key?secret=private-secret-value'),
     'exception=RuntimeError s3_code=unavailable http_status=unavailable'),
    (ClientError({'Error': {'Code': 'private-secret\nhttps://private-endpoint.example',
                           'Message': 'private-secret-message'},
                  'ResponseMetadata': {'HTTPStatusCode': 'private-secret-status'}},
                 'PutObject'), 'exception=ClientError s3_code=unavailable http_status=unavailable'),
])
def test_failed_avatar_write_logs_safe_diagnostic_and_preserves_response(monkeypatch, caplog, error, diagnostic):
    queued = []
    db = SimpleNamespace(add=queued.append, commit=lambda: None)
    user = SimpleNamespace(id=uuid4(), avatar_key='existing-avatar', avatar_backend='s3')
    monkeypatch.setattr(avatar, 'optimize', lambda source, target: None)
    monkeypatch.setattr(avatar, 'get_settings', lambda: SimpleNamespace(storage_backend='s3'))

    def fail_write(key, target):
        raise error

    monkeypatch.setattr(avatar, 'get_storage', lambda backend: SimpleNamespace(put=fail_write))
    with caplog.at_level(logging.ERROR, logger=avatar.__name__):
        with pytest.raises(HTTPException) as caught:
            avatar.save(db, user, None)

    assert caught.value.status_code == 503
    assert caught.value.detail == 'No se pudo guardar la foto. Volvé a intentarlo.'
    assert user.avatar_key == 'existing-avatar'
    assert len(queued) == 1 and queued[0].kind == 'delete_file'
    records = [record for record in caplog.records if record.name == avatar.__name__]
    assert len(records) == 1
    assert records[0].getMessage() == 'avatar_storage_write_failed ' + diagnostic
    assert records[0].exc_info is None
    assert 'private-secret' not in caplog.text
    assert 'private-endpoint' not in caplog.text
    assert str(user.id) not in caplog.text
    assert queued[0].details['key'] not in caplog.text
