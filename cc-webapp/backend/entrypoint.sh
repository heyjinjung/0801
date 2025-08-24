#!/bin/sh

# Map env defaults from POSTGRES_* to expected vars if not set
: "${DB_HOST:=${POSTGRES_SERVER:-postgres}}"
: "${DB_PORT:=${POSTGRES_PORT:-5432}}"
: "${DB_USER:=${POSTGRES_USER:-cc_user}}"
: "${DB_PASSWORD:=${POSTGRES_PASSWORD:-cc_password}}"
: "${DB_NAME:=${POSTGRES_DB:-cc_webapp}}"

# PostgreSQL 연결 대기
echo "Waiting for PostgreSQL..."
while ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
    sleep 1
done
echo "PostgreSQL is ready!"

# PostgreSQL DB 자동 생성
echo "Checking if database $DB_NAME exists..."
DB_EXIST=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';")
if [ "$DB_EXIST" != "1" ]; then
  echo "Database $DB_NAME does not exist. Creating..."
  PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -U $DB_USER -p $DB_PORT $DB_NAME
  echo "Database $DB_NAME created."
else
  echo "Database $DB_NAME already exists."
fi

# Redis 연결 확인 (비밀번호 지원)
echo "Checking Redis connection..."
python - <<'PY'
import os
import redis

host = os.getenv('REDIS_HOST', 'localhost')
port = int(os.getenv('REDIS_PORT', 6379))
password = os.getenv('REDIS_PASSWORD')

try:
  r = redis.Redis(host=host, port=port, password=password, socket_connect_timeout=3)
  r.ping()
  print('Redis is ready!')
except Exception as e:
  print(f'Redis check skipped/failed: {e}')
PY

# Alembic 버전 테이블 생성 보장 후 컬럼 길이 보정
echo "Ensuring alembic_version table and column width..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(255) NOT NULL);" || true
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -v ON_ERROR_STOP=0 -c \
  "ALTER TABLE IF EXISTS alembic_version ALTER COLUMN version_num TYPE VARCHAR(255);" || true

# If alembic_version was pre-seeded but core tables are missing, reset it
USERS_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -tAc "SELECT to_regclass('public.users') IS NOT NULL;" | tr -d '[:space:]')
CUR_VER=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -tAc "SELECT version_num FROM alembic_version LIMIT 1;" 2>/dev/null | tr -d '[:space:]')
if [ "$USERS_EXISTS" = "f" ] && [ "$CUR_VER" = "79b9722f373c" ]; then
  echo "Users table missing but alembic_version is at base. Resetting alembic_version to rerun initial migration..."
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -c "DELETE FROM alembic_version;" || true
fi

# If alembic_version is empty but core tables already exist, seed baseline to skip re-creating base tables
if [ -z "$CUR_VER" ] || [ "$CUR_VER" = "" ]; then
  SEEDED_USERS_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -tAc "SELECT to_regclass('public.users') IS NOT NULL;" | tr -d '[:space:]')
  if [ "$SEEDED_USERS_EXISTS" = "t" ]; then
    echo "alembic_version empty but core table 'users' exists. Seeding baseline revision 79b9722f373c..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -c "INSERT INTO alembic_version (version_num) VALUES ('79b9722f373c');" || true
    CUR_VER=79b9722f373c
  fi
fi

# Alembic 마이그레이션 실행
echo "Running database migrations..."
alembic upgrade head || { echo "Alembic migration failed"; exit 1; }

# 초기 데이터 설정 (초대 코드 생성 등)
echo "Setting up initial data... (SKIPPED: app/core/init_db.py not found)"
# python -c "
# from app.core.init_db import init_db
# init_db()
# print('Initial data setup completed!')
# "

# FastAPI 애플리케이션 실행
echo "Starting FastAPI application..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload