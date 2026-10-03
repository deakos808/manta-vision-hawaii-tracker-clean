import hashlib
import sys
import urllib.request
from pathlib import Path


WEIGHT_URL = "https://download.pytorch.org/models/resnet50-11ad3fa6.pth"
WEIGHT_SHA256 = "11ad3fa62ca79e40addfd354a8ec4b7c75143b3038b8d2a807fbc68deab379ca"
WEIGHT_PATH = (
    Path(__file__).resolve().parents[1]
    / ".model-cache"
    / "resnet50-11ad3fa6.pth"
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if WEIGHT_PATH.is_file() and _sha256(WEIGHT_PATH) == WEIGHT_SHA256:
        print("Verified packaged ResNet50 weights")
        return 0

    WEIGHT_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary_path = WEIGHT_PATH.with_suffix(".download")
    try:
        urllib.request.urlretrieve(WEIGHT_URL, temporary_path)
        if _sha256(temporary_path) != WEIGHT_SHA256:
            raise RuntimeError("Downloaded model weights failed SHA-256 verification")
        temporary_path.replace(WEIGHT_PATH)
        print("Downloaded and verified packaged ResNet50 weights")
        return 0
    finally:
        temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
