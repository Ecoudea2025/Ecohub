import requests
import hashlib
from app.services.connector import SourceConnector
from app.models import Document

class DOAJSource(SourceConnector):
    def __init__(self):
        super().__init__("DOAJ")
        self.base_url = "https://doaj.org/api/v2/search/articles/"

    def search(self, query: str, max_results: int = 10) -> list[Document]:
        # DOAJ API expects query as part of the path or as ?q
        url = f"{self.base_url}{query}"
        params = {
            "pageSize": max_results
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = []
            
            for item in data.get('results', []):
                bibjson = item.get('bibjson', {})
                title = bibjson.get('title', 'Untitled')
                
                # Authors
                authors_list = [a.get('name') for a in bibjson.get('author', [])]
                authors_str = ", ".join(filter(None, authors_list)) or "Unknown"
                
                # Links
                url_pdf = None
                for link in bibjson.get('link', []):
                    if link.get('type') == 'fulltext':
                        url_pdf = link.get('content')
                        break
                
                hash_id = hashlib.md5(f"doaj:{item.get('id')}".encode()).hexdigest()
                
                doc = Document(
                    title=title,
                    authors=authors_str,
                    source="DOAJ",
                    publication_date=bibjson.get('year'),
                    url_pdf=url_pdf or f"https://doaj.org/article/{item.get('id')}",
                    abstract=bibjson.get('abstract', 'No abstract available.'),
                    is_open_access=True, # DOAJ is all OA
                    hash_id=hash_id
                )
                results.append(doc)
                
            return results
            
        except Exception as e:
            print(f"DOAJ search error: {e}")
            return []
