import warnings

# Pydantic v2 및 passlib 관련 잔여 deprecated / crypt 경고 무시 (테스트 출력 청결)
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    message=r"Pydantic settings.*"
)
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    message=r"`class Config`.*deprecated"
)
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"passlib.handlers.*"
)

# 필요 시 특정 라이브러리 FutureWarning 제거
warnings.filterwarnings("ignore", category=FutureWarning, module=r"passlib")
"""
테스트를 위한 기본 환경설정
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base
from app.database import get_db
from app.main import app
from fastapi.testclient import TestClient
import os

# Set test environment variables
os.environ["TESTING"] = "true"

# CI 최소 모드에서 ci_core 마커 아닌 테스트 스킵
def pytest_collection_modifyitems(config, items):
    if os.environ.get("CI_MINIMAL") == "1":
        selected = []
        deselected = []
        for item in items:
            if item.get_closest_marker("ci_core"):
                selected.append(item)
            else:
                deselected.append(item)
                # app/tests 아래는 항상 제외 (legacy noisy)
                node_path = str(item.fspath)
                if "app/tests" in node_path.replace('\\', '/'):
                    deselected.append(item)
                    continue
        if deselected:
            for d in deselected:
                d.add_marker(pytest.mark.skip(reason="CI_MINIMAL=1 비핵심 테스트 스킵"))

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session")
def db_engine():
    """Provide a shared SQLAlchemy engine for tests.
    This satisfies dependencies like db_session that expect a db_engine fixture.
    """
    return engine

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """테스트 데이터베이스 설정"""
    Base.metadata.create_all(bind=engine)
    yield
    # 테스트 후 클린업 (옵션)
    # Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    db = TestingSessionLocal(bind=connection)

    try:
        yield db
    finally:
        db.close()
        transaction.rollback()
        connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    del app.dependency_overrides[get_db]
