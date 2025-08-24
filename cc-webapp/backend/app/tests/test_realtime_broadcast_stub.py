import asyncio
import pytest


class StubWS:
    def __init__(self):
        self.sent = []

    async def send_text(self, text: str):
        # hub.broadcast 가 json.dumps 로 문자열 전송하므로 역직렬화하여 보관
        import json
        try:
            self.sent.append(json.loads(text))
        except Exception:
            self.sent.append({"raw": text})


@pytest.mark.asyncio
async def test_hub_broadcast_payload_shape(monkeypatch):
    from app.realtime.hub import hub

    ws = StubWS()
    # 가짜 사용자 1 연결 등록
    await hub.register_user(1, ws)

    # user_id 포함 시 등록된 사용자 채널로 전송됨
    payload = {"type": "test", "foo": "bar", "user_id": 1}
    await hub.broadcast(payload)

    # 모니터 채널에도 동일 payload 전달되므로 최소 한 번 이상 전송됨을 확인
    assert any(msg.get("type") == "test" and msg.get("foo") == "bar" for msg in ws.sent)
