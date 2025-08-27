from playwright.sync_api import sync_playwright
import time, uuid, sys, json, os, requests

# 컨테이너/호스트 모두에서 동작하도록 환경변수 우선 사용
FRONTEND_BASE = os.getenv("FRONTEND_BASE", "http://localhost:3000")
BACKEND_BASE = os.getenv("BACKEND_BASE", "http://localhost:8000")

# UI routes to visit for each game
GAME_ROUTES = {
    'slot': '/games/slot',
    'gacha': '/games/gacha',
    'crash': '/games/crash',
    'battlepass': '/battlepass',
}
EVENT_ROUTE = '/events'

def api_fetch(path, method='POST', data=None, headers=None):
    """Server-side API call using requests to avoid browser CORS in tests."""
    url = BACKEND_BASE + path
    try:
        res = requests.request(method=method, url=url, json=data, headers=headers or {}, timeout=15)
        try:
            return { 'status': res.status_code, 'json': res.json() }
        except Exception:
            return { 'status': res.status_code, 'text': res.text }
    except requests.RequestException as e:
        return { 'status': 0, 'error': str(e) }


def visit_or_api(page, ui_path, api_path, headers=None, action_name='visit'):
    try:
        print(f'Trying UI {action_name} at {ui_path}')
        page.goto(FRONTEND_BASE + ui_path, wait_until='domcontentloaded')
        time.sleep(0.5)
        # simple heuristic: if page shows 404 title, treat as missing
        if page.title().strip().startswith('404'):
            raise Exception('UI 404')
        print(f'UI {action_name} OK: {ui_path}')
        return True
    except Exception as e:
        print(f'UI {action_name} failed ({e}), trying API {api_path}')
        res = api_fetch(api_path, 'POST', {}, headers)
        print(f'API {action_name} status', res.get('status'))
        return res.get('status') == 200


def run():
    uid = str(int(time.time()))
    # Make phone number unique per run to avoid duplicate registration
    phone_unique = f"010{int(uid) % 100000000:08d}"
    signup_payload = {
        "invite_code": "5858",
        "nickname": f"e2e_user_{uid}",
        "site_id": f"e2e_user_{uid}",
        "phone_number": phone_unique,
        "password": "pass1234",
    }
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        print("Opening frontend...", FRONTEND_BASE)
        page.goto(FRONTEND_BASE, wait_until='domcontentloaded')

        print("Signup via backend /api/auth/signup")
        r = api_fetch('/api/auth/signup', 'POST', signup_payload)
        print('signup status', r['status'])
        # If phone already exists or other duplicate, attempt login fallback
        if r['status'] == 400:
            body = r.get('json') or {}
            detail = body.get('detail') if isinstance(body, dict) else None
            if isinstance(detail, str) and '이미 등록된' in detail:
                print('Phone already registered, trying login fallback')
                r_login = api_fetch('/api/auth/login', 'POST', {'site_id': signup_payload['site_id'], 'password': signup_payload['password']})
                print('login fallback status', r_login.get('status'))
                if r_login.get('status') != 200:
                    print('Login fallback failed', r_login)
                    browser.close()
                    return 2
                else:
                    r2 = r_login
            else:
                print('Signup failed', r)
                browser.close()
                return 2
        elif r['status'] != 200:
            print('Signup failed', r)
            browser.close()
            return 2
        else:
            # proceed to login with small delay and retries (handles eventual consistency)
            def login_with_retry(site_id, password):
                delays = [0.3, 0.5, 0.8, 1.2, 1.5]
                last = None
                # initial small delay to allow signup side-effects to settle
                time.sleep(0.3)
                for i, d in enumerate(delays, start=1):
                    lr = api_fetch('/api/auth/login', 'POST', {'site_id': site_id, 'password': password})
                    print(f'login attempt {i} status', lr.get('status'))
                    if lr.get('status') == 200:
                        return lr
                    last = lr
                    time.sleep(d)
                return last or { 'status': 0, 'error': 'no response' }

            r2 = login_with_retry(signup_payload['site_id'], signup_payload['password'])

        print('login status', r2['status'])
        if r2['status'] != 200:
            print('Login failed', r2)
            browser.close()
            return 3
        data = r2.get('json') or {}
        token = data.get('access_token')
        user_id = data.get('user', {}).get('id')
        print('got token and user', bool(token), user_id)
        if not token:
            print('No token in login response', data)
            browser.close()
            return 4

        headers = { 'Authorization': f'Bearer {token}' }

        # Visit/Play each game UI or fallback to API actions
        for game, route in GAME_ROUTES.items():
            print('\n---', game, '---')
            # Map to real API endpoints and payloads
            if game == 'slot':
                api_action = '/api/games/slot/spin'
            elif game == 'gacha':
                api_action = '/api/games/gacha/pull'
            elif game == 'crash':
                api_action = '/api/games/crash/bet'
            elif game == 'battlepass':
                # prefer UI; fallback to session active check
                api_action = '/api/games/session/active'
            else:
                api_action = f'/api/games/{game}/play'
            ok = visit_or_api(page, route, api_action, headers=headers, action_name=f'play {game}')
            if not ok:
                print(f'Failed game {game} path')
                page.screenshot(path=f'e2e_failure_{game}.png', full_page=True)
                browser.close()
                return 6
            # small wait between games
            time.sleep(0.3)

        # Event page
        print('\n--- event page ---')
        ok = visit_or_api(page, EVENT_ROUTE, '/api/events/list', headers=headers, action_name='visit events')
        if not ok:
            print('Event page check failed')
            page.screenshot(path='e2e_failure_events.png', full_page=True)
            browser.close()
            return 7

        # quick in-UI navigation to profile to ensure user state persists
        try:
            page.goto(FRONTEND_BASE + '/profile', wait_until='domcontentloaded')
            time.sleep(0.2)
            print('Profile page title', page.title())
        except Exception:
            print('Profile UI check failed; attempting API profile fetch')
            p = api_fetch(f'/api/users/{user_id}/profile', 'GET', None, headers)
            print('profile api status', p.get('status'))
            if p.get('status') != 200:
                page.screenshot(path='e2e_failure_profile.png', full_page=True)
                browser.close()
                return 8

        print('\nFull game journey E2E succeeded')
        browser.close()
        return 0

if __name__ == '__main__':
    rc = run()
    print('exit code', rc)
    sys.exit(rc)
