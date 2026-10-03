import logging
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from app.models import Document, SearchJob
from sqlmodel import Session
from app.database import engine
from app.services.connector import SourceConnector

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Orchestrator
class SearchAgent:
    def __init__(self):
        self.sources = []

    def register_source(self, connector: SourceConnector):
        self.sources.append(connector)

    def run_search(self, job_id: str, query: str):
        logger.info(f"Starting search for job {job_id} with query '{query}'")
        
        all_docs = []
        
        with Session(engine) as session:
            job = session.get(SearchJob, job_id)
            if not job:
                logger.error(f"Job {job_id} not found")
                return

            job.status = "processing"
            session.add(job)
            session.commit()

            try:
                # Only search enabled sources
                from app.models import Repository
                from sqlmodel import select
                enabled_sources = session.exec(select(Repository).where(Repository.enabled == True)).all()
                enabled_names = [s.name for s in enabled_sources]

                for source in self.sources:
                    # if source.name not in enabled_names:
                    #     logger.info(f"Skipping disabled source: {source.name}")
                    #     continue
                        
                    try:
                        docs = source.search(query)
                        all_docs.extend(docs)
                    except Exception as e:
                        logger.error(f"Error searching {source.name}: {e}")
                
                # Deduplication
                unique_docs = {d.hash_id: d for d in all_docs}
                final_docs = list(unique_docs.values())[:30]

                # Save to DB
                for doc in final_docs:
                    doc.job_id = job_id  # Link document to this job
                    session.add(doc)
                
                job.status = "completed"
                job.results_count = len(final_docs)
                session.add(job)
                session.commit()
                logger.info(f"Job {job_id} completed with {len(all_docs)} results")

            except Exception as e:
                logger.error(f"Job {job_id} failed: {e}")
                job.status = "failed"
                job.error_log = str(e)
                session.add(job)
                session.commit()

# Instantiate and register sources
from app.services.sources.arxiv_source import ArxivSource
from app.services.sources.worldbank_source import WorldBankSource
from app.services.sources.generic_scraper import GenericScraper
from app.services.sources.openalex_source import OpenAlexSource
from app.services.sources.doaj_source import DOAJSource
from app.services.sources.dialnet_scraper import DialnetScraper

search_agent = SearchAgent()
search_agent.register_source(ArxivSource())
search_agent.register_source(WorldBankSource())
search_agent.register_source(GenericScraper())
search_agent.register_source(OpenAlexSource())
search_agent.register_source(DOAJSource())
search_agent.register_source(DialnetScraper())
