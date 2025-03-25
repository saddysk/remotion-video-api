# Build the Docker image
docker build -t video-generator .

# Tag the image
docker tag video-generator:latest 163994052169.dkr.ecr.us-east-1.amazonaws.com/video-generator:latest

# Push the image
docker push 163994052169.dkr.ecr.us-east-1.amazonaws.com/video-generator:latest

# Update Lambda function
aws lambda update-function-code \
  --function-name video-generator \
  --image-uri 163994052169.dkr.ecr.us-east-1.amazonaws.com/video-generator:latest