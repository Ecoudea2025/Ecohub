from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, JSON

class Repository(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    source_type: str = Field(description="API or SCRAPE")
    base_url: str
    config_json: Optional[str] = Field(default="{}") # Stores headers, selectores, etc.
    enabled: bool = Field(default=True)

class Document(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: Optional[str] = Field(default=None, index=True)  # Link to search job
    title: str
    authors: str
    source: str
    publication_date: Optional[str] = None
    url_pdf: Optional[str] = None
    abstract: Optional[str] = None
    is_open_access: bool = Field(default=False)
    retrieved_at: datetime = Field(default_factory=datetime.utcnow)
    hash_id: str = Field(index=True, unique=True) # For deduplication (e.g., md5 of title+authors or doi)

class SearchJob(SQLModel, table=True):
    id: Optional[str] = Field(default=None, primary_key=True) # uuid
    query: str
    status: str = Field(default="pending") # pending, processing, completed, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    results_count: int = Field(default=0)
    error_log: Optional[str] = None
