import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app";
import { logger } from "./lib/logger";

const AI_SERVICE_URL = (
  process.env.DOHAY_AI_INTERNAL_URL ?? "http://127.0.0.1:8765"
).replace(/\/+$/, "");

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForAiService(child: ChildProcess | null): Promise<void> {
  const deadline = Date.now() + 45_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`FastAPI exited before startup (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`${AI_SERVICE_URL}/healthz`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`FastAPI health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }

  throw new Error("FastAPI did not become ready within 45 seconds.", {
    cause: lastError,
  });
}

async function start(): Promise<void> {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const aiProcess = process.env.DOHAY_AI_INTERNAL_URL
    ? null
    : spawn(
        process.env.PYTHON_BIN ?? "python3",
        [
          "-m",
          "uvicorn",
          "main:app",
          "--app-dir",
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../fastapi",
          ),
          "--host",
          "127.0.0.1",
          "--port",
          "8765",
          "--log-level",
          "warning",
        ],
        { stdio: "inherit", env: process.env },
      );

  if (aiProcess) {
    aiProcess.on("error", (err) => {
      logger.error({ err }, "Could not start the FastAPI service");
    });
  }

  try {
    await waitForAiService(aiProcess);
  } catch (err) {
    aiProcess?.kill("SIGTERM");
    throw err;
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down");
    aiProcess?.kill("SIGTERM");
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  aiProcess?.on("exit", (code, signal) => {
    if (code !== 0) {
      logger.error({ code, signal }, "FastAPI service exited unexpectedly");
    }
  });
}

void start().catch((err) => {
  logger.fatal({ err }, "Server startup failed");
  process.exit(1);
});
