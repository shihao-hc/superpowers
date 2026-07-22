"""OCR module - Optical Character Recognition for extracted images."""

from dataclasses import dataclass
from typing import Optional, Protocol, Union
import io

from PIL import Image


@dataclass
class OCRResult:
    """OCR extraction result."""

    text: str
    confidence: float
    language: Optional[str] = None
    blocks: list[dict] = None
    full_text: Optional[str] = None

    def __post_init__(self):
        if self.blocks is None:
            self.blocks = []


class OCREngine(Protocol):
    """Protocol for OCR engine implementations."""

    def recognize(self, image_data: bytes) -> OCRResult:
        """Recognize text from image."""
        ...

    async def recognize_async(self, image_data: bytes) -> OCRResult:
        """Async recognize text from image."""
        ...


class SimpleOCREngine:
    """
    Simple OCR engine using Tesseract or fallback methods.

    Supports:
    - Tesseract OCR (if installed)
    - EasyOCR (if installed)
    - Basic image-based text detection
    """

    def __init__(
        self,
        engine: str = "auto",
        language: str = "eng+chi_sim",
    ):
        """
        Initialize OCR engine.

        Args:
            engine: OCR engine (tesseract, easyocr, auto)
            language: Language code for OCR
        """
        self.engine_name = engine
        self.language = language
        self._engine = None
        self._available = self._check_availability()

    def _check_availability(self) -> dict:
        """Check which OCR engines are available."""
        available = {}

        try:
            import pytesseract

            available["tesseract"] = True
        except ImportError:
            available["tesseract"] = False

        try:
            import easyocr

            available["easyocr"] = True
        except ImportError:
            available["easyocr"] = False

        try:
            import PIL
            import PIL.Image

            available["pil"] = True
        except ImportError:
            available["pil"] = False

        return available

    def _get_engine(self):
        """Get or initialize OCR engine."""
        if self._engine:
            return self._engine

        if self.engine_name == "tesseract" or self.engine_name == "auto":
            if self._available.get("tesseract"):
                import pytesseract

                self._engine = "tesseract"
                return "tesseract"

        if self.engine_name == "easyocr" or self.engine_name == "auto":
            if self._available.get("easyocr"):
                import easyocr

                self._engine = easyocr.Reader([self.language.split("+")[0]])
                return "easyocr"

        return None

    def recognize(self, image_data: Union[bytes, str]) -> OCRResult:
        """
        Recognize text from image.

        Args:
            image_data: Image bytes or file path

        Returns:
            OCRResult with extracted text
        """
        if isinstance(image_data, str):
            with open(image_data, "rb") as f:
                image_data = f.read()

        return self._recognize(image_data)

    def _recognize(self, image_data: bytes) -> OCRResult:
        """Internal recognize implementation."""
        engine_type = self._get_engine()

        if engine_type == "tesseract":
            return self._recognize_tesseract(image_data)
        elif engine_type == "easyocr":
            return self._recognize_easyocr(image_data)
        else:
            return self._recognize_fallback(image_data)

    def _recognize_tesseract(self, image_data: bytes) -> OCRResult:
        """OCR using Tesseract."""
        import pytesseract

        image = Image.open(io.BytesIO(image_data))

        text = pytesseract.image_to_string(
            image,
            lang=self.language,
        )

        data = pytesseract.image_to_data(
            image,
            lang=self.language,
            output_type=pytesseract.Output.DICT,
        )

        blocks = []
        n_boxes = len(data["text"])
        for i in range(n_boxes):
            if int(data["conf"][i]) > 0:
                blocks.append(
                    {
                        "text": data["text"][i],
                        "confidence": float(data["conf"][i]) / 100,
                        "bbox": (
                            data["left"][i],
                            data["top"][i],
                            data["width"][i],
                            data["height"][i],
                        ),
                    }
                )

        avg_confidence = (
            sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0
        )

        return OCRResult(
            text=text.strip(),
            confidence=avg_confidence,
            language=self.language,
            blocks=blocks,
            full_text=text,
        )

    def _recognize_easyocr(self, image_data: bytes) -> OCRResult:
        """OCR using EasyOCR."""
        import easyocr
        import numpy as np

        image = Image.open(io.BytesIO(image_data))
        image_np = np.array(image)

        if not isinstance(self._engine, easyocr.Reader):
            self._engine = easyocr.Reader([self.language.split("+")[0]])

        results = self._engine.readtext(image_np)

        blocks = []
        texts = []

        for bbox, text, confidence in results:
            texts.append(text)
            blocks.append(
                {
                    "text": text,
                    "confidence": confidence,
                    "bbox": bbox,
                }
            )

        full_text = " ".join(texts)
        avg_confidence = (
            sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0
        )

        return OCRResult(
            text=full_text,
            confidence=avg_confidence,
            language=self.language,
            blocks=blocks,
            full_text=full_text,
        )

    def _recognize_fallback(self, image_data: bytes) -> OCRResult:
        """Fallback when no OCR engine available."""
        return OCRResult(
            text="",
            confidence=0.0,
            language=None,
            blocks=[],
            full_text="",
        )

    async def recognize_async(self, image_data: bytes) -> OCRResult:
        """Async OCR recognition."""
        import asyncio

        return await asyncio.to_thread(self.recognize, image_data)


def batch_ocr(
    image_urls: list[str],
    ocr_engine: Optional[SimpleOCREngine] = None,
    download_func=None,
) -> list[OCRResult]:
    """
    Batch OCR for multiple images.

    Args:
        image_urls: List of image URLs
        ocr_engine: OCR engine instance
        download_func: Async function to download images

    Returns:
        List of OCRResult
    """
    import asyncio

    engine = ocr_engine or SimpleOCREngine()
    results = []

    async def process():
        nonlocal results

        if not download_func:
            import httpx

            async def default_download(url: str) -> httpx.Response:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    return await client.get(url)

            download_func = default_download

        for url in image_urls:
            try:
                response = await download_func(url)
                image_data = response.content
                result = await engine.recognize_async(image_data)
                results.append(result)
            except Exception:
                results.append(OCRResult(text="", confidence=0.0))

            await asyncio.sleep(0.1)

    asyncio.run(process())
    return results
