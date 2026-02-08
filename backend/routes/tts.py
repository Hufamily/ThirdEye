"""
Text-to-Speech API Route
POST /api/tts  — returns mp3 audio for a given text string
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from routes.auth import get_current_user
from models.user import User

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


@router.post("")
async def text_to_speech(
    req: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    """
    POST /api/tts
    Convert text to speech via ElevenLabs.
    Returns audio/mpeg bytes.
    """
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    try:
        from services.elevenlabs_client import ElevenLabsClient

        client = ElevenLabsClient()
        audio_bytes = await client.synthesize(
            text=req.text.strip(),
            voice_id=req.voice_id,
        )

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"},
        )

    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs TTS failed: {e}")
