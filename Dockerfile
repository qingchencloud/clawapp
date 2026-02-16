FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production
COPY server/ ./server/
COPY h5/dist/ ./h5/dist/
EXPOSE 3210
CMD ["node", "server/index.js"]
