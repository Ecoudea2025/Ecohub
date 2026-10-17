from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import endpoints

app = FastAPI(title="Academic Aggregator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    print("STARTING UP: Creating database and tables...")
    from app.database import create_db_and_tables
    create_db_and_tables()
    
    # SEED DATA
    from app.database import engine
    from app.models import Repository
    from sqlmodel import Session, select
    with Session(engine) as session:
        existing = session.exec(select(Repository)).first()
        if not existing:
            repos = [
                Repository(name="arXiv", source_type="API", base_url="http://export.arxiv.org/api/query"),
                Repository(name="World Bank", source_type="API", base_url="https://search.worldbank.org/api/v2/wds"),
                Repository(name="Generic Scraper", source_type="SCRAPE", base_url="SCRAPE"),
                Repository(name="OpenAlex", source_type="API", base_url="https://api.openalex.org"),
                Repository(name="DOAJ", source_type="API", base_url="https://doaj.org/api/v2"),
                Repository(name="Dialnet", source_type="SCRAPE", base_url="https://dialnet.unirioja.es")
            ]
            session.add_all(repos)
            session.commit()
            print("STARTING UP: Database seeded with default repositories!")
            
    print("STARTING UP: Database and tables created!")

@app.get("/")
def root():
    return {"message": "Academic Aggregator API"}

app.include_router(endpoints.router, prefix="/api/v1")
