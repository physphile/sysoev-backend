# Stage 1: Base image for installing dependencies and building
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Copy package.json, bun.lock and patches
COPY package.json bun.lock ./
COPY patches ./patches/

# Install all dependencies (including dev dependencies)
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Stage 2: Build the application
FROM base AS build
RUN bun build --compile --outfile=index ./src/index.ts

# Stage 3: Production image
FROM oven/bun:1-alpine AS production
WORKDIR /app

# Copy the built binary from the build stage
COPY --from=build /app/index .

# Expose the port the app runs on
EXPOSE 3000

# Set the command to start the application
CMD ["./index"]
