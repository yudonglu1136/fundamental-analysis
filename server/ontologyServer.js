import cors from "cors";
import express from "express";

import { requireAuth } from "./auth/requireAuth.js";
import { publicOntologySnapshotInfo, registerOntologyRoutes } from "./ontologyClient.js";
import { installJsonTransport } from "./jsonTransport.js";

const app = express();
const host = process.env.ONTOLOGY_API_HOST || "127.0.0.1";
const port = Number(process.env.ONTOLOGY_API_PORT || 8791);
const allowedOrigins = String(process.env.API_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed"));
  },
  allowedHeaders: ["authorization", "content-type", "if-none-match"],
  methods: ["GET", "OPTIONS"]
}));
installJsonTransport(app);

app.get("/health", (_request, response) => {
  response.json({ service: "ontology-api", ...publicOntologySnapshotInfo() });
});

app.use("/api", requireAuth);
registerOntologyRoutes(app);

app.use((_request, response) => {
  response.status(404).json({ error: "not_found" });
});

app.use((error, _request, response, _next) => {
  response.status(500).json({ error: "internal_error", message: error.message });
});

app.listen(port, host, () => {
  console.log(`Ontology API listening on http://${host}:${port}`);
});
