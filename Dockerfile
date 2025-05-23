FROM node:23-slim

RUN apt-get update && apt-get install -y openssl curl && apt-get clean

WORKDIR /app

#Enable AUTH by default
ENV DISABLE_AUTH=false
# Set default admin password to empty, to force user to set it in setup or env
ENV DEFAULT_ADMIN_PASSWORD=''

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY src ./src

# Create necessary directories with correct permissions
RUN mkdir -p /logs /config /certs /app/public && \
    chmod 777 /logs /config /certs && \
    cp -r /app/src/public-template/* /app/public/

# Set command to run
CMD ["node", "src/app.js"]