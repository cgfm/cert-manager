FROM node:20-slim

# Install OpenSSL
RUN apt-get update && apt-get install -y openssl && apt-get clean

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY src ./src

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "src/index.js"]