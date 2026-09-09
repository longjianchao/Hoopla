# Use the official nginx image as the base image
FROM nginx:latest

# Set the working directory
WORKDIR /usr/share/nginx/html

# Copy the entire project directory to the nginx directory
COPY . /usr/share/nginx/html/

# Expose the port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]