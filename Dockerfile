FROM public.ecr.aws/lambda/nodejs:18

# Install system dependencies, including ffmpeg
RUN yum update -y && \
    yum install -y xz tar && \
    yum clean all

# Install FFmpeg
RUN curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz && \
    tar Jxf ffmpeg.tar.xz && \
    cp ./ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
    cp ./ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ && \
    rm -rf ./ffmpeg*

# Create app directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy application code
COPY . .

# Lambda handler
CMD [ "lambda-handler.handler" ]