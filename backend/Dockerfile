FROM node:22-alpine

WORKDIR /app

# Copy only package files first, so Docker can cache the installed
# dependencies and skip `npm ci` when only source code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
# Run node directly (not via npm) so it receives Docker's stop signal and
# shuts down right away instead of being killed after a 10 s timeout.
CMD ["node", "src/index.js"]
