# Use Node.js as base image
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Define build arguments
ARG VITE_MAPBOX_API_KEY
ARG VITE_API_URL

# Set environment variables for the build
ENV VITE_MAPBOX_API_KEY=${VITE_MAPBOX_API_KEY}
ENV VITE_API_URL=${VITE_API_URL}

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 