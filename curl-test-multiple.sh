#!/bin/bash

# Test rendering a video with left-right layout (default)
echo "Rendering video with left-right layout..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "demoVideoSource": "/video2.mp4",
    "titleText": "LEFT-RIGHT SPLIT",
    "textPosition": "bottom",
    "enableAudio": false,
    "splitScreen": true,
    "splitPosition": "left-right"
  }'

sleep 2

# Test rendering a video with right-left layout
echo -e "\n\nRendering video with right-left layout..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "demoVideoSource": "/video2.mp4",
    "titleText": "RIGHT-LEFT SPLIT",
    "textPosition": "bottom",
    "enableAudio": false,
    "splitScreen": true,
    "splitPosition": "right-left"
  }'

sleep 2

# Test rendering a video with top-bottom layout
echo -e "\n\nRendering video with top-bottom layout..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "demoVideoSource": "/video2.mp4",
    "titleText": "TOP-BOTTOM SPLIT",
    "textPosition": "bottom",
    "enableAudio": false,
    "splitScreen": true,
    "splitPosition": "top-bottom"
  }'

sleep 2

# Test rendering a video with bottom-top layout
echo -e "\n\nRendering video with bottom-top layout..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSource": "/video.mp4",
    "demoVideoSource": "/video2.mp4",
    "titleText": "BOTTOM-TOP SPLIT",
    "textPosition": "bottom",
    "enableAudio": false,
    "splitScreen": true,
    "splitPosition": "bottom-top"
  }'

echo -e "\n\nNow try viewing the videos at the URLs shown above."