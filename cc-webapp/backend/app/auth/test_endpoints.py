from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/test", tags=["�׽�Ʈ"])

class TestUserCreate(BaseModel):
    site_id: str
    password: str
    nickname: str

@router.post("/simple-register")
async def simple_register(user: TestUserCreate):
    """������ �׽�Ʈ�� ȸ������"""
    try:
        return {"message": "�׽�Ʈ ����", "user": user.site_id}
    except Exception as e:
        return {"error": str(e)}
