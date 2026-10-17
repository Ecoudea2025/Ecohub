from app.models import Document

class SourceConnector:
    def __init__(self, name):
        self.name = name

    def search(self, query: str, max_results: int = 10) -> list[Document]:
        raise NotImplementedError
