FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py video.py ./
ENV CIVICFIX_DB=/data/civicfix.sqlite3
RUN mkdir /data && useradd -r civicfix && chown civicfix /data
USER civicfix
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "240", "server:application"]
