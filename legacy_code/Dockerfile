# Using Nvidia cuda official image
FROM nvidia/cudagl:11.4.2-base-ubuntu20.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set NVIDIA driver capabilities for GPU rendering
ENV NVIDIA_DRIVER_CAPABILITIES=compute,graphics,utility,video


# Configure libglvnd for NVIDIA EGL
ENV LIBGLVND_VERSION=v1.3.2
RUN echo '{"file_format_version": "1.0.0", "ICD": {"library_path": "libEGL_nvidia.so.0"}}' > /usr/share/glvnd/egl_vendor.d/10_nvidia.json


# Install OpenGL and EGL runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglvnd0 \
    libgl1 \
    libglx0 \
    libegl1 \
    libgles2 && \
    rm -rf /var/lib/apt/lists/*

# Install development libraries for Pyrender (optional, for building dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libglvnd-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements.txt and install Python packages
COPY ./requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 install --no-cache-dir PyOpenGL PyOpenGL_accelerate

# Copy the rest of the application
COPY . /app

# Expose port 5000
EXPOSE 5000

# Set NVIDIA environment variables for GPU rendering
# ENV __NV_PRIME_RENDER_OFFLOAD=1
# ENV __GLX_VENDOR_LIBRARY_NAME=nvidia
ENV PYOPENGL_PLATFORM=egl
ENV EGL_PLATFORM=surfaceless

# Start the application
ENTRYPOINT ["python3"]
CMD ["app.py"]