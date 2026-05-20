import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

type RecognitionEnv = {
  ARKME_LLM_PROVIDER?: string;
  ARKME_LLM_BASE_URL?: string;
  ARKME_LLM_MODEL?: string;
  ARKME_LLM_API_KEY?: string;
  ARKME_LLM_THINKING?: string;
  ARKME_LLM_TIMEOUT_MS?: string;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "") as RecognitionEnv;

  return {
    plugins: [react(), arrangementRecognitionPlugin(env)],
    resolve: {
      alias: {
        "@": resolve(rootDir, "src"),
      },
    },
  };
});

function arrangementRecognitionPlugin(env: RecognitionEnv): Plugin {
  return {
    name: "arkme-arrangement-recognition",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url?.split("?")[0];
        if (!requestUrl?.startsWith("/api/arrangements/recognize")) {
          next();
          return;
        }

        try {
          if (requestUrl === "/api/arrangements/recognize/config") {
            writeJson(res, 200, getConfigStatus(env));
            return;
          }

          if (requestUrl !== "/api/arrangements/recognize") {
            writeJson(res, 404, { message: "未找到安排识别接口" });
            return;
          }

          if (req.method !== "POST") {
            writeJson(res, 405, { message: "安排识别只支持 POST" });
            return;
          }

          const config = getRecognitionConfig(env);
          if (!config.apiKey) {
            writeJson(res, 400, {
              code: "not-configured",
              message: "请先在 .env 中配置 ARKME_LLM_API_KEY",
            });
            return;
          }

          const body = await readJsonBody(req);
          const sources = normalizeSources(body);
          if (sources.length === 0) {
            writeJson(res, 400, { message: "没有可识别的安排来源" });
            return;
          }

          const result = await requestRecognition(config, sources, body);
          writeJson(res, 200, { result });
        } catch (error) {
          writeJson(res, 500, {
            message:
              error instanceof Error ? error.message : "安排识别请求失败",
          });
        }
      });
    },
  };
}

function getConfigStatus(env: RecognitionEnv) {
  const config = getRecognitionConfig(env);
  return {
    configured: Boolean(config.apiKey),
    provider: config.provider,
    model: config.model,
  };
}

function getRecognitionConfig(env: RecognitionEnv) {
  return {
    provider: env.ARKME_LLM_PROVIDER || "deepseek",
    baseUrl: env.ARKME_LLM_BASE_URL || "https://api.deepseek.com",
    model: env.ARKME_LLM_MODEL || "deepseek-v4-pro",
    apiKey: env.ARKME_LLM_API_KEY || "",
    thinking: env.ARKME_LLM_THINKING || "disabled",
    timeoutMs: normalizeTimeout(env.ARKME_LLM_TIMEOUT_MS),
  };
}

async function requestRecognition(
  config: ReturnType<typeof getRecognitionConfig>,
  sources: RecognitionSourcePayload[],
  body: Record<string, unknown>
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: buildRecognitionMessages(sources, body),
          temperature: 0.1,
          response_format: { type: "json_object" },
          thinking: { type: config.thinking },
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getRemoteErrorMessage(payload));
    }

    const content = readAssistantContent(payload);
    return normalizeAssistantRecognitionPayload(parseAssistantJson(content));
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRecognitionMessages(
  sources: RecognitionSourcePayload[],
  body: Record<string, unknown>
) {
  const currentTime =
    typeof body.currentTime === "string" ? body.currentTime : new Date().toISOString();
  const currentTimeUtc =
    typeof body.currentTimeUtc === "string" ? body.currentTimeUtc : new Date().toISOString();
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : "local time";
  const timezoneOffsetMinutes =
    typeof body.timezoneOffsetMinutes === "number"
      ? body.timezoneOffsetMinutes
      : null;
  const locale = typeof body.locale === "string" ? body.locale : "zh-CN";

  return [
    {
      role: "system",
      content:
        "你是即我 Demo 的安排识别器。只从用户提供的消息中提取还没发生、需要后续跟进或执行的安排。必须返回严格 JSON，不要输出解释文字。",
    },
    {
      role: "system",
      content:
        "Time handling: interpret all relative dates and spoken times in the provided local timezone. For any concrete time, return an ISO 8601 string with the same explicit timezone offset as currentTime, for example 2026-05-22T15:00:00+08:00. Do not convert local Chinese spoken time into a trailing Z UTC string.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          currentTime,
          currentTimeUtc,
          timeZone,
          timezoneOffsetMinutes,
          locale,
          timeRules: [
            "Use currentTime as the local reference time.",
            "If the source says afternoon 3 o'clock in Chinese, output 15:00 in the local timezone.",
            "Do not output a Z-suffixed UTC timestamp for local Chinese spoken time.",
          ],
          outputSchema: {
            title: "string",
            description: "string",
            timeKind: "none | due | range",
            dueAt: "ISO string or null",
            startAt: "ISO string or null",
            endAt: "ISO string or null",
            location: "string",
            people: "string[]",
            confidence: "low | medium | high",
            reason: "string",
          },
          sources,
        },
        null,
        2
      ),
    },
  ];
}

function parseAssistantJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 没有返回可解析的 JSON");
    return JSON.parse(match[0]) as unknown;
  }
}

function normalizeAssistantRecognitionPayload(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "outputSchema" in value &&
    (value as { outputSchema?: unknown }).outputSchema
  ) {
    return (value as { outputSchema: unknown }).outputSchema;
  }
  return value;
}

function readAssistantContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI 返回为空");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) throw new Error("AI 返回缺少 choices");
  const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = firstChoice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI 返回缺少识别内容");
  }
  return content;
}

function getRemoteErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "DeepSeek 识别请求失败";
}

type RecognitionSourcePayload = {
  id: string;
  type: string;
  title: string;
  text: string;
  createdAt: number;
};

function normalizeSources(body: Record<string, unknown>) {
  const sources = body.sources;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source): RecognitionSourcePayload | null => {
      if (!source || typeof source !== "object") return null;
      const item = source as Partial<RecognitionSourcePayload>;
      if (!item.id || !item.type || !item.text) return null;
      return {
        id: String(item.id),
        type: String(item.type),
        title: typeof item.title === "string" ? item.title : "消息来源",
        text: String(item.text),
        createdAt:
          typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
            ? item.createdAt
            : Date.now(),
      };
    })
    .filter((source): source is RecognitionSourcePayload => source !== null);
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return {};
  return JSON.parse(rawBody) as Record<string, unknown>;
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function normalizeTimeout(value: string | undefined) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000;
}
