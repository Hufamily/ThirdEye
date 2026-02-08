from flask import Flask, jsonify, request
from flask_cors import CORS
import random
import time

app = Flask(__name__)
CORS(app)

# Simulated stable gaze position (stays in one area to trigger dwell)
# In real use, this would come from an eye tracker
gaze_x = 960
gaze_y = 540

@app.route('/gaze', methods=['GET'])
def gaze():
    global gaze_x, gaze_y
    # Add small jitter but keep it within dwell radius (50px)
    # This simulates a real eye tracker with some noise
    jitter_x = random.uniform(-20, 20)
    jitter_y = random.uniform(-20, 20)
    return jsonify({
        'x': gaze_x + jitter_x,
        'y': gaze_y + jitter_y,
        'confidence': random.uniform(0.85, 1.0)
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    # Handle both image uploads (FormData) and JSON requests
    if request.content_type and 'multipart/form-data' in request.content_type:
        # Image was uploaded
        image = request.files.get('image')
        if image:
            print(f'[Analyze] Received image: {image.filename}, size: {len(image.read())} bytes')
            image.seek(0)  # Reset file pointer
        
        # Return format expected by extension
        return jsonify({
            'success': True,
            'results': [
                {
                    'title': 'Screenshot Analysis Result',
                    'url': 'https://example.com/analysis',
                    'snippet': 'Image received and processed successfully. This is where your AI analysis would go.'
                },
                {
                    'title': 'Related Information',
                    'url': 'https://example.com/related',
                    'snippet': 'Additional context based on the screenshot content.'
                }
            ]
        })
    else:
        # JSON request (legacy format)
        data = request.json or {}
        url = data.get('url', '')
        text = data.get('text', '')
        
        sentences = text.split('.')[:3]
        summary = '.'.join(sentences) + '.'
        
        return jsonify({
            'summary': f'Content from {url}: {summary}',
            'confusion_points': [
                'What is the main topic?',
                'How does this relate to common knowledge?',
                'Are there any unfamiliar terms?'
            ],
            'image_queries': [
                'Diagram explaining main concept',
                'Graph of related statistics',
                'Real-world example photos'
            ]
        })

if __name__ == '__main__':
    print('[Server] Starting on http://127.0.0.1:8000')
    print('[Server] Gaze API: GET /gaze')
    print('[Server] Analyze API: POST /analyze')
    app.run(port=8000, debug=True)