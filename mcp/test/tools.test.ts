import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertToolEnabled } from "../src/access";
import { ConnectorError } from "../src/errors";
import { clientsGetOutput, clientsListOutput } from "../src/tools/clients";
import { hostingSchemas } from "../src/tools/hosting";
import { HOSTING_TOOL_NAMES, tools } from "../src/tools";
import type { ToolContext } from "../src/tools/types";
import { CANARY } from "./helpers";

test("client tools return real profiles and reject unknown ids", async () => {
  const list = tools.find((tool) => tool.name === "gads.clients.list");
  const get = tools.find((tool) => tool.name === "gads.clients.get");
  assert.ok(list && get);
  const listed = clientsListOutput.parse(await list.handler({}, {} as ToolContext));
  assert.ok(listed.clients.some((client) => client.id === "killa"));
  assert.equal(JSON.stringify(listed).includes("Agency Notes"), false);

  const one = clientsGetOutput.parse(await get.handler({ id: "burger-lab" }, {} as ToolContext));
  assert.equal(one.client.name, "Burger Lab");
  await assert.rejects(
    () => get.handler({ id: "missing" }, {} as ToolContext),
    (error: unknown) => error instanceof ConnectorError && error.code === "NOT_FOUND",
  );
});

test("hosting handlers return UNSUPPORTED instead of fixture data", async () => {
  let tokenReads = 0;
  const ctx = {
    accounts: {
      async get(provider: string) {
        assert.equal(provider, "vercel");
        return {
          accountId: "acct_vercel",
          provider,
          credentialType: "oauth",
          getToken: async () => {
            tokenReads += 1;
            return CANARY;
          },
        };
      },
    },
  } as unknown as ToolContext;

  for (const name of HOSTING_TOOL_NAMES) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.ok(tool);
    await assert.rejects(
      () => tool.handler({}, ctx),
      (error: unknown) => error instanceof ConnectorError && error.code === "UNSUPPORTED",
    );
  }
  assert.equal(tokenReads, 0);
});

test("read mode blocks write access and a disabled tool", () => {
  assert.throws(
    () =>
      assertToolEnabled(
        {
          connectorEnabled: true,
          mode: "read",
          version: 1,
          issuedAt: "2026-10-14T00:00:00.000Z",
          tools: { "gads.clients.create": { enabled: true, access: "write" } },
        },
        { name: "gads.clients.create", access: "write" },
        false,
      ),
    (error: unknown) => error instanceof ConnectorError && error.code === "TOOL_DISABLED",
  );
  assert.throws(
    () =>
      assertToolEnabled(
        {
          connectorEnabled: false,
          mode: "read",
          version: 0,
          issuedAt: "",
          tools: {},
        },
        { name: "gads.clients.list", access: "read" },
        false,
      ),
    (error: unknown) => error instanceof ConnectorError && error.code === "TOOL_DISABLED",
  );
});

test("hosting output schemas accept recorded fixtures only as schema examples", async () => {
  const fixtures = JSON.parse(readFileSync(new URL("../fixtures/hosting.json", import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
  const schemas = [
    hostingSchemas.deploymentsList.output,
    hostingSchemas.deploymentsGet.output,
    hostingSchemas.analyticsSummary.output,
    hostingSchemas.speedSummary.output,
    hostingSchemas.logsQuery.output,
    hostingSchemas.errorsList.output,
    hostingSchemas.status.output,
  ];
  HOSTING_TOOL_NAMES.forEach((name, index) => {
    const parsed = schemas[index].safeParse(fixtures[name]);
    assert.equal(parsed.success, true, name);
  });
});
