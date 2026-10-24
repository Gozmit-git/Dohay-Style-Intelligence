"""Prepare private photo inputs without forwarding EXIF or full-size originals."""
import base64
import io

from fastapi import HTTPException
from PIL import Image, ImageOps


def fit_photo_part(content_type: str, encoded: str) -> dict[str, object]:
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > 10 * 1024 * 1024:
            raise ValueError("Choose a non-empty photo no larger than 10 MB.")
        with Image.open(io.BytesIO(raw)) as image:
            mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image.format)
            if not mime or mime != content_type:
                raise ValueError("Choose a genuine JPEG, PNG, or WebP photo.")
            if image.width * image.height > 40_000_000:
                raise ValueError("Resize this photo below 40 megapixels.")
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((1600, 1600))
            if "A" in image.getbands():
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=88)
        photo = base64.b64encode(output.getvalue()).decode("ascii")
        return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{photo}", "detail": "high"}}
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"That outfit photo could not be read: {error}") from error
