# Autonomous Drone — Update Server

FastAPI server that handles authentication and app version checking
for the drone mobile app (Expo / React Native).

## What this server does

1. **Authentication** — the mobile app logs in and gets a token
2. **Version check** — the app asks "am I up to date?"
3. **Update info** — tells the app which Expo channel to pull from

The actual app update is delivered by Expo automatically.
This server just handles auth and tells the app an update exists.

---

## Setup (first time only)

```bash
cd server
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run the server

```bash
uvicorn main:app --reload
```

Open http://localhost:8000/docs to test all endpoints interactively.

## Run the tests

```bash
pytest test_main.py -v
```

All 26 tests should pass.

---

## Endpoints

| Method | Endpoint  | Auth required | What it does                        |
|--------|-----------|---------------|-------------------------------------|
| GET    | /         | No            | Health check                        |
| POST   | /login    | No            | Returns a token                     |
| GET    | /version  | Yes           | Returns latest version + Expo info  |
| GET    | /update   | Yes           | Confirms update via Expo channel    |

---

## Dev credentials

| Field    | Value         |
|----------|---------------|
| Username | droneapp      |
| Password | dronepass123  |

---

## How to push a new app version

1. Update `LATEST_VERSION` in `main.py`
2. Update `RELEASE_NOTES` in `main.py`
3. Your teammate runs: `eas update --branch main --message "what changed"`
4. Commit and push server changes to GitHub