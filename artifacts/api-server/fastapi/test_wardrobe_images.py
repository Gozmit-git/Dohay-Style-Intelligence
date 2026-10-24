import base64
import io
from types import SimpleNamespace
import unittest
from PIL import Image, ImageDraw
from wardrobe_images import isolate_garment, open_photo, reconstruct_garment_image


def encoded(image):
    out = io.BytesIO()
    image.save(out, "PNG")
    return {"contentType": "image/png", "dataBase64": base64.b64encode(out.getvalue()).decode()}


class GarmentCutoutTests(unittest.TestCase):
    def test_separate_layers_exclude_other_garment_pixels(self):
        source = Image.new("RGB", (100, 100), "white")
        draw = ImageDraw.Draw(source)
        draw.rectangle((10, 10, 39, 89), fill="red")
        draw.rectangle((60, 10, 89, 89), fill="blue")
        region = {"imageIndex": 0, "points": [
            {"x": .11, "y": .11}, {"x": .38, "y": .11},
            {"x": .38, "y": .88}, {"x": .11, "y": .88},
        ]}
        output = isolate_garment([encoded(source)], [region])[0]
        image = open_photo(output)
        pixels = [pixel for pixel in image.get_flattened_data() if pixel[3] > 250]
        self.assertEqual(image.size, (768, 768))
        self.assertTrue(pixels)
        self.assertTrue(all(red > 240 and blue < 20 for red, green, blue, alpha in pixels))
        self.assertEqual(image.getpixel((0, 0))[3], 0)

    def test_empty_regions_never_return_original_selfie(self):
        with self.assertRaises(ValueError):
            isolate_garment([encoded(Image.new("RGB", (100, 100)))], [])

    def test_full_selfie_rectangle_is_not_an_item_cutout(self):
        region = {"imageIndex": 0, "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]}
        with self.assertRaises(ValueError):
            isolate_garment([encoded(Image.new("RGB", (100, 100), "red"))], [region])

    def test_transparent_source_stays_transparent(self):
        source = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle((20, 20, 79, 79), fill=(255, 0, 0, 255))
        region = {"imageIndex": 0, "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]}
        image = open_photo(isolate_garment([encoded(source)], [region])[0])
        self.assertEqual(image.getpixel((0, 0))[3], 0)
        self.assertGreater(image.getpixel((384, 384))[3], 250)
        pixels = [pixel for pixel in image.get_flattened_data() if pixel[3] > 250]
        self.assertTrue(all(red > 240 and blue < 20 for red, green, blue, alpha in pixels))

    def test_incorrect_mime_is_rejected(self):
        photo = encoded(Image.new("RGB", (10, 10)))
        photo["contentType"] = "image/jpeg"
        with self.assertRaises(ValueError):
            open_photo(photo)


class FakeImageEdit:
    def __init__(self, output):
        self.output = output
        self.kwargs = None

    async def edit(self, **kwargs):
        self.kwargs = kwargs
        image = SimpleNamespace(b64_json=self.output)
        return SimpleNamespace(data=[image] if self.output is not None else [])


class FakeImageClient:
    def __init__(self, output):
        self.images = FakeImageEdit(output)
        self.options = None

    def with_options(self, **options):
        self.options = options
        return self


class GarmentReconstructionTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_medium_image_edit_and_returns_a_separate_png(self):
        source = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle((240, 100, 530, 650), fill=(32, 70, 180, 255))
        output = encoded(Image.new("RGB", (1024, 1024), "white"))["dataBase64"]
        client = FakeImageClient(output)

        result = await reconstruct_garment_image(client, encoded(source), {
            "category": "top",
            "subcategory": "blue floral shirt",
            "colors": ["navy", "white"],
            "pattern": "floral",
            "styleTags": ["casual"],
        })

        self.assertEqual(result["contentType"], "image/png")
        self.assertEqual(open_photo(result).size, (1024, 1024))
        self.assertEqual(client.options, {"max_retries": 2, "timeout": 120})
        self.assertEqual(client.images.kwargs["model"], "gpt-image-2")
        self.assertEqual(client.images.kwargs["quality"], "medium")
        self.assertEqual(client.images.kwargs["size"], "1024x1024")
        self.assertIn("front-facing", client.images.kwargs["prompt"])
        self.assertIn("blue floral shirt", client.images.kwargs["prompt"])
        self.assertIn("Do not invent logos", client.images.kwargs["prompt"])

        filename, input_bytes, content_type = client.images.kwargs["image"]
        self.assertEqual(filename, "garment-reference.png")
        self.assertEqual(content_type, "image/png")
        flattened = open_photo({"contentType": content_type, "dataBase64": base64.b64encode(input_bytes).decode()})
        self.assertEqual(flattened.getpixel((0, 0))[:3], (248, 247, 244))
        self.assertGreater(flattened.getpixel((384, 384))[2], 150)

    async def test_missing_image_result_is_an_explicit_failure(self):
        client = FakeImageClient(None)
        with self.assertRaisesRegex(ValueError, "No AI garment image was returned"):
            await reconstruct_garment_image(client, encoded(Image.new("RGBA", (100, 100))), {})


if __name__ == "__main__":
    unittest.main()
