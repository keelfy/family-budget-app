# Builder stage
FROM python:3.12-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy the dependency specification
COPY pyproject.toml .

# Create a virtual environment and install dependencies
RUN uv venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies using uv
RUN uv pip install -r pyproject.toml

# Final stage
FROM python:3.12-slim AS runner

# Set working directory
WORKDIR /app

# Copy the virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy the application code
COPY app ./app

EXPOSE 8000
CMD ["fastapi", "run", "app/main.py", "--port", "8000", "--host", "0.0.0.0"]
