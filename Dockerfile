FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && apt-get clean

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY src ./src

ENV NODE_ENV=production

EXPOSE 3000

VOLUME ["/certs", "/config"]

CMD ["node", "src/index.js"]

LABEL org.opencontainers.image.title="cert-manager" \
      org.opencontainers.image.description="Certificate management tool for self signed certificates." \
      org.opencontainers.image.vendor="Christian Meiners"