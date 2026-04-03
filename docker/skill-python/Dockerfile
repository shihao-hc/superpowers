FROM python:3.11-slim

# Install common dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN useradd -m -u 1000 skilluser
USER skilluser
WORKDIR /home/skilluser/app

# Copy requirements if they exist (will be mounted at runtime)
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt

# Default command (will be overridden)
CMD ["python", "--version"]