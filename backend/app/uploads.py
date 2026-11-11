import io
import re
import secrets
import warnings
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.config import Settings
from app.errors import ApiException

Image.MAX_IMAGE_PIXELS = 20_000_000


def save_image(settings: Settings, content: bytes, declared_type: str) -> str:
    """同时验证大小、文件签名和真实解码，再重新编码去除元数据及附加内容。"""
    if not content or len(content) > settings.upload_limit:
        raise ApiException(413, "图片不能为空，且不能超过 5 MB", "UPLOAD_TOO_LARGE")
    signatures = {
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/webp": content[:4] == b"RIFF" and content[8:12] == b"WEBP",
    }
    if not signatures.get(declared_type):
        raise ApiException(422, "仅支持真实的 PNG、JPEG 或 WebP 图片", "INVALID_IMAGE")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in {"PNG", "JPEG", "WEBP"} or image.width > 8000 or image.height > 8000 or image.width * image.height > Image.MAX_IMAGE_PIXELS or getattr(image, "n_frames", 1) != 1:
                    raise ApiException(422, "图片尺寸过大或包含动画，请使用静态图片", "INVALID_IMAGE")
                image.load()
                cleaned = image.convert("RGBA" if image.mode in {"RGBA", "LA", "P"} else "RGB")
                output = io.BytesIO()
                cleaned.save(output, format="WEBP", quality=85, method=4)
        name = f"{secrets.token_hex(16)}.webp"
        (settings.data_dir / "uploads" / name).write_bytes(output.getvalue())
        return f"/api/uploads/{name}"
    except ApiException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ApiException(422, "图片文件损坏或格式不受支持", "INVALID_IMAGE") from error


def image_path(settings: Settings, name: str) -> Path:
    """文件名严格限制为随机图片名，拒绝路径穿越和数据库等非公开文件。"""
    if not re.fullmatch(r"[a-f0-9]{32}\.webp", name):
        raise ApiException(404, "图片不存在", "NOT_FOUND")
    path = settings.data_dir / "uploads" / name
    if not path.is_file():
        raise ApiException(404, "图片不存在", "NOT_FOUND")
    return path
