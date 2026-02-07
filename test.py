from flask import Flask, jsonify, request
from flask_cors import CORS
import random

app = Flask(__name__)
CORS(app)

@app.route('/gaze', methods=['GET'])
def gaze():
    return jsonify({
        'x': random.uniform(0, 1920),
        'y': random.uniform(0, 1080),
        'confidence': random.uniform(0.85, 1.0)
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    url = data.get('url', '')
    text = data.get('text', '')
    
    # Extract first few sentences for summary
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
    app.run(port=8000, debug=True)