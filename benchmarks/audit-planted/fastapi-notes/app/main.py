from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel import Session, select

from app.db import get_session
from app.models import Note, User

app = FastAPI(debug=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/users/by-email")
def user_by_email(email: str, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    return user


@app.get("/users/by-name")
def users_by_name(name: str, session: Session = Depends(get_session)):
    rows = session.execute(text(f"SELECT id, name FROM user WHERE name = '{name}'"))
    return [dict(row._mapping) for row in rows]


@app.get("/users/by-name-safe")
def users_by_name_safe(name: str, session: Session = Depends(get_session)):
    rows = session.execute(text("SELECT id, name FROM user WHERE name = :name"), {"name": name})
    return [dict(row._mapping) for row in rows]


@app.get("/notes/by-owner")
def notes_by_owner(session: Session = Depends(get_session)):
    users = session.exec(select(User).limit(100)).all()
    result = {}
    for user in users:
        result[user.id] = session.exec(select(Note).where(Note.owner_id == user.id)).all()
    return result


@app.get("/notes/titles")
def note_titles(session: Session = Depends(get_session)):
    notes = session.exec(select(Note).limit(200)).all()
    titles = []
    for note in notes:
        titles.append(note.title.strip())
    return titles


@app.get("/notes")
def all_notes(session: Session = Depends(get_session)):
    return session.exec(select(Note)).all()
