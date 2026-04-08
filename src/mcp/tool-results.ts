export interface McpToolContent {
  type: "text";
  text: string;
}

export type McpToolSuccessResult<T extends object> = {
  content: McpToolContent[];
  structuredContent: T;
  isError: false;
};

export type McpToolErrorResult = {
  content: McpToolContent[];
  isError: true;
};

export function makeMcpToolResult<T extends object>(
  result: T,
): McpToolSuccessResult<T> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result),
      },
    ],
    structuredContent: result,
    isError: false,
  };
}

export function makeMcpToolErrorResult(message: string): McpToolErrorResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}
