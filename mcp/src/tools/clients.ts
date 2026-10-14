import { z } from "zod";
import { clients, getClientById } from "../../../lib/clients";
import { ConnectorError } from "../errors";
import type { ToolDef } from "./types";

const clientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    industry: z.string(),
    location: z.string(),
    description: z.string(),
  })
  .strict();

export const clientsListInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const clientsListOutput = z
  .object({
    clients: z.array(clientSchema),
  })
  .strict();

export const clientsGetInput = z
  .object({
    id: z.string().min(1).max(64),
  })
  .strict();

export const clientsGetOutput = z
  .object({
    client: clientSchema,
  })
  .strict();

function publicClient(id: string) {
  const client = getClientById(id);
  if (!client) return null;
  return {
    id: client.id,
    name: client.name,
    industry: client.industry,
    location: client.location,
    description: client.description,
  };
}

export const clientTools: ToolDef[] = [
  {
    name: "gads.clients.list",
    description: "List brand profiles configured in Google Ads Helper.",
    access: "read",
    scopes: ["gads:clients.read"],
    rateLimit: { perMinute: 60 },
    input: clientsListInput,
    output: clientsListOutput,
    async handler(input) {
      const { limit } = clientsListInput.parse(input);
      const rows = clients
        .map((client) => publicClient(client.id))
        .filter((client): client is NonNullable<typeof client> => client !== null)
        .slice(0, limit);
      return { clients: rows };
    },
  },
  {
    name: "gads.clients.get",
    description: "Get one configured brand profile by id.",
    access: "read",
    scopes: ["gads:clients.read"],
    rateLimit: { perMinute: 60 },
    input: clientsGetInput,
    output: clientsGetOutput,
    async handler(input) {
      const { id } = clientsGetInput.parse(input);
      const client = publicClient(id);
      if (!client) {
        throw new ConnectorError("NOT_FOUND", "Client was not found.", false);
      }
      return { client };
    },
  },
];
