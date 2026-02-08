# Gaze Tracker - Production Deployment Guide

## Overview

This guide covers deploying the Gaze Tracker in production environments. The system supports multiple deployment modes:

- **API Mode**: RESTful API only (headless, no display)
- **Display Mode**: Visual display with gaze cursor overlay
- **Both Mode**: API + Display running together

## Quick Start

### Local Development

```bash
# Clone and setup
cd gaze2
cp .env.example .env
# Edit .env with your settings

# Install dependencies
pip install -r requirements.txt
pip install gazefollower

# Run
python3 main.py
```

### Using Startup Script

```bash
./start.sh --mode api        # API only
./start.sh --mode display    # Display only
./start.sh --mode both       # Both (default)
```

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and customize:

### Key Settings

- `GAZE_API_HOST`: API bind address (default: `0.0.0.0`)
- `GAZE_API_PORT`: API port (default: `5000`)
- `GAZE_Y_OFFSET`: Y-axis correction offset (default: `0`)
- `GAZE_CALIBRATION_REQUIRED`: Require calibration (default: `true`)
- `GAZE_CORS_ORIGINS`: CORS allowed origins (default: `*`)

See `.env.example` for all available options.

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t gaze-tracker .

# Run container
docker run -d \
  --name gaze-tracker \
  -p 5000:5000 \
  --device=/dev/video0 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -e GAZE_API_HOST=0.0.0.0 \
  -e GAZE_API_PORT=5000 \
  gaze-tracker
```

### Using Docker Compose

```bash
# Edit docker-compose.yml as needed
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

**Note**: Camera access requires `--device=/dev/video0` or similar. Adjust the device path for your system.

## Production Server Deployment

### Using Gunicorn

```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn -c gunicorn_config.py "api.app:app"
```

### Systemd Service

Create `/etc/systemd/system/gaze-tracker.service`:

```ini
[Unit]
Description=Gaze Tracker Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/gaze2
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/gunicorn -c gunicorn_config.py "api.app:app"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable gaze-tracker
sudo systemctl start gaze-tracker
sudo systemctl status gaze-tracker
```

## API Endpoints

### GET /gaze
Get current gaze coordinates.

**Response:**
```json
{
  "x": 960.5,
  "y": 540.2,
  "confidence": 0.95,
  "timestamp": 1234567890.123
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": {
    "initialized": true,
    "running": true,
    "calibrated": true,
    "has_gaze": true
  },
  "timestamp": 1234567890.123
}
```

### GET /status
Detailed status information.

### GET /
API information and available endpoints.

## Rate Limiting

The API implements rate limiting (default: 60 requests/minute per IP). Configure via `GAZE_RATE_LIMIT`.

## Monitoring

### Health Checks

Use `/health` endpoint for monitoring:

```bash
curl http://localhost:5000/health
```

### Logs

Logs are written to:
- Console (stdout/stderr)
- File: `logs/gaze_tracker.log` (configurable via `GAZE_LOG_FILE`)

### Metrics

Consider integrating with:
- Prometheus (via flask-prometheus)
- Datadog
- New Relic

## Security Considerations

1. **CORS**: Configure `GAZE_CORS_ORIGINS` to restrict access
2. **Rate Limiting**: Already implemented, adjust `GAZE_RATE_LIMIT` as needed
3. **Authentication**: Add API keys or OAuth if exposing publicly
4. **HTTPS**: Use reverse proxy (nginx/traefik) with SSL/TLS
5. **Firewall**: Restrict API port access

## Reverse Proxy (Nginx)

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Camera Not Found

- Check camera device: `ls -la /dev/video*`
- Grant permissions (Linux): Add user to `video` group
- Docker: Use `--device=/dev/video0`

### Calibration Issues

- Ensure good lighting
- Face camera directly
- Follow calibration points carefully
- Adjust `GAZE_Y_OFFSET` if gaze appears offset

### API Not Responding

- Check logs: `tail -f logs/gaze_tracker.log`
- Verify port is not in use: `lsof -i :5000`
- Check firewall rules
- Verify service is running: `curl http://localhost:5000/health`

### Performance Issues

- Reduce `GAZE_CURSOR_SIZE` for display mode
- Adjust gunicorn workers in `gunicorn_config.py`
- Monitor system resources

## Scaling

For high-traffic deployments:

1. **Load Balancer**: Use nginx/haproxy in front of multiple instances
2. **Multiple Workers**: Increase gunicorn workers
3. **Caching**: Add Redis for rate limiting and caching
4. **Database**: Store gaze data in PostgreSQL/MongoDB

## Backup

Gaze data is saved to `data/` directory. Regular backups recommended:

```bash
# Backup data directory
tar -czf gaze-data-backup-$(date +%Y%m%d).tar.gz data/
```

## Support

For issues and questions:
- Check logs first
- Review configuration
- Test with `--mode api` to isolate display issues
- Verify camera access and permissions
