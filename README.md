# Install

```bash
python -m pip install -r requirements.txt
```
*make sure you're using python 3.11.9

### CLI

```bash
python agent_action.py \
  --image path.png \
  --doc_id X \
  --aoi_id Y \
  --aoi_type paragraph \
  --state confused
```

### K2 Configuration Placeholders

The file `/Users/utsavgupta/Documents/New project/agent_action.py` includes editable placeholders:
- `DEFAULT_K2_BASE_URL = "https://YOUR_K2_BASE_URL"`
- `DEFAULT_K2_MODEL = "YOUR_K2_MODEL"`
- `DEFAULT_K2_API_KEY_ENV = "K2_API_KEY"`

You can either edit those constants or pass values at runtime.

### Exact Run Steps (with your API key)

1. Set your API key env var (replace the value):

```bash
export K2_API_KEY="PASTE_YOUR_REAL_KEY_HERE"
```

2. Run in K2 mode (replace URL/model):

```bash
python agent_action.py \
  --image /absolute/path/to/crop.png \
  --doc_id doc-123 \
  --aoi_id aoi-9 \
  --aoi_type paragraph \
  --state confused \
  --llm_mode k2 \
  --k2_base_url "https://YOUR_K2_BASE_URL" \
  --k2_model "YOUR_K2_MODEL" \
  --k2_api_key_env K2_API_KEY
```

3. The output JSON includes:
- `telemetry.llm_config.k2_api_key_present` to confirm key visibility
- `telemetry.llm_preview` placeholder text showing whether config is complete

Behavior:
- Validates image path.
- Acquires text in strict priority order:
1. `AOIEvent.text_hint` if non-empty and > 20 chars.
2. `doc_text_provider.get_text(doc_id, aoi_id)` (stub interface).
3. OCR fallback via `pytesseract`.
4. Image-only heuristics if OCR is poor/empty.
- Routes by reader state (`confused`, `interested`, `skimming`, `revising`).
- Returns 1–3 action cards with required buttons:
  - `Explain` (`explain_short`)
  - `Explain deeper` (`explain_expanded`)
  - `Dismiss` (`dismiss`)
  - `I already know this` (`feedback_known`)
  - optional `Make flashcards`

### Runnable examples (required)

Run all 3 examples:

```bash
python agent_action.py --run_examples
```

This prints JSON payloads for:
1. paragraph confusion
2. equation confusion
3. code confusion

Example output shape:

```json
{
  "aoi_id": "aoi-p-1",
  "doc_id": "doc-paragraph",
  "state": "confused",
  "extracted_text": "Photosynthesis converts light energy into chemical energy...",
  "detected_language": "en",
  "actions": [
    {
      "title": "Direct explanation",
      "body": "Start here: ...",
      "buttons": [
        { "label": "Explain", "action_id": "explain_short" },
        { "label": "Explain deeper", "action_id": "explain_expanded" },
        { "label": "Dismiss", "action_id": "dismiss" },
        { "label": "I already know this", "action_id": "feedback_known" }
      ]
    }
  ],
  "suggested_prompts": [
    "[explain_short|short]\\n...",
    "[explain_short|expanded]\\n...",
    "[explain_expanded|short]\\n...",
    "[explain_expanded|expanded]\\n..."
  ],
  "telemetry": {
    "ocr_used": false,
    "confidence": 0.92,
    "heuristics": {
      "priority_order": [
        "text_hint_if_len_gt_20",
        "doc_text_provider_get_text",
        "ocr_with_pytesseract",
        "image_only_type_heuristics"
      ]
    }
  }
}
```
=======
# ThirdEye
Your third eye: the browser that reads your mind

## Features

- **Dwell-based context capture**: Hover over content for 2 seconds to automatically search for related information
- **Centered context window**: Captures text centered around your cursor position (10 lines before and after)
- **Toggle on/off**: Enable or disable the extension without reloading the page
  - Click the extension icon in the toolbar
  - Use keyboard shortcut: `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac)
  - Click the play/pause button in the overlay
- **Gaze tracking support**: Optionally use eye tracking API for hands-free browsing
- **Works on special pages**: Google Docs, Google Slides, and PDF.js viewers

## Configuration

Edit `content.js` to customize:
- `DWELL_TIME_MS`: How long to hover before triggering (default: 2000ms)
- `CONTEXT_LINES_BEFORE` / `CONTEXT_LINES_AFTER`: Context window size (default: 10 lines each)
- `ENABLE_GAZE_MODE`: Enable gaze tracking API (default: false)
- `GAZE_API_URL` / `ANALYZE_API_URL`: API endpoints
>>>>>>> 159943b1c91f295fc323edce2134312738b770fa
