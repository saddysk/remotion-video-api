# Step-by-Step Deployment Guide for Remotion Video Generation on Digital Ocean

Based on your file structure, I'll provide a complete guide to deploy your Remotion video generator service on Digital Ocean using Kubernetes.

## Prerequisites

1. A Digital Ocean account with billing enabled
2. `doctl` ([Digital Ocean CLI](https://docs.digitalocean.com/reference/doctl/how-to/install)) installed on your machine
3. `kubectl` installed on your machine
4. Docker installed on your machine

## Step 1: Prepare Your Application

1. **Update the index.js** file with the Kubernetes-optimized code I provided earlier.

2. **Create a Dockerfile** in your project root:

```bash
touch Dockerfile
```

Add the Docker configuration:

```dockerfile
FROM node:18-bullseye

# Install dependencies required for video processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libvips \
    chromium \
    fonts-noto-color-emoji \
    fonts-open-sans \
    fonts-roboto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer/Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV REMOTION_HEADLESS=true

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy all files
COPY . .

# Create directories for output
RUN mkdir -p out

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "index.js"]
```

3. **Create a Kubernetes configuration directory**:

```bash
mkdir -p kubernetes
```

4. **Create Kubernetes configuration files**:

Create the deployment configuration:

```bash
touch kubernetes/deployment.yaml
```

Add the following content (adjust memory/CPU as needed):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: remotion-video-generator
  labels:
    app: remotion-video-generator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: remotion-video-generator
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: remotion-video-generator
    spec:
      containers:
        - name: remotion-video-generator
          image: ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
          resources:
            requests:
              memory: "2Gi"
              cpu: "1"
            limits:
              memory: "4Gi"
              cpu: "2"
          ports:
            - containerPort: 3000
          env:
            - name: SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: remotion-secrets
                  key: supabase-url
            - name: SUPABASE_KEY
              valueFrom:
                secretKeyRef:
                  name: remotion-secrets
                  key: supabase-key
            - name: SUPABASE_STORAGE_BUCKET
              value: "generated-videos"
            - name: NODE_ENV
              value: "production"
            - name: RENDER_CONCURRENCY
              value: "2"
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 60
            periodSeconds: 20
          volumeMounts:
            - name: temp-storage
              mountPath: /app/out
      volumes:
        - name: temp-storage
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

Create the service configuration:

```bash
touch kubernetes/service.yaml
```

Add the following content:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: remotion-video-generator
  labels:
    app: remotion-video-generator
spec:
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
  selector:
    app: remotion-video-generator
  type: ClusterIP
```

Create the secrets configuration:

```bash
touch kubernetes/secrets.yaml
```

Add the following content:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: remotion-secrets
type: Opaque
data:
  # These values will be replaced by the deployment script
  supabase-url: ${BASE64_ENCODED_SUPABASE_URL}
  supabase-key: ${BASE64_ENCODED_SUPABASE_KEY}
```

5. **Create a deployment script**:

```bash
touch deploy.sh
chmod +x deploy.sh
```

Add the following content:

```bash
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
```

## Step 2: Create Digital Ocean Resources

1. **Log in to Digital Ocean**:
   Open the Digital Ocean dashboard at https://cloud.digitalocean.com/

2. **Create a Kubernetes cluster**:

   - Go to Kubernetes → Create → Kubernetes
   - Choose a datacenter region close to your users
   - Select node sizes:
     - For video processing, choose CPU-Optimized droplets
     - Recommended: 4 vCPUs, 8GB RAM per node
   - Set the number of nodes to 2
   - Name your cluster (e.g., "remotion-cluster")
   - Click "Create Cluster"

3. **Create a Container Registry**:

   - Go to Container Registry → Create Registry
   - Choose a name (e.g., "remotion-registry")
   - Select "Starter" plan
   - Click "Create Registry"

4. **Configure kubectl to use your cluster**:

   - On the cluster page, click on "Download Config File"
   - Or use doctl to configure kubectl:
     ```bash
     doctl kubernetes cluster kubeconfig save remotion-cluster  (go for it)
     ```
   - Verify connection:
     ```bash
     kubectl get nodes
     ```

5. **Connect to the Container Registry**:
   ```bash
   doctl registry login (go for manual api token mode)
   ```

## Step 3: Deploy Your Application

1. **Set environment variables**:

   ```bash
   export SUPABASE_URL="your-supabase-url"
   export SUPABASE_KEY="your-supabase-api-key"
   ```

2. **Run the deployment script**:

   ```bash
   ./deploy.sh
   ```

3. **Verify the deployment**:

   ```bash
   kubectl get pods -n remotion
   ```

4. **Monitor the logs**:
   ```bash
   kubectl logs -f deployment/remotion-video-generator -n remotion
   ```

## Step 4: Expose the Service (Optional)

If you need to access the API from outside the cluster:

1. **Create a LoadBalancer service**:

   ```bash
   kubectl apply -f - <<EOF
   apiVersion: v1
   kind: Service
   metadata:
     name: remotion-video-generator-lb
     namespace: remotion
   spec:
     type: LoadBalancer
     ports:
     - port: 80
       targetPort: 3000
     selector:
       app: remotion-video-generator
   EOF
   ```

2. **Get the external IP**:
   ```bash
   kubectl get svc remotion-video-generator-lb -n remotion
   ```

## Step 5: Test Your Deployment

1. **Insert a test record** in your Supabase `generated_videos` table:

   - Use the Supabase dashboard or API
   - Ensure it has all required fields
   - Set the status to "pending"

2. **Check the logs** to see if the video generation starts:

   ```bash
   kubectl logs -f deployment/remotion-video-generator -n remotion
   ```

3. **Verify the result** in your Supabase table:
   - Check if the `remotion_video` field is updated with a URL
   - Check if the video was uploaded to your Supabase storage

## Step 6: Set Up Scaling (Optional)

Add a Horizontal Pod Autoscaler for automatic scaling:

```bash
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: remotion-video-generator
  namespace: remotion
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: remotion-video-generator
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
EOF
```

## Maintenance Tasks

### Updating Your Application

1. Make changes to your code
2. Run the deployment script again:
   ```bash
   ./deploy.sh
   ```

### Scaling Node Count

If you need more overall capacity:

```bash
doctl kubernetes cluster node-pool update <cluster-id> <pool-id> --count 3
```

### Monitoring Your Application

1. Check resource usage:

   ```bash
   kubectl top pods -n remotion
   ```

2. View application metrics:
   ```bash
   # Port forward the metrics endpoint
   kubectl port-forward deployment/remotion-video-generator 3000:3000 -n remotion
   # Then access in browser: http://localhost:3000/metrics
   ```

Yes, there are several effective ways to monitor logs for your Remotion video generator application running on Digital Ocean Kubernetes. Here are the options, from simplest to most comprehensive:

---

This comprehensive guide should help you successfully deploy your Remotion video generation service on Digital Ocean with proper resource allocation and scaling capabilities.
