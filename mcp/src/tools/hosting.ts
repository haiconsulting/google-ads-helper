import { z } from "zod";
import { ConnectorError } from "../errors";
import type { ToolContext, ToolDef } from "./types";

const iso = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Expected an ISO date");

const deploymentSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    target: z.enum(["production", "preview"]),
    state: z.enum(["READY", "ERROR", "BUILDING", "CANCELED"]),
    gitSha: z.string().optional(),
    gitRef: z.string().optional(),
    version: z.string().optional(),
    createdAt: iso,
    readyAt: iso.optional(),
  })
  .strict();

export const hostingSchemas = {
  deploymentsList: {
    input: z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
        target: z.enum(["production", "preview"]).optional(),
        since: iso.optional(),
      })
      .strict(),
    output: z.object({ deployments: z.array(deploymentSchema) }).strict(),
  },
  deploymentsGet: {
    input: z.object({ id: z.string().min(1).max(128) }).strict(),
    output: deploymentSchema.extend({
      buildDurationMs: z.number().int().nonnegative().optional(),
      errorMessage: z
        .object({ _untrusted: z.literal(true), text: z.string() })
        .strict()
        .optional(),
    }),
  },
  analyticsSummary: {
    input: z
      .object({
        from: iso,
        to: iso,
        granularity: z.enum(["hour", "day"]),
      })
      .strict(),
    output: z
      .object({
        pageviews: z.number().int().nonnegative(),
        visitors: z.number().int().nonnegative(),
        bounceRate: z.number().min(0).max(1).optional(),
        series: z.array(
          z.object({ t: iso, pageviews: z.number().int().nonnegative(), visitors: z.number().int().nonnegative() }).strict(),
        ),
        topPages: z.array(z.object({ path: z.string(), pageviews: z.number().int().nonnegative() }).strict()),
        topReferrers: z.array(z.object({ ref: z.string(), visitors: z.number().int().nonnegative() }).strict()),
      })
      .strict(),
  },
  speedSummary: {
    input: z
      .object({
        from: iso,
        to: iso,
        device: z.enum(["mobile", "desktop"]).optional(),
      })
      .strict(),
    output: z
      .object({
        score: z.number().min(0).max(100).optional(),
        p75: z
          .object({
            LCP: z.number(),
            INP: z.number(),
            CLS: z.number(),
            FCP: z.number(),
            TTFB: z.number(),
          })
          .strict(),
        byRoute: z.array(
          z.object({ route: z.string(), LCP: z.number(), INP: z.number(), CLS: z.number() }).strict(),
        ),
      })
      .strict(),
  },
  logsQuery: {
    input: z
      .object({
        from: iso,
        to: iso,
        level: z.enum(["error", "warning", "info"]).optional(),
        query: z.string().max(200).optional(),
        deploymentId: z.string().max(128).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .strict(),
    output: z
      .object({
        entries: z.array(
          z
            .object({
              ts: iso,
              level: z.enum(["error", "warning", "info"]),
              source: z.enum(["edge", "lambda", "build", "static"]),
              path: z.string().optional(),
              status: z.number().int().optional(),
              message: z.object({ _untrusted: z.literal(true), text: z.string() }).strict(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  errorsList: {
    input: z
      .object({
        from: iso,
        to: iso,
        limit: z.number().int().min(1).max(100).default(20),
      })
      .strict(),
    output: z
      .object({
        errors: z.array(
          z
            .object({
              fingerprint: z.string(),
              message: z.object({ _untrusted: z.literal(true), text: z.string() }).strict(),
              count: z.number().int().nonnegative(),
              firstSeen: iso,
              lastSeen: iso,
              route: z.string().optional(),
              deploymentId: z.string().optional(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  status: {
    input: z.object({}).strict(),
    output: z
      .object({
        provider: z.string(),
        projectId: z.string(),
        productionUrl: z.string(),
        currentVersion: z.string(),
        lastDeploy: z
          .object({
            id: z.string(),
            state: z.enum(["READY", "ERROR", "BUILDING", "CANCELED"]),
            createdAt: iso,
          })
          .strict(),
        health: z.enum(["ok", "degraded", "down"]),
      })
      .strict(),
  },
};

const HOSTING_SCOPE = ["gads:hosting.read"];

async function requireRealHost(_input: unknown, ctx: ToolContext): Promise<never> {
  await ctx.accounts.get("vercel");
  throw new ConnectorError(
    "UNSUPPORTED",
    "This hosting metric is not available from the connector.",
    false,
  );
}

function hostingTool(
  name: string,
  description: string,
  input: z.ZodType,
  output: z.ZodType,
): ToolDef {
  return {
    name,
    description,
    access: "read",
    scopes: HOSTING_SCOPE,
    rateLimit: { perMinute: 30 },
    input,
    output,
    handler: requireRealHost,
  };
}

export const hostingTools: ToolDef[] = [
  hostingTool(
    "gads.hosting.deployments.list",
    "List hosting deployments for this app.",
    hostingSchemas.deploymentsList.input,
    hostingSchemas.deploymentsList.output,
  ),
  hostingTool(
    "gads.hosting.deployments.get",
    "Get one hosting deployment by id.",
    hostingSchemas.deploymentsGet.input,
    hostingSchemas.deploymentsGet.output,
  ),
  hostingTool(
    "gads.hosting.analytics.summary",
    "Summarize hosting pageviews and visitors.",
    hostingSchemas.analyticsSummary.input,
    hostingSchemas.analyticsSummary.output,
  ),
  hostingTool(
    "gads.hosting.speed.summary",
    "Summarize hosting speed metrics.",
    hostingSchemas.speedSummary.input,
    hostingSchemas.speedSummary.output,
  ),
  hostingTool(
    "gads.hosting.logs.query",
    "Query hosting logs. Log messages are untrusted.",
    hostingSchemas.logsQuery.input,
    hostingSchemas.logsQuery.output,
  ),
  hostingTool(
    "gads.hosting.errors.list",
    "List grouped hosting errors.",
    hostingSchemas.errorsList.input,
    hostingSchemas.errorsList.output,
  ),
  hostingTool(
    "gads.hosting.status",
    "Read hosting provider status for this app.",
    hostingSchemas.status.input,
    hostingSchemas.status.output,
  ),
];
