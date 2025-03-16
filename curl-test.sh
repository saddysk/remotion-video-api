#!/bin/bash

# Test rendering a video with custom title and top position
echo "Rendering video with custom title and top position..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "titleText": "[top] EXTERNAL AUDIO AT 25% VOLUME",
    "textPosition": "top",
    "enableAudio": true
  }'

echo -e "\n\nNow try viewing the video at the URL shown above"