FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /var/data

ENV NODE_ENV=production
ENV DB_FILE=/var/data/dcurs.sqlite

EXPOSE 3000

CMD ["npm", "start"]
