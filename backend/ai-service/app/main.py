from fastapi import FastAPI

app = FastAPI(title="MarkSync ai Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
