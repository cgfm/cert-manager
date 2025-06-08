FROM node:23-slim

RUN apt-get update && apt-get install -y curl openssl tzdata && apt-get clean

WORKDIR /app

# Environment variables
ENV DISABLE_AUTH=false
# Set default admin password to empty, to force user to set it in setup or env
ENV DEFAULT_ADMIN_PASSWORD=''
# Set default timezone to UTC
ENV TZ=UTC

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY src ./src

# Copy health check script
COPY healthcheck.js ./

# Create necessary directories with correct permissions
RUN mkdir -p /logs /config /certs /app/public && \
    chmod 777 /logs /config /certs && \
    cp -r /app/src/public-template/* /app/public/ && \
    chmod +x /app/healthcheck.js

# Add health check
HEALTHCHECK --interval=30s --timeout=20s --start-period=120s --retries=3 \
    CMD node /app/healthcheck.js

# Set command to run
CMD ["node", "src/app.js"]