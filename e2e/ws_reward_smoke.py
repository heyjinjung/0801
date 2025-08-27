from playwright.sync_api import sync_playwright
import time, sys, os, requests

# 컨테이너/호스트 모두에서 동작하도록 환경변수 우선 사용
FRONTEND_BASE = os.getenv("FRONTEND_BASE", "http://localhost:3000")
BACKEND_BASE = os.getenv("BACKEND_BASE", "http://localhost:8000")

# This smoke test asserts that when a reward is granted, the UI GOLD updates immediately
# via WebSocket handler (applyReward) before a full hydration occurs.

def api_fetch(path, method='POST', data=None, headers=None):
    url = BACKEND_BASE + path
    try:
        res = requests.request(method=method, url=url, json=data, headers=headers or {}, timeout=15)
        try:
            return { 'status': res.status_code, 'json': res.json() }
        except Exception:
            return { 'status': res.status_code, 'text': res.text }
    except requests.RequestException as e:
        return { 'status': 0, 'error': str(e) }

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(FRONTEND_BASE, wait_until='domcontentloaded')
        # create a transient user
        uname = f"ws_smoke_{int(time.time())}"
        phone = f"010{int(time.time())%100000000:08d}"
        signup = {"invite_code":"5858","nickname":uname,"site_id":uname,"phone_number":phone,"password":"pass1234"}
        r = api_fetch('/api/auth/signup', 'POST', signup)
        if r['status'] not in (200, 400):
            print('signup failed', r)
            browser.close()
            return 2
        # 로그인 재시도(backoff) – 가입 직후 일시적 5xx 완화
        def login_with_retry(uid: str, pw: str):
            backoffs = [0.3, 0.6, 1.0, 1.5, 2.0]
            last = None
            for t in backoffs:
                time.sleep(t)
                last = api_fetch('/api/auth/login', 'POST', {"site_id": uid, "password": pw})
                if last.get('status') == 200:
                    return last
            return last or { 'status': 0, 'error': 'no attempt' }

        r_login = login_with_retry(uname, 'pass1234')
        if r_login['status'] != 200:
            print('login failed', r_login)
            browser.close()
            return 3
        token = (r_login.get('json') or {}).get('access_token')
        if not token:
            print('no token')
            browser.close()
            return 4
        headers = { 'Authorization': f'Bearer {token}' }
        # set tokens into frontend localStorage so UI can authenticate
        page.evaluate("""
            (t) => {
                try {
                    localStorage.setItem('cc_auth_tokens', JSON.stringify({ access_token: t, refresh_token: t }));
                    localStorage.setItem('cc_access_token', t);
                } catch(e) {}
            }
        """, token)
        # navigate to profile where GOLD is rendered
        page.goto(FRONTEND_BASE + '/profile', wait_until='domcontentloaded')
        # wait briefly for initial hydrate and render
        try:
            page.wait_for_selector("text=현재 보유 골드", timeout=2000)
        except Exception:
            pass
        time.sleep(0.4)
        # helper to scrape GOLD number from DOM (uses the big highlighted number)
        def read_gold_dom():
            try:
                # 1) Preferred: highlighted number
                txt = page.eval_on_selector('.text-gradient-gold', "el => (el.textContent||'').replace(/[^0-9]/g,'')")
                if txt:
                    return int(txt or '0')
                # 2) Label-anchored: find number nearest to '현재 보유 골드'
                near = page.evaluate("""
                    () => {
                        function readGoldNearLabel() {
                            const label = Array.from(document.querySelectorAll('*')).find(e => /현재\s*보유\s*골드/.test((e.textContent||'').trim()));
                            if (!label) return null;
                            const root = label.closest('section,div,main,article') || document.body;
                            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                            let best = 0; let bestDist = Infinity;
                            const labelEl = label.nodeType===1 ? label : label.parentElement;
                            const re = /\d{1,9}(?:,\d{3})*/g;
                            function dist(a,b){
                                try { const ra=a.getBoundingClientRect(); const rb=b.getBoundingClientRect(); return Math.hypot(ra.left-rb.left, ra.top-rb.top); } catch(e){ return 0; }
                            }
                            while (walker.nextNode()) {
                                const t = walker.currentNode;
                                const s = t.nodeValue || '';
                                const m = s.match(re);
                                if (m) {
                                    const el = t.parentElement || labelEl;
                                    const n = parseInt(m[0].replace(/,/g,''));
                                    const d = dist(labelEl, el);
                                    if (d < bestDist || (d < 200 && n > best)) { best = n; bestDist = d; }
                                }
                            }
                            return best || null;
                        }
                        return readGoldNearLabel();
                    }
                """)
                if isinstance(near, int) and near > 0:
                    return near
                return 0
            except Exception:
                # fallback: scan for the largest number in the document
                try:
                    alltxt = page.evaluate("() => document.body.innerText || ''")
                    import re
                    nums = [int(x.replace(',', '')) for x in re.findall(r"\b\d{1,9}\b", alltxt)]
                    return max(nums) if nums else 0
                except Exception:
                    return 0

        # capture current GOLD from DOM (primary) and via API (diagnostic)
        before_gold_dom = read_gold_dom()
        bal = api_fetch('/api/users/balance', 'GET', None, headers)
        before_gold_api = int((bal.get('json') or {}).get('gold') or (bal.get('json') or {}).get('gold_balance') or 0) if bal['status']==200 else None
        # trigger a small reward via central endpoint
        grant = api_fetch('/api/rewards/distribute', 'POST', {"user_id": (r_login.get('json') or {}).get('user',{}).get('id'), "reward_type": "gold", "amount": 3, "source_description": "ws_smoke"}, headers)
        if grant['status'] != 200:
            print('reward distribute failed', grant)
            browser.close()
            return 6
        # Immediately after grant, UI should update quickly via WS; poll DOM up to ~1.6s
        target_increase = 3
        succeeded = False
        for _ in range(8):
            time.sleep(0.2)
            now_dom = read_gold_dom()
            if now_dom >= before_gold_dom + target_increase:
                succeeded = True
                break
        if not succeeded:
            # As a fallback, check API and log for diagnostics
            bal2 = api_fetch('/api/users/balance', 'GET', None, headers)
            after_gold_api = int((bal2.get('json') or {}).get('gold') or (bal2.get('json') or {}).get('gold_balance') or 0) if bal2['status']==200 else None
            print('DOM did not reflect increase. before_dom=', before_gold_dom, 'now_dom=', read_gold_dom(), 'api_before=', before_gold_api, 'api_after=', after_gold_api)
            browser.close()
            return 8
        print('WS reward smoke passed (DOM)', before_gold_dom, '->', read_gold_dom())
        browser.close()
        return 0

if __name__ == '__main__':
    rc = run()
    print('exit code', rc)
    sys.exit(rc)
