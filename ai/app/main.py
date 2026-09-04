from fastapi import FastAPI

app = FastAPI(
    title="Narrative Intelligence AI Processing",
    description="AI and NLP Processing Layer for Narrative Intelligence",
    version="1.0.0"
)

@app.get("/health")
def health_check():
    """
    Basic health check endpoint.
    """
    return {"status": "ok"}
