import requests
from bs4 import BeautifulSoup
import hashlib
from app.services.connector import SourceConnector
from app.models import Document

class DialnetScraper(SourceConnector):
    def __init__(self):
        super().__init__("Dialnet")
        self.base_url = "https://dialnet.unirioja.es/buscar/documentos"

    def search(self, query: str, max_results: int = 10) -> list[Document]:
        params = {
            "query": query,
            "inicio": 1
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        try:
            response = requests.get(self.base_url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            results = []
            
            # Dialnet results are usually in a list with class 'documento' or similar
            items = soup.select('.informacion')
            
            for item in items[:max_results]:
                title_tag = item.select_one('.titulo a')
                if not title_tag: continue
                
                title = title_tag.get_text(strip=True)
                link = "https://dialnet.unirioja.es" + title_tag['href']
                
                authors = item.select_one('.autores')
                authors_str = authors.get_text(strip=True) if authors else "Unknown"
                
                # Abstract and additional info
                # Dialnet sometimes has a snippet or we need to go to details
                abstract = "See Dialnet page for abstract and full text."
                
                hash_id = hashlib.md5(f"dialnet:{link}".encode()).hexdigest()
                
                doc = Document(
                    title=title,
                    authors=authors_str,
                    source="Dialnet",
                    publication_date=None, # Needs deeper parsing
                    url_pdf=link, # Dialnet link usually leads to PDF or landing page
                    abstract=abstract,
                    is_open_access=False, # Dialnet has mixed OA
                    hash_id=hash_id
                )
                results.append(doc)
            
            return results
            
        except Exception as e:
            print(f"Dialnet search error: {e}")
            return []
