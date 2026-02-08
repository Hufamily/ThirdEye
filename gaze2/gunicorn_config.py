# Gunicorn configuration for production

import multiprocessing
import os

# Server socket
bind = f"{os.getenv('GAZE_API_HOST', '0.0.0.0')}:{os.getenv('GAZE_API_PORT', '5000')}"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'
worker_connections = 1000
timeout = 120
keepalive = 5

# Logging
accesslog = os.getenv('GAZE_ACCESS_LOG', '-')
errorlog = os.getenv('GAZE_ERROR_LOG', '-')
loglevel = os.getenv('GAZE_LOG_LEVEL', 'info').lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'gaze-tracker'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = None
# certfile = None
