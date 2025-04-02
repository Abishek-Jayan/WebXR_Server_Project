# Using Nvidia cuda official image
FROM nvidia/cudagl:11.4.2-base-ubuntu20.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for EGL and OpenGL
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libegl1-mesa \
    libegl1 \
    libosmesa6 \
    mesa-utils \
    && rm -rf /var/lib/apt/lists/*
RUN echo python3 -v

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

ENV __NV_PRIME_RENDER_OFFLOAD=1
ENV __GLX_VENDOR_LIBRARY_NAME=nvidia

#Make sure to install nvidia container toolkit based on ur os, then configure it with docker
#sudo nvidia-ctk runtime configure --runtime=docker
#sudo systemctl restart docker


# Start the application
ENTRYPOINT [ "python3" ]
CMD [ "app.py" ]


# Build the docker application with
# sudo docker build -t flask-app .
# Run it with
#sudo docker run --gpus all -p 5000:5000 flask-app