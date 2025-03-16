### Option 1: Use a video with its original audio

curl -X POST http://localhost:3000/render-video \
 -H "Content-Type: application/json" \
 -d '{
"durationInSeconds": 15,
"videoSource": "/video.mp4",
"titleText": "David Goggins - How To Master Your Life"
}'

### Option 2: Use an image with separate audio file

curl -X POST http://localhost:3000/render-video \
 -H "Content-Type: application/json" \
 -d '{
"durationInSeconds": 15,
"audioOffsetInSeconds": 6.9,
"audioFile": "/audio.mp3",
"coverImage": "/cover.jpg",
"titleText": "David Goggins - How To Master Your Life"
}'
