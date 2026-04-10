import type { McpTool, McpToolDefinition } from "./tool-types.js";

export class McpToolRegistry {
  private readonly toolsByName: Map<string, McpTool>;

  constructor(tools: McpTool[]) {
    this.toolsByName = new Map();

    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`Duplicate MCP tool registered: ${tool.name}`);
      }

      this.toolsByName.set(tool.name, tool);
    }
  }

  // public by default
  list(): McpToolDefinition[] {
    return Array.from(this.toolsByName.values(), (tool) => tool.definition);
  }

  get(name: string): McpTool | undefined {
    return this.toolsByName.get(name);
  }
}
