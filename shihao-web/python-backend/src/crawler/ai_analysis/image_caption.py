"""Image captioning module - AI-powered image description."""

from dataclasses import dataclass
from typing import Optional, Union, Protocol
import io

from PIL import Image


@dataclass
class CaptionResult:
    """Image captioning result."""

    caption: str
    confidence: float
    labels: list[str] = None
    objects: list[dict] = None

    def __post_init__(self):
        if self.labels is None:
            self.labels = []
        if self.objects is None:
            self.objects = []


class ImageCaptioner:
    """
    AI-powered image captioning.

    Supports:
    - BLIP (Salesforce)
    - CLIP (OpenAI)
    - ViT (Vision Transformer)
    - Ollama local models
    """

    def __init__(
        self,
        model: str = "auto",
        device: str = "auto",
    ):
        """
        Initialize image captioner.

        Args:
            model: Model to use (blip, clip, ollama, auto)
            device: Device to run on (cpu, cuda, auto)
        """
        self.model_name = model
        self.device = device
        self._model = None
        self._processor = None
        self._available = self._check_availability()

    def _check_availability(self) -> dict:
        """Check which models are available."""
        available = {}

        try:
            import torch

            available["torch"] = True
            if torch.cuda.is_available():
                available["cuda"] = True
        except ImportError:
            available["torch"] = False
            available["cuda"] = False

        try:
            import transformers

            available["transformers"] = True
        except ImportError:
            available["transformers"] = False

        try:
            import clip

            available["clip"] = True
        except ImportError:
            available["clip"] = False

        try:
            import requests

            available["requests"] = True
        except ImportError:
            available["requests"] = False

        return available

    def caption(self, image_data: Union[bytes, str]) -> CaptionResult:
        """
        Generate caption for image.

        Args:
            image_data: Image bytes or file path

        Returns:
            CaptionResult with generated caption
        """
        if isinstance(image_data, str):
            with open(image_data, "rb") as f:
                image_data = f.read()

        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")

        model_type = self._get_model_type()

        if model_type == "blip":
            return self._caption_blip(image)
        elif model_type == "clip":
            return self._caption_clip(image)
        else:
            return self._caption_fallback(image)

    def _get_model_type(self) -> str:
        """Determine which model to use."""
        if self.model_name != "auto":
            return self.model_name

        if self._available.get("transformers"):
            return "blip"
        elif self._available.get("clip"):
            return "clip"

        return "fallback"

    def _caption_blip(self, image: Image.Image) -> CaptionResult:
        """Caption using BLIP model."""
        try:
            from transformers import BlipProcessor, BlipForConditionalGeneration
            import torch

            if self._model is None:
                self._processor = BlipProcessor.from_pretrained(
                    "Salesforce/blip-image-captioning-base"
                )
                self._model = BlipForConditionalGeneration.from_pretrained(
                    "Salesforce/blip-image-captioning-base"
                )

                if self.device == "auto":
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                else:
                    device = self.device

                self._model.to(device)
                self._processor.device = device

            inputs = self._processor(image, return_tensors="pt")

            device = getattr(self._processor, "device", "cpu")
            inputs = {k: v.to(device) for k, v in inputs.items()}

            output = self._model.generate(**inputs)
            caption = self._processor.decode(output[0], skip_special_tokens=True)

            return CaptionResult(
                caption=caption,
                confidence=0.9,
            )

        except Exception:
            return self._caption_fallback(image)

    def _caption_clip(self, image: Image.Image) -> CaptionResult:
        """Caption using CLIP model."""
        try:
            import clip
            import torch

            if self._model is None:
                self._model, self._preprocess = clip.load("ViT-B/32")

            candidate_labels = [
                "a photo of a person",
                "a photo of a landscape",
                "a photo of food",
                "a photo of a product",
                "a screenshot of a website",
            ]

            image_input = self._preprocess(image).unsqueeze(0)

            with torch.no_grad():
                logits_per_image, _ = self._model(
                    image_input,
                    clip.tokenize(candidate_labels),
                )
                probs = logits_per_image.softmax(dim=-1).cpu().numpy()[0]

            top_idx = probs.argmax()
            caption = candidate_labels[top_idx]
            confidence = probs[top_idx]

            return CaptionResult(
                caption=caption,
                confidence=float(confidence),
                labels=candidate_labels,
            )

        except Exception:
            return self._caption_fallback(image)

    def _caption_fallback(self, image: Image.Image) -> CaptionResult:
        """Fallback captioning using basic analysis."""
        width, height = image.size

        caption = "An image"

        if width > height * 1.5:
            caption = "A landscape or panoramic image"
        elif height > width * 1.5:
            caption = "A portrait or vertical image"

        if width > 1000 and height > 1000:
            caption = f"High-resolution {caption.lower()}"
        elif width < 200 or height < 200:
            caption = f"Small {caption.lower()}"

        return CaptionResult(
            caption=caption,
            confidence=0.3,
        )

    async def caption_async(self, image_data: bytes) -> CaptionResult:
        """Async image captioning."""
        import asyncio

        return await asyncio.to_thread(self.caption, image_data)


class OllamaVision:
    """
    Ollama vision model integration for advanced image understanding.

    Supports local LLM vision models via Ollama API.
    """

    def __init__(
        self,
        model: str = "llava",
        base_url: str = "http://localhost:11434",
    ):
        """
        Initialize Ollama vision client.

        Args:
            model: Vision model name (llava, bakllava, etc.)
            base_url: Ollama API base URL
        """
        self.model = model
        self.base_url = base_url.rstrip("/")

    def describe(
        self,
        image_data: bytes,
        prompt: str = "Describe this image in detail.",
    ) -> str:
        """
        Get detailed description of image using vision model.

        Args:
            image_data: Image bytes
            prompt: Prompt for vision model

        Returns:
            Generated description
        """
        import base64
        import httpx

        image_b64 = base64.b64encode(image_data).decode("utf-8")

        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
        }

        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")

        except Exception:
            return ""

    def analyze(
        self,
        image_data: bytes,
        questions: list[str] = None,
    ) -> dict[str, str]:
        """
        Answer questions about image.

        Args:
            image_data: Image bytes
            questions: List of questions to answer

        Returns:
            Dict mapping questions to answers
        """
        import base64
        import httpx

        if not questions:
            questions = [
                "What is in this image?",
                "What text is visible?",
                "What is the mood or atmosphere?",
            ]

        image_b64 = base64.b64encode(image_data).decode("utf-8")

        answers = {}

        try:
            with httpx.Client(timeout=60) as client:
                for question in questions:
                    payload = {
                        "model": self.model,
                        "prompt": question,
                        "images": [image_b64],
                        "stream": False,
                    }

                    response = client.post(
                        f"{self.base_url}/api/generate",
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    answers[question] = data.get("response", "")

        except Exception:
            pass

        return answers
