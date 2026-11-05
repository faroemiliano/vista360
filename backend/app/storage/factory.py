from app.core.config import get_settings
from app.storage.base import Storage
from app.storage.local import LocalStorage
from app.storage.s3 import S3Storage


def get_storage(backend: str | None = None) -> Storage:
    settings = get_settings()
    choice = backend or settings.storage_backend
    if choice == "local":
        if settings.app_env == "production":
            raise RuntimeError("Storage local no está habilitado en producción")
        return LocalStorage(settings.storage_local_dir)
    if choice == "s3":
        return S3Storage(settings)
    raise ValueError("Backend de almacenamiento inválido")


def get_public_storage(backend: str) -> Storage:
    settings = get_settings()
    if backend == "local" and settings.app_env != "production":
        return LocalStorage(settings.storage_local_dir / "_public")
    if backend == "s3" and settings.s3_public_bucket and settings.public_media_base_url:
        return S3Storage(settings.model_copy(update={"s3_bucket": settings.s3_public_bucket}))
    raise ValueError("Publicación requiere bucket público separado y dominio de medios configurados")
