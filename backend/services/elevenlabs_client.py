"""
ElevenLabs Text-to-Speech Client
Converts explanation text to spoken audio
"""

import httpx
from typing import Optional
from app.config import settings
import os


class ElevenLabsClient:
    """
    Client for ElevenLabs TTS API
    Streams audio bytes for a given text string
    """

    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        if not self.api_key and hasattr(settings, "elevenlabs_api_key"):
            self.api_key = settings.elevenlabs_api_key

        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY not found in environment variables.")

        self.base_url = "https://api.elevenlabs.io/v1"

        # Default voice – Rachel (clear, neutral).  Override via env var.
        self.voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: str = "eleven_turbo_v2_5",
    ) -> bytes:
        """
        Convert text to speech and return raw mp3 bytes.

        Args:
            text: The text to speak (max ~5 000 chars recommended).
            voice_id: Override default voice.
            model_id: ElevenLabs model (eleven_turbo_v2_5 is fast + cheap).

        Returns:
            MP3 audio bytes.
        """
        vid = voice_id or self.voice_id

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/text-to-speech/{vid}",
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": text[:5000],
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            return response.content

    async def test_connection(self) -> bool:
        """Quick connectivity check."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/voices",
                    headers={"xi-api-key": self.api_key},
                    timeout=10.0,
                )
                r.raise_for_status()
                return True
        except Exception as e:
            print(f"ElevenLabs connection test failed: {e}")
            return False
