from fastapi import FastAPI
from rdflib import Graph, Namespace
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000"],  # Adjust the allowed origins as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define RDF Namespace
APP = Namespace("http://example.org/app/")

# Load RDF data from TTL file
g = Graph()
g.parse("apps_and_files.ttl", format="turtle")

class SPARQLQuery(BaseModel):
    nodesQuery: str
    edgesQuery: str
    groupsQuery: str = ""  # Make groupsQuery optional

@app.post("/query")
async def process_sparql_query(queries: SPARQLQuery):
    # Process each SPARQL query and collect the results
    nodes_results = g.query(queries.nodesQuery)
    edges_results = g.query(queries.edgesQuery)

    nodes = [{"id": str(row[0]), "label": str(row[1]), "type": str(row[2])} for row in nodes_results]
    edges = [{"source": str(row[0]), "target": str(row[1])} for row in edges_results]

    groups = []
    if queries.groupsQuery:  # Only process groups if the query is provided
        groups_results = g.query(queries.groupsQuery)
        groups = [{"id": str(row[0]), "type": str(row[1])} for row in groups_results]
    
    print("Nodes: {}".format(nodes))
    print("Edges: {}".format(edges))
    print("Groups: {}".format(groups))

    return {"nodes": nodes, "edges": edges, "groups": groups}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
