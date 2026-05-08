# main.py — Autonomous Drone Update Server
#
# WHAT THIS SERVER DOES:
#   1. Anyone can create an account (POST /register)
#   2. Users log in and get a token (POST /login)
#   3. Logged-in users can check for app updates (GET /version, GET /update)
#
# HOW USERS ARE STORED:
#   A simple JSON file (users.json) acts as the database.
#   This is fine for a prototype — no extra setup needed.
#   In a real product you'd swap this for PostgreSQL or SQLite.

from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import json
import os

SECRET_KEY = "drone-secret-key-change-this-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60

LATEST_VERSION = "1.0.0"
RELEASE_NOTES = "Initial release — BLE connection and manual controls"
EXPO_UPDATE_CHANNEL = "main"

USERS_FILE = "users.json"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def load_users() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, "r") as f:
        return json.load(f)


def save_users(users: dict):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


def get_user(username: str) -> dict | None:
    users = load_users()
    return users.get(username)


def create_user(username: str, password: str) -> dict:
    users = load_users()
    hashed = pwd_context.hash(password)
    users[username] = {
        "username": username,
        "hashed_password": hashed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    save_users(users)
    return {"username": username, "created_at": users[username]["created_at"]}


class RegisterRequest(BaseModel):
    username: str
    password: str


app = FastAPI(
    title="Autonomous Drone Update Server",
    description="Handles user accounts and app version updates for the drone mobile app.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None or get_user(username) is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")


@app.get("/")
def root():
    return {"status": "Drone update server is online"}


@app.post("/register", status_code=201)
def register(body: RegisterRequest):
    if len(body.username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters")

    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    if get_user(body.username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken — please choose another")

    user = create_user(body.username, body.password)
    return {
        "message": "Account created successfully",
        "username": user["username"],
    }


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)

    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_token(form_data.username)
    return {"access_token": token, "token_type": "bearer"}


@app.get("/version")
def get_version(current_user: str = Depends(get_current_user)):
    return {
        "latest_version": LATEST_VERSION,
        "release_notes": RELEASE_NOTES,
        "expo_update_channel": EXPO_UPDATE_CHANNEL,
        "checked_by": current_user,
    }


@app.get("/update")
def get_update(current_user: str = Depends(get_current_user)):
    return {
        "version": LATEST_VERSION,
        "expo_update_channel": EXPO_UPDATE_CHANNEL,
        "message": "Update available via Expo",
        "requested_by": current_user,
    }


@app.get("/me")
def get_my_info(current_user: str = Depends(get_current_user)):
    user = get_user(current_user)
    return {
        "username": user["username"],
        "created_at": user["created_at"],
    }