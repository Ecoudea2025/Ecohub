import requests
import feedparser
from app.services.connector import SourceConnector
from app.models import Document
from datetime import datetime
import hashlib

class ArxivSource(SourceConnector):
    def __init__(self):
        super().__init__("arXiv")
        self.base_url = "http://export.arxiv.org/api/query"

    def search(self, query: str, max_results: int = 10) -> list[Document]:
        params = {
            "search_query": f"all:{query}",
            "start": 0,
            "max_results": max_results,
            "sortBy": "relevance",
            "sortOrder": "descending"
        }
        
        try:
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            
            feed = feedparser.parse(response.content)
            results = []
            
            for entry in feed.entries:
                # Deduplication ID: arXiv ID is stable
                doc_id = entry.link.split('/')[-1]
                hash_id = hashlib.md5(f"arxiv:{doc_id}".encode()).hexdigest()
                
                # Check for PDF link
                pdf_link = None
                for link in entry.links:
                    if link.get('title') == 'pdf':
                        pdf_link = link.href
                
                doc = Document(
                    title=entry.title,
                    authors=", ".join([author.name for author in entry.authors]),
                    source="arXiv",
                    publication_date=entry.published[:10], # YYYY-MM-DD
                    url_pdf=pdf_link or entry.link,
                    abstract=entry.summary,
                    is_open_access=True, # arXiv is always OA
                    hash_id=hash_id
                )
                results.append(doc)
                
            return results
            
        except Exception as e:
            print(f"arXiv search error: {e}")
            return []
