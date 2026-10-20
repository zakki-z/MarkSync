from fastapi import FastAPI

app = FastAPI(title="MarkSync auth Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
