from app.services.sources.arxiv_source import ArxivSource
import logging

logging.basicConfig(level=logging.INFO)

def test_arxiv():
    source = ArxivSource()
    print("Testing arXiv search...")
    try:
        results = source.search("machine learning")
        print(f"Found {len(results)} results")
        for doc in results:
            print(f"- {doc.title}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_arxiv()
