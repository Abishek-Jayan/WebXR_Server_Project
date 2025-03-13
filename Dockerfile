# Using Python official image
FROM python:3.11-slim

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for EGL and OpenGL
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libegl1-mesa \
    libegl1 \
    libosmesa6 \
    mesa-utils \
    && rm -rf /var/lib/apt/lists/*


# Set working directory
WORKDIR /app

# Copy only requirements.txt first to leverage Docker caching
COPY ./requirements.txt /app/requirements.txt

# Install required Python packages
RUN pip install -r requirements.txt
RUN pip install PyOpenGL


# Copy the rest of the application
COPY . /app

# Expose port 5000
EXPOSE 5000

# Start the application
ENTRYPOINT [ "python" ]
CMD [ "app.py" ]
