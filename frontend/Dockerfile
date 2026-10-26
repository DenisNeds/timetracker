# Stage 1: build the React app into static files (dist/)
FROM node:22-alpine AS build

WORKDIR /app

# Copy only package files first, so Docker can cache the installed
# dependencies and skip `npm ci` when only source code changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: serve the built files with nginx. Node and node_modules stay in
# the build stage, so the final image only holds nginx and a few small files.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
