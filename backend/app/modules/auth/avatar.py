"""Avatar privado: imagen estática de hasta 5 MiB, recodificada a JPEG de 256 px."""
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select

from app.core.config import get_settings
from app.modules.assets.models import ProcessingJob
from app.modules.auth.models import User
from app.modules.auth.security import now
from app.storage.factory import get_storage

MAX_BYTES = 5 * 1024 * 1024


def optimize(source, target):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(source, formats=['JPEG', 'PNG', 'WEBP']) as image:
                if image.width * image.height > 16000000 or max(image.size) > 8192 or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('dimensions')
                image.verify()
            with Image.open(source, formats=['JPEG', 'PNG', 'WEBP']) as image:
                image.load()
                oriented = ImageOps.exif_transpose(image)
                fitted = ImageOps.fit(oriented, (256, 256), method=Image.Resampling.LANCZOS)
                if 'A' in fitted.getbands() or fitted.mode == 'P':
                    rgba = fitted.convert('RGBA')
                    rgb = Image.new('RGB', rgba.size, 'white'); rgb.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    rgb = fitted.convert('RGB')
                rgb.info.clear()
                rgb.save(target, 'JPEG', quality=85, optimize=True, exif=b'')
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Elegí una foto JPEG, PNG o WebP estática de hasta 16 megapíxeles') from None


def clear(db, user):
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    if user.avatar_key:
        db.add(ProcessingJob(kind='delete_file', details={'backend': user.avatar_backend, 'key': user.avatar_key}))
    user.avatar_key = user.avatar_backend = None
    db.commit()
    return user


def save(db, user, source):
    with TemporaryDirectory(prefix='vision360-avatar-output-') as directory:
        target = Path(directory) / 'avatar.jpg'
        optimize(source, target)
        backend = get_settings().storage_backend
        key = f'avatars/{user.id}/{uuid4()}.jpg'
        # Intención de limpieza durable antes de escribir el archivo; también cubre un crash.
        cleanup = ProcessingJob(kind='delete_file', details={'backend': backend, 'key': key}, available_at=now()+timedelta(hours=1))
        db.add(cleanup); db.commit()
        try:
            get_storage(backend).put(key, target)
        except Exception:
            raise HTTPException(503, 'No se pudo guardar la foto. Volvé a intentarlo.') from None
        user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
        cleanup = db.scalar(select(ProcessingJob).where(ProcessingJob.id == cleanup.id).with_for_update().execution_options(populate_existing=True))
        if not cleanup or cleanup.status != 'queued':
            raise HTTPException(409, 'La carga venció. Volvé a subir la foto.')
        if user.avatar_key:
            db.add(ProcessingJob(kind='delete_file', details={'backend': user.avatar_backend, 'key': user.avatar_key}))
        user.avatar_key, user.avatar_backend = key, backend
        db.delete(cleanup)
        db.commit()
        return user
