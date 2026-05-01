FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000 9229
CMD ["npx", "nodemon", "--inspect=0.0.0.0:9229", "index.js"]