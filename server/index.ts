import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { loadInvoiceConfig } from "./modules/invoice-extraction/config/invoice-config";
import { startInvoiceExtractionWorker } from "./modules/invoice-extraction/services/invoice-extraction-service";
import {
  mayCaptureJsonResponse,
  resolveRequestId,
  safeApiLogPath,
} from "./request-logging";

const app = express();
loadInvoiceConfig();
app.use(express.json({
  verify: (request, _response, buffer) => {
    if (
      (request as Request).originalUrl ===
      "/api/invoice-extraction/webhooks/openai"
    ) {
      (request as Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const inbound = req.header("x-request-id");
  const requestId = resolveRequestId(inbound);
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const safePath = safeApiLogPath(path);
      const id = (req as Request & { requestId?: string }).requestId;
      let logLine = `${req.method} ${safePath} ${res.statusCode} in ${duration}ms`;
      if (id) {
        logLine += ` requestId=${id}`;
      }
      if (capturedJsonResponse && mayCaptureJsonResponse(path)) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  startInvoiceExtractionWorker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
