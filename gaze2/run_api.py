# _*_ coding: utf-8 _*_
"""
Run the Gaze2 Flask API server.
Usage: python run_api.py
API will be available at http://127.0.0.1:5000/gaze
"""

from api import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
