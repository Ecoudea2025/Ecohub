# Academic Document Aggregator

A web application to search and aggregate academic documents from multiple sources (API & Scraping).

## Features
- Search **arXiv**, **World Bank**, and more.
- View metadata, abstracts, and direct PDF links.
- Modern React UI with Material Design.
- FastAPI backend with asynchronous search agent.

## Project Structure
- `backend/`: FastAPI application, SQLModel, Agent logic.
- `frontend/`: React + Vite + MUI application.

## Prerequisites
- Docker & Docker Compose OR Python 3.10+ & Node.js 18+

## Quick Start (Docker)
1. Run `docker-compose up --build`
2. Open `http://localhost:5173` to browse.
3. Backend API docs at `http://localhost:8000/docs`.

## Manual Setup
### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Configuration
Go to `/config` page (or manage DB) to enable/disable sources.
Currently active sources:
1. **arXiv** (API)
2. **World Bank** (API)
3. **Generic Scraper** (Mock/Test)
