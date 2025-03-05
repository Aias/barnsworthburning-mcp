import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SEARCH_API_BASE = "https://barnsworthburning.net/api/search";
const USER_AGENT = "barnsworthburning-mcp/1.0";
const MAX_RESULTS = 25;

export const SearchQuerySchema = z
  .string()
  .min(2, "Search query must be at least 2 characters")
  .describe("The search query to look for on barnsworthburning.net");

const LinkedRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const AttachmentSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  filename: z.string(),
  size: z.number().int().min(0).optional(),
  type: z.string(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
});

export const SearchResultItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  creators: z.array(LinkedRecordSchema).optional(),
  spaces: z.array(LinkedRecordSchema).optional(),
  connections: z.array(LinkedRecordSchema).optional(),
  parent: LinkedRecordSchema.optional(),
  parentCreators: z.array(LinkedRecordSchema).optional(),
  children: z.array(LinkedRecordSchema).optional(),
  extract: z.string().optional(),
  notes: z.string().optional(),
  images: z.array(AttachmentSchema).optional(),
  imageCaption: z.string().optional(),
  michelinStars: z.number().int().min(0).max(3).optional(),
  source: z.string().url().optional(),
  format: z.string().optional(),
  extractedOn: z.coerce.date(),
  lastUpdated: z.coerce.date(),
  publishedOn: z.coerce.date().optional(),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResultsSchema = z.object({
  results: z.array(SearchResultItemSchema),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;

function formatResultItem(item: SearchResultItem) {
  const {
    title,
    id,
    creators,
    source,
    extract,
    format,
    spaces,
    connections,
    parent,
    children,
    notes,
    extractedOn,
    lastUpdated,
  } = item;

  let content = `## ${title ?? id}\n\n`;

  if (format) {
    content += `**Format:** ${format}\n`;
  }
  if (creators) {
    content += `**By:** ${creators.map((c) => c.name).join(", ")}\n`;
  }
  if (source) {
    content += `**Source:** ${source}\n`;
  }
  content += `**Created:** ${extractedOn.toLocaleDateString()}\n`;
  content += `**Updated:** ${lastUpdated.toLocaleDateString()}\n`;

  if (extract) {
    content += `\n${extract}\n`;
  }
  if (notes) {
    content += `\n*Curator's Note:*\n\n${notes}\n`;
  }
  content += `\n`;
  if (parent) {
    content += `**Parent Record:** ${parent.name}\n`;
  }
  if (children && children.length > 0) {
    content += `**Child Records:**\n${children
      .map((c) => `- ${c.name}`)
      .join("\n")}\n\n`;
  }
  if (connections && connections.length > 0) {
    content += `**See also:**\n${connections
      .map((c) => `- ${c.name}`)
      .join("\n")}\n\n`;
  }
  if (spaces && spaces.length > 0) {
    content += `**Tagged:** ${spaces.map((s) => `#${s.name}`).join(", ")}\n`;
  }

  return content;
}

// Create server instance
const server = new McpServer({
  name: "barnsworthburning-search",
  version: "1.0.0",
});

// Helper function for making API requests
async function makeSearchRequest(
  query: string
): Promise<SearchResultItem[] | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  try {
    const url = `${SEARCH_API_BASE}?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const parsed = SearchResultsSchema.parse(json);
    return parsed.results;
  } catch (error) {
    console.error("Error making search request:", error);
    return null;
  }
}

// Register search tool
server.tool(
  "search",
  "Search barnsworthburning.net for the given query",
  {
    query: SearchQuerySchema,
  },
  async ({ query }) => {
    const searchData = await makeSearchRequest(query);

    if (!searchData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve search results",
          },
        ],
      };
    }

    const results = searchData || [];

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${query}"`,
          },
        ],
      };
    }

    // Format the results as text
    const formattedResults = results
      .slice(0, MAX_RESULTS)
      .map(formatResultItem)
      .join("\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Search results for "${query}":\n\n${formattedResults}`,
        },
      ],
    };
  }
);

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Barnsworthburning Search MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
