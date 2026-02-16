FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
EXPOSE 3210
CMD ["node", "index.js"]
