from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ingest")
def ingest():
    pass

@app.post("/triage")
def triage():
    pass

@app.get("/wells")
def wells():
    pass

@app.get("/alerts")
def alerts():
    pass