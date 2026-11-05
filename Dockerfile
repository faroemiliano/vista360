FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE_URL=/
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/backend
COPY backend/pyproject.toml backend/requirements.lock ./
COPY backend/app ./app
RUN python -m pip install -c requirements.lock '.[s3]'
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --from=frontend /build/frontend/dist /app/frontend/dist
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN useradd --create-home --uid 10001 vista360
USER vista360
ENV FRONTEND_DIST_DIR=/app/frontend/dist
EXPOSE 8000
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
CMD ["web"]
