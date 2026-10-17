from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlmodel import Session, select
from app.database import get_session
from app.models import Repository, SearchJob, Document
from typing import List, Optional
from uuid import uuid4

router = APIRouter()

import unicodedata

def normalize_text(text: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', text)
                   if unicodedata.category(c) != 'Mn')

@router.post("/search", status_code=202)
def start_search(
    query: str, 
    background_tasks: BackgroundTasks, 
    normalize: bool = False,
    session: Session = Depends(get_session)
):
    final_query = query
    if normalize:
        final_query = normalize_text(query)
    
    job_id = str(uuid4())
    job = SearchJob(id=job_id, query=final_query, status="pending")
    session.add(job)
    session.commit()
    
    from app.services.search_agent import search_agent
    background_tasks.add_task(search_agent.run_search, job_id, final_query)
    return {"job_id": job_id, "status": "pending"}

@router.get("/search/{job_id}")
def get_search_status(job_id: str, session: Session = Depends(get_session)):
    job = session.get(SearchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Get results for this specific job
    results = session.exec(select(Document).where(Document.job_id == job_id)).all()
    
    return {"job": job, "results": results}

@router.get("/repos", response_model=List[Repository])
def list_repos(session: Session = Depends(get_session)):
    repos = session.exec(select(Repository)).all()
    return repos

@router.post("/repos")
def update_repo(repo: Repository, session: Session = Depends(get_session)):
    session.merge(repo)
    session.commit()
    return {"status": "ok"}

@router.get("/doc/{doc_id}")
def get_document(doc_id: int, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

# Startup logic moved to main.py
