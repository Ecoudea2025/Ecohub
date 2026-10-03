import requests
import hashlib
from app.services.connector import SourceConnector
from app.models import Document
from datetime import datetime

class OpenAlexSource(SourceConnector):
    def __init__(self):
        super().__init__("OpenAlex")
        self.base_url = "https://api.openalex.org/works"

    def search(self, query: str, max_results: int = 15) -> list[Document]:
        params = {
            "search": query,
            "per_page": max_results,
            "sort": "relevance",
        }
        
        try:
            # OpenAlex prefers a mailto for their "polite pool"
            headers = {"User-Agent": "AcademicAggregator/1.0 (mailto:admin@example.com)"}
            response = requests.get(self.base_url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = []
            
            for item in data.get('results', []):
                title = item.get('display_name') or "Untitled"
                
                # Authors
                authors_list = [a.get('author', {}).get('display_name') for a in item.get('authorships', [])]
                authors_str = ", ".join(filter(None, authors_list)) or "Unknown Authors"
                
                # DOI is a good hash
                doi = item.get('doi')
                hash_id = hashlib.md5(f"openalex:{doi or title}".encode()).hexdigest()
                
                # PDF/Open Access
                oa = item.get('open_access', {})
                is_oa = oa.get('is_oa', False)
                url_pdf = oa.get('oa_url') or item.get('primary_location', {}).get('landing_page_url')

                # Abstract (OpenAlex uses an inverted index, needs reconstruction usually)
                # For simplicity, we'll check if a snippet is available or just skip for now 
                # as reconstructing from 'abstract_inverted_index' is heavy.
                abstract = "Abstract available on source page."
                if item.get('abstract_inverted_index'):
                    # Reconstruct simply: sort keys by index values
                    index_map = item.get('abstract_inverted_index')
                    word_list = []
                    # index_map is { word: [pos1, pos2], ... }
                    pos_word = []
                    for word, positions in index_map.items():
                        for pos in positions:
                            pos_word.append((pos, word))
                    pos_word.sort()
                    abstract = " ".join([w for p, w in pos_word])

                doc = Document(
                    title=title,
                    authors=authors_str,
                    source="OpenAlex",
                    publication_date=item.get('publication_date'),
                    url_pdf=url_pdf,
                    abstract=abstract[:500] + ("..." if len(abstract) > 500 else ""),
                    is_open_access=is_oa,
                    hash_id=hash_id
                )
                results.append(doc)
                
            return results
            
        except Exception as e:
            print(f"OpenAlex search error: {e}")
            return []
