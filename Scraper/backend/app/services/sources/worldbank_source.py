import requests
from app.services.connector import SourceConnector
from app.models import Document
from datetime import datetime
import hashlib

class WorldBankSource(SourceConnector):
    def __init__(self):
        super().__init__("World Bank")
        # Documents & Reports API
        self.base_url = "https://search.worldbank.org/api/v2/wds"

    def search(self, query: str, max_results: int = 10) -> list[Document]:
        params = {
            "format": "json",
            "qterm": query,
            "rows": max_results,
            "fl": "docdt,docty,display_title,authors,pdfurl,abstract"
        }
        
        try:
            # Need to handle User-Agent for some restrictive APIs, but WB is usually open
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            docs_data = data.get('documents', {})
            
            results = []
            for key, item in docs_data.items():
                # WB returns a dict where keys are IDs
                
                title = item.get('display_title', 'Untitled')
                authors_dict = item.get('authors', {})
                # authors can be a dict or list depending on version
                authors_str = "World Bank"
                if isinstance(authors_dict, dict) and 'author' in authors_dict:
                     authors_str = authors_dict['author'] 
                
                pdf_url = item.get('pdfurl')
                abstract = item.get('abstract')
                date_str = item.get('docdt') # 2023-10-01T00:00:00Z format often
                
                # Create hash
                hash_id = hashlib.md5(f"wb:{key}".encode()).hexdigest()
                
                doc = Document(
                    title=title,
                    authors=str(authors_str),
                    source="World Bank",
                    publication_date=date_str,
                    url_pdf=pdf_url,
                    abstract=abstract,
                    is_open_access=True, # Mostly OA
                    hash_id=hash_id
                )
                results.append(doc)
            
            return results
            
        except Exception as e:
            print(f"World Bank search error: {e}")
            return []
