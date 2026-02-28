from models import WellOut, SensorReadingCreate, TriageOut, AlertOut, DashboardStats

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/wells", response_model=list[WellOut])
def wells():
    ...

@app.post("/ingest")
def ingest(readings: list[SensorReadingCreate]):
    ...

@app.post("/triage", response_model=TriageOut)
def triage():
    ...

@app.get("/alerts", response_model=list[AlertOut])
def alerts():
    ...