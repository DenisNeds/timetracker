FROM node:22-alpine

WORKDIR /app

# Copy only package files first, so Docker can cache the installed
# dependencies and skip `npm ci` when only source code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
