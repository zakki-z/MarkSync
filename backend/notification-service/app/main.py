from fastapi import FastAPI

app = FastAPI(title="MarkSync notification Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
