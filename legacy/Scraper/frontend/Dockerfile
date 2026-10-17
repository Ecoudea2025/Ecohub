FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build for production
RUN npm run build

# Server static files
# For simplicity in this assignment, we can use `serve` or valid nginx
# But typically for 'dev' we might just run `npm run dev`
# Let's assume production build + serve
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "5173"]
