import re
import shutil
from pathlib import Path
from uuid import uuid4


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        if not re.fullmatch(r"[a-zA-Z0-9_./-]+", key) or key.startswith("/") or any(part in (".", "..", "") for part in key.split("/")):
            raise ValueError("Clave de storage inválida")
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Clave fuera del storage")
        return path

    def size(self, key: str) -> int:
        return self.path(key).stat().st_size

    def download(self, key: str, destination: Path, limit: int) -> None:
        count = 0
        with self.path(key).open("rb") as source, destination.open("wb") as target:
            while block := source.read(512 * 1024):
                count += len(block)
                if count > limit:
                    raise ValueError("upload_too_large")
                target.write(block)

    def put(self, key: str, source: Path, content_type: str = 'image/jpeg') -> None:
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + f".part-{uuid4().hex}")
        try:
            shutil.copyfile(source, temporary)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)

    def copy_from(self, source: "LocalStorage", source_key: str, target_key: str) -> None:
        if not isinstance(source, LocalStorage):
            raise ValueError("La publicación local requiere assets locales")
        self.put(target_key, source.path(source_key))

    def upload_url(self, key: str, expires: int) -> None:
        return None

    def read_url(self, key: str, expires: int) -> None:
        return None
