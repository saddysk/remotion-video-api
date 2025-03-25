#!/bin/bash

# Define variables
APP_NAME="video-generator"
ECR_REPOSITORY_URI="163994052169.dkr.ecr.us-east-1.amazonaws.com/video-generator"
LAMBDA_FUNCTION_NAME="video-generator"

# Log in to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI

# Build the Docker image
# docker build -t $APP_NAME .
DOCKER_BUILDKIT=1 docker build --progress=plain --no-cache -t video-generator .

# Tag the Docker image
docker tag $APP_NAME:latest $ECR_REPOSITORY_URI:latest

# Push the Docker image to ECR
docker push $ECR_REPOSITORY_URI:latest

# # Update the Lambda function configuration
# aws lambda update-function-code \
#   --function-name $LAMBDA_FUNCTION_NAME \
#   --image-uri $ECR_REPOSITORY_URI:latest

echo "Deployment completed successfully!"