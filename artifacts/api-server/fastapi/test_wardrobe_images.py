import base64
import io
import unittest
from PIL import Image, ImageDraw
from wardrobe_images import isolate_garment, open_photo


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


if __name__ == "__main__":
    unittest.main()
