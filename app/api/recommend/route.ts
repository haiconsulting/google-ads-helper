import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { getClientById } from "@/lib/clients";
import { recommendLog } from "@/lib/recommendApiLog";
import { buildSystemPrompt } from "@/lib/systemPrompt";

export const runtime = "nodejs";
/** Vercel / long-running: vision + thinking can exceed default. */
export const maxDuration = 120;

const MAX_SCREENSHOTS = 10;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_IMAGE_MEDIA: Record<
  string,
  "image/jpeg" | "image/png" | "image/gif" | "image/webp"
> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

function jsonError(
  requestId: string,
  status: number,
  message: string,
  hint?: string
): Response {
  const body = JSON.stringify({
    error: message,
    requestId,
    hint:
      hint ??
      "Check the terminal running Next.js for lines starting with [recommend]. On Vercel, open the deployment → Logs.",
  });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-Id": requestId,
      "Cache-Control": "no-store",
    },
  });
}

function formatStreamError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const contentType = req.headers.get("content-type") ?? "";

  recommendLog(requestId, "info", "POST /api/recommend", {
    contentType: contentType.split(";")[0] || contentType,
  });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    recommendLog(requestId, "error", "ANTHROPIC_API_KEY is missing or empty");
    return jsonError(
      requestId,
      503,
      "Server misconfiguration: ANTHROPIC_API_KEY is not set.",
      "Add ANTHROPIC_API_KEY to .env.local and restart `npm run dev`. On Vercel, add it under Project → Settings → Environment Variables."
    );
  }

  let clientId: string;
  let direction: string;
  let campaignData: string;
  let imageParts: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }[] =
    [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const cid = form.get("clientId");
      const dir = form.get("direction");
      const data = form.get("campaignData");
      clientId = typeof cid === "string" ? cid : "";
      direction = typeof dir === "string" ? dir : "";
      campaignData = typeof data === "string" ? data : "";

      const files = form.getAll("screenshots").filter((v): v is File => v instanceof File);
      recommendLog(requestId, "info", "parsed multipart", {
        screenshotCount: files.length,
        clientId: clientId || "(empty)",
        directionChars: direction.length,
        campaignDataChars: campaignData.length,
      });

      if (files.length > MAX_SCREENSHOTS) {
        recommendLog(requestId, "warn", "too many images", { count: files.length });
        return jsonError(requestId, 400, `Too many images (max ${MAX_SCREENSHOTS})`);
      }

      let totalBytes = 0;
      for (const file of files) {
        const normalizedType = file.type?.toLowerCase() ?? "";
        const mediaType = ALLOWED_IMAGE_MEDIA[normalizedType];
        if (!mediaType) {
          recommendLog(requestId, "warn", "unsupported image type", {
            type: file.type,
            name: file.name,
          });
          return jsonError(
            requestId,
            400,
            `Unsupported image type: ${file.type || "unknown"}. Use JPEG, PNG, GIF, or WebP.`
          );
        }
        if (file.size > MAX_IMAGE_BYTES) {
          recommendLog(requestId, "warn", "image too large", { name: file.name, size: file.size });
          return jsonError(
            requestId,
            400,
            `Image too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MB each): ${file.name}`
          );
        }
        totalBytes += file.size;
        const buf = Buffer.from(await file.arrayBuffer());
        imageParts.push({ mediaType, data: buf.toString("base64") });
      }
      recommendLog(requestId, "info", "images loaded", {
        count: imageParts.length,
        totalBytes,
        approxBase64Chars: imageParts.reduce((n, p) => n + p.data.length, 0),
      });
    } else {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (parseErr) {
        recommendLog(requestId, "error", "invalid JSON body", {
          detail: formatStreamError(parseErr),
        });
        return jsonError(requestId, 400, "Request body must be valid JSON or multipart form data.");
      }
      clientId = typeof body.clientId === "string" ? body.clientId : "";
      direction = typeof body.direction === "string" ? body.direction : "";
      campaignData = typeof body.campaignData === "string" ? body.campaignData : "";
      recommendLog(requestId, "info", "parsed JSON", {
        clientId: clientId || "(empty)",
        directionChars: direction.length,
        campaignDataChars: campaignData.length,
      });
    }
  } catch (err) {
    recommendLog(requestId, "error", "failed to read request body", {
      detail: formatStreamError(err),
    });
    console.error(`[recommend] ${requestId} stack:`, err);
    return jsonError(
      requestId,
      400,
      "Could not read request body.",
      "If you uploaded large screenshots, try fewer images or smaller files. Next.js/Vercel may reject very large bodies."
    );
  }

  if (!clientId || !direction) {
    recommendLog(requestId, "warn", "missing clientId or direction");
    return jsonError(requestId, 400, "Missing clientId or direction.");
  }

  const client = getClientById(clientId);
  if (!client) {
    recommendLog(requestId, "warn", "client not found", { clientId });
    return jsonError(requestId, 404, "Client not found.");
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  let userContent: string | ContentBlockParam[];
  try {
    userContent = buildUserContent(direction, campaignData, imageParts);
  } catch (err) {
    recommendLog(requestId, "error", "buildUserContent failed", { detail: formatStreamError(err) });
    console.error(`[recommend] ${requestId} stack:`, err);
    return jsonError(requestId, 500, "Failed to build the model prompt.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        recommendLog(requestId, "info", "starting Anthropic stream");
        const anthropicStream = anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system: buildSystemPrompt(client),
          messages: [{ role: "user", content: userContent }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        recommendLog(requestId, "info", "Anthropic stream finished OK");
        controller.close();
      } catch (err) {
        const detail = formatStreamError(err);
        recommendLog(requestId, "error", "Anthropic stream error", { detail });
        console.error(`[recommend] ${requestId} Anthropic error (full):`, err);

        // Never call controller.error() here: browsers often show ERR_EMPTY_RESPONSE / "Failed to fetch".
        const userLine = `\n\n---\n**Something went wrong** (ref: \`${requestId}\`)\n\n${detail}\n\n_Check the terminal where Next is running for the full stack trace._\n`;
        try {
          controller.enqueue(encoder.encode(userLine));
          controller.close();
        } catch (closeErr) {
          recommendLog(requestId, "warn", "could not enqueue error to stream", {
            detail: formatStreamError(closeErr),
          });
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
    },
  });
}

function buildUserContent(
  direction: string,
  campaignData: string,
  images: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }[]
): string | ContentBlockParam[] {
  const textPreamble = buildTextPreamble(direction, campaignData, images.length);

  if (images.length === 0) {
    return (
      textPreamble +
      "\n\nPlease provide specific, actionable Google Ads recommendations to align our campaigns with this new direction."
    );
  }

  const blocks: ContentBlockParam[] = [
    {
      type: "text",
      text:
        textPreamble +
        `\n\n## Screenshots\nBelow are Google Ads UI screenshots (often the Assets view: headlines, descriptions, status, and metrics). Read them carefully: extract asset text, types, status/eligibility notes, and any visible performance numbers. Treat OCR ambiguities conservatively and say when something is unclear.\n`,
    },
  ];

  images.forEach((img, i) => {
    blocks.push({
      type: "text",
      text: `--- Screenshot ${i + 1} of ${images.length} ---`,
    });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  });

  blocks.push({
    type: "text",
    text: `\nUsing the direction above, the pasted text (if any), and everything you infer from the screenshots, please provide specific, actionable Google Ads recommendations to align our campaigns with this new direction.`,
  });

  return blocks;
}

function buildTextPreamble(direction: string, campaignData: string, screenshotCount: number): string {
  let message = `## New Business Direction / Goal\n${direction}\n`;

  if (campaignData.trim()) {
    message += `\n## Current Campaign Data (text)\n\`\`\`\n${campaignData.trim()}\n\`\`\`\n`;
  } else if (screenshotCount === 0) {
    message += `\n*(No existing campaign data provided — please give general recommendations for setting up campaigns aligned with this direction.)*\n`;
  } else {
    message += `\n*(No additional text campaign data — rely on the attached screenshots and the direction above.)*\n`;
  }

  return message;
}
