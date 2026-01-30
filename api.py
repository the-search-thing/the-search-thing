from typing import Union
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/search")
async def search():
    return {"Hello": "World"}
    
@app.get("/api/check")
async def index_exists():
    return {"Hello": "World"}

@app.get("/api/index")
async def index():
    return {"Hello": "World"}
    