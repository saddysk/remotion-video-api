#!/bin/bash

# Test rendering a video with side-by-side layout
echo "Rendering video with side-by-side layout..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "titleText": "SIDE BY SIDE VIDEOS",
    "textPosition": "bottom",
    "enableAudio": false,
    "splitScreen": false
  }'

echo -e "\n\nNow try viewing the video at the URL shown above."