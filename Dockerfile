FROM node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p /app/sessions

EXPOSE 8080

CMD ["npm", "start"]
