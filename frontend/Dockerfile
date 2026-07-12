FROM node:20-alpine

WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source files
COPY . .

# Expose Vite development server port
EXPOSE 5173

# Run Vite with --host to allow external connections
CMD ["npm", "run", "dev", "--", "--host"]
