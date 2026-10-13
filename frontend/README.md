# GenomeRAG Frontend

React + Vite + Tailwind CSS UI for GenomeRAG: chat with the agent, tune the memory genome, inspect retrieved
memories and agent logs, and run and browse evolution runs.

```powershell
npm install
npm run dev     # http://localhost:5173, proxies /api and /health to the backend on :8000
npm run build   # production build to dist/
```

For a deployed build (Vercel), set `VITE_API_BASE_URL` to the backend URL and redeploy. See `.env.example` and the
root README.
