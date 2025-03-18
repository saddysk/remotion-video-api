#!/bin/bash
set -e

# Configuration
DOCKER_REGISTRY="registry.digitalocean.com/remotion-registry"
IMAGE_NAME="remotion-video-generator"
KUBERNETES_NAMESPACE="remotion"

# 1. Build and push Docker image
echo "Building Docker image..."
docker build -t ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest .
docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest

# 2. Prepare Kubernetes secrets
echo "Creating base64 encoded secrets..."
SUPABASE_URL_ENCODED=$(echo -n "${SUPABASE_URL}" | base64)
SUPABASE_KEY_ENCODED=$(echo -n "${SUPABASE_KEY}" | base64)

# Replace placeholders in Kubernetes YAML files
echo "Preparing Kubernetes manifests..."
sed -i "s|\${DOCKER_REGISTRY}|${DOCKER_REGISTRY}|g" kubernetes/deployment.yaml
sed -i "s|\${IMAGE_NAME}|${IMAGE_NAME}|g" kubernetes/deployment.yaml
sed -i "s|\${BASE64_ENCODED_SUPABASE_URL}|${SUPABASE_URL_ENCODED}|g" kubernetes/secrets.yaml
sed -i "s|\${BASE64_ENCODED_SUPABASE_KEY}|${SUPABASE_KEY_ENCODED}|g" kubernetes/secrets.yaml

# 3. Create namespace if it doesn't exist
echo "Setting up Kubernetes namespace..."
kubectl get namespace ${KUBERNETES_NAMESPACE} || kubectl create namespace ${KUBERNETES_NAMESPACE}

# 4. Apply Kubernetes configurations
echo "Applying Kubernetes configurations..."
kubectl apply -f kubernetes/secrets.yaml -n ${KUBERNETES_NAMESPACE}
kubectl apply -f kubernetes/deployment.yaml -n ${KUBERNETES_NAMESPACE}
kubectl apply -f kubernetes/service.yaml -n ${KUBERNETES_NAMESPACE}

echo "Deployment completed successfully!"
echo "To check the status of your deployment, run:"
echo "kubectl get pods -n ${KUBERNETES_NAMESPACE}"
echo "kubectl get svc -n ${KUBERNETES_NAMESPACE}"