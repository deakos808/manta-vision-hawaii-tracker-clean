import base64
import io
import math
import os
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

os.environ["EMBED_API_TOKEN"] = "fabricated-local-test-token"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import embed_server  # noqa: E402


def _fabricated_image_base64() -> str:
    image = Image.new("RGB", (64, 64))
    pixels = image.load()
    for y in range(64):
        for x in range(64):
            pixels[x, y] = (
                (x * 17 + y * 3) % 256,
                (x * 5 + y * 11) % 256,
                ((x ^ y) * 13) % 256,
            )
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return base64.b64encode(stream.getvalue()).decode("ascii")


class VercelServiceTest(unittest.TestCase):
    def test_authentication_and_validation(self):
        client = TestClient(embed_server.app)
        with self.assertLogs("manta_embedding", level="INFO") as captured:
            self.assertEqual(client.get("/health").status_code, 401)
            self.assertEqual(
                client.get(
                    "/health", headers={"authorization": "Bearer incorrect"}
                ).status_code,
                401,
            )
        sanitized_log = "\n".join(captured.output)
        self.assertNotIn("fabricated-local-test-token", sanitized_log)
        self.assertNotIn("incorrect", sanitized_log)

        headers = {"authorization": "Bearer fabricated-local-test-token"}
        health = client.get("/health", headers=headers)
        self.assertEqual(health.status_code, 200)
        self.assertEqual(
            health.json(),
            {
                "ok": True,
                "has_model": False,
                "model": "resnet50",
                "dim": 1024,
            },
        )
        self.assertEqual(client.get("/", headers=headers).json(), health.json())
        self.assertEqual(
            client.post("/embed", headers=headers, content=b"not-json").status_code,
            422,
        )
        self.assertEqual(
            client.post(
                "/embed",
                headers={
                    **headers,
                    "content-length": str(embed_server.MAX_BODY_BYTES + 1),
                },
                content=b"{}",
            ).status_code,
            413,
        )

    def test_packaged_http_output_matches_existing_implementation_exactly(self):
        payload = _fabricated_image_base64()
        expected = embed_server.embed(embed_server.EmbedRequest(image_base64=payload))

        client = TestClient(embed_server.app)
        response = client.post(
            "/embed",
            headers={"authorization": "Bearer fabricated-local-test-token"},
            json={"image_base64": payload},
        )
        self.assertEqual(response.status_code, 200)
        actual = response.json()
        self.assertEqual(actual["embedding"], expected["embedding"])
        self.assertEqual(len(actual["embedding"]), 1024)
        self.assertTrue(all(math.isfinite(value) for value in actual["embedding"]))
        self.assertEqual(actual["dim"], 1024)

        root_response = client.post(
            "/",
            headers={"authorization": "Bearer fabricated-local-test-token"},
            json={"image_base64": payload},
        )
        self.assertEqual(root_response.status_code, 200)
        self.assertEqual(root_response.json()["embedding"], actual["embedding"])


if __name__ == "__main__":
    unittest.main()
