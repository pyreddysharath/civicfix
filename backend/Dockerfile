FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV CIVICFIX_DB=/data/civicfix.sqlite3
RUN mkdir /data && useradd -r civicfix && chown civicfix /data
USER civicfix
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "150", "server:application"]
