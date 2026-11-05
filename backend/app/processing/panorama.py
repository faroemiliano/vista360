"""Validador JPEG ejecutado en un subprocess con timeout, fuera de HTTP."""
import hashlib
import json
from pathlib import Path
import sys
import warnings

from PIL import Image, ImageFile, UnidentifiedImageError


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(512 * 1024):
            digest.update(block)
    return digest.hexdigest()


def validate(source: Path, directory: Path, limits: dict) -> dict:
    Image.MAX_IMAGE_PIXELS = limits["pixels"]
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    try:
        with Image.open(source, formats=["JPEG"]) as image:
            width, height = image.size
            if width != height * 2 or width > limits["width"] or height > limits["height"] or width * height > limits["pixels"]:
                return {"error": "invalid_dimensions"}
            if image.getexif().get(274, 1) != 1:
                return {"error": "invalid_orientation"}
            image.verify()
        with Image.open(source, formats=["JPEG"]) as image:
            # Decodificación JPEG reducida en origen: evita buffers de cientos de MiB.
            image.draft("RGB", (4096, 2048))
            image.load()  # Detecta datos corruptos/incompletos, no sólo la cabecera.
            rgb = image.convert("RGB")
            variants = []
            for target_width in sorted({min(width, 4096), min(width, 2048)}, reverse=True):
                target = rgb.resize((target_width, target_width // 2), Image.Resampling.LANCZOS)
                target.info.clear()
                filename = f"panorama-{target_width}.jpg"
                path = directory / filename
                target.save(path, format="JPEG", quality=85, optimize=True, exif=b"")
                target.close()
                variants.append({"filename": filename, "width": target_width, "height": target_width // 2,
                                 "size": path.stat().st_size, "checksum": sha256(path)})
            rgb.close()
        if sum(variant["size"] for variant in variants) > 20 * 1024 * 1024:
            return {"error": "upload_too_large"}
        return {"width": width, "height": height, "checksum": sha256(source), "variants": variants}
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return {"error": "invalid_dimensions"}
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return {"error": "invalid_image"}


if __name__ == "__main__":
    options = json.loads(sys.stdin.read())
    result = validate(Path(options["source"]), Path(options["directory"]), options["limits"])
    print(json.dumps(result))
