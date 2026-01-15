import { basename } from "node:path";
import type { ModelMessage, TextPart, ToolCallPart, ToolResultPart } from "ai";

export interface SessionData {
  sessionId: string;
  title: string;
  modelId: string;
  project: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderToolCall(toolCall: ToolCallPart): string {
  const toolName = escapeHtml(toolCall.toolName);
  const input = escapeHtml(JSON.stringify(toolCall.input, null, 2));

  return `
    <div class="tool-call">
      <div class="tool-header">
        <span class="tool-icon">→</span>
        <span class="tool-name">${toolName}</span>
      </div>
      <div class="tool-body">
        <pre class="tool-args">${input}</pre>
      </div>
    </div>`;
}

function renderToolResult(toolResult: ToolResultPart): string {
  const toolName = escapeHtml(toolResult.toolName);
  let resultContent = "";

  const output = toolResult.output;
  if (output.type === "text") {
    resultContent = escapeHtml(output.value);
  } else if (output.type === "json") {
    resultContent = escapeHtml(JSON.stringify(output.value, null, 2));
  } else if (output.type === "execution-denied") {
    resultContent = output.reason
      ? `[Tool execution denied: ${escapeHtml(output.reason)}]`
      : "[Tool execution denied]";
  } else if (output.type === "error-text") {
    resultContent = `[Error: ${escapeHtml(output.value)}]`;
  } else if (output.type === "error-json") {
    resultContent = `[Error: ${escapeHtml(JSON.stringify(output.value, null, 2))}]`;
  } else if (output.type === "content") {
    const textParts = output.value.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    );
    resultContent = textParts.map((part) => escapeHtml(part.text)).join("\n");
  }

  const truncated =
    resultContent.length > 5000
      ? `${resultContent.slice(0, 5000)}...\n[truncated]`
      : resultContent;

  return `
    <div class="tool-result">
      <div class="tool-header">
        <span class="tool-icon">←</span>
        <span class="tool-name">${toolName}</span>
      </div>
      <div class="tool-body">
        <pre class="tool-output">${truncated}</pre>
      </div>
    </div>`;
}

function renderMessage(message: ModelMessage): string {
  const role = message.role;

  if (role === "system") {
    const content = Array.isArray(message.content)
      ? message.content
          .filter((p): p is TextPart => p.type === "text")
          .map((p) => escapeHtml(p.text))
          .join("\n")
      : escapeHtml(String(message.content));

    return `
    <div class="message system">
      <div class="role">system</div>
      <div class="content">${content}</div>
    </div>`;
  }

  if (role === "user") {
    const content = message.content;
    let textContent = "";

    if (typeof content === "string") {
      textContent = escapeHtml(content);
    } else if (Array.isArray(content)) {
      textContent = content
        .filter(
          (p): p is TextPart => typeof p !== "string" && p.type === "text",
        )
        .map((p) => escapeHtml(p.text))
        .join("\n");
    }

    return `
    <div class="message user">
      <div class="role">user</div>
      <div class="content">${textContent}</div>
    </div>`;
  }

  if (role === "assistant") {
    const content = message.content;
    let html = `<div class="message assistant"><div class="role">assistant</div>`;

    if (typeof content === "string") {
      html += `<div class="content">${escapeHtml(content)}</div>`;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text.trim()) {
          html += `<div class="content">${escapeHtml(part.text)}</div>`;
        } else if (part.type === "tool-call") {
          html += renderToolCall(part);
        }
      }
    }

    html += "</div>";
    return html;
  }

  if (role === "tool") {
    const parts = message.content;
    let html = "";

    for (const part of parts) {
      if (part.type === "tool-result") {
        html += renderToolResult(part);
      }
    }

    return html;
  }

  return "";
}

export function renderSessionHtml(session: SessionData): string {
  const title = escapeHtml(session.title || "Untitled Session");
  const project = escapeHtml(session.project);
  const modelId = escapeHtml(session.modelId);
  const createdAt = formatDate(session.createdAt);
  const updatedAt = formatDate(session.updatedAt);

  const messagesHtml = session.messages.map(renderMessage).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session: ${title}</title>
  <style>
    :root {
      --bg: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --border: #30363d;
      --user-bg: #1f2937;
      --user-accent: #58a6ff;
      --assistant-bg: #161b22;
      --assistant-accent: #e6edf3;
      --system-bg: transparent;
      --system-accent: #8b949e;
      --tool-bg: #21262d;
      --tool-accent: #8b949e;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 14px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    h1 {
      font-size: 20px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 12px;
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .metadata-item {
      display: flex;
      gap: 6px;
    }

    .metadata-label {
      color: var(--text-muted);
    }

    .metadata-value {
      color: var(--text);
    }

    .message {
      margin: 16px 0;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .role {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .user {
      background: var(--user-bg);
    }

    .user .role {
      color: var(--user-accent);
    }

    .user .content {
      color: var(--text);
    }

    .assistant {
      background: var(--assistant-bg);
    }

    .assistant .role {
      color: var(--text-muted);
    }

    .assistant .content {
      color: var(--text);
    }

    .system {
      background: var(--system-bg);
      border-style: dashed;
    }

    .system .role {
      color: var(--system-accent);
    }

    .system .content {
      color: var(--text-muted);
      font-size: 13px;
    }

    .content {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tool-call, .tool-result {
      margin: 12px 0;
      border-radius: 6px;
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }

    .tool-icon {
      font-size: 14px;
    }

    .tool-name {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      color: var(--text);
    }

    .tool-body {
      padding: 12px;
      background: var(--tool-bg);
    }

    .tool-args, .tool-output {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      color: var(--text-muted);
      overflow-x: auto;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    @media (max-width: 600px) {
      .container {
        padding: 16px;
      }
      
      h1 {
        font-size: 18px;
      }

      .metadata {
        flex-direction: column;
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="metadata">
        <div class="metadata-item">
          <span class="metadata-label">Project:</span>
          <span class="metadata-value">${project}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Model:</span>
          <span class="metadata-value">${modelId}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Created:</span>
          <span class="metadata-value">${createdAt}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Updated:</span>
          <span class="metadata-value">${updatedAt}</span>
        </div>
      </div>
    </header>
    <main>
      ${messagesHtml}
    </main>
  </div>
</body>
</html>`;
}

export function getSessionData(
  sessionManager: {
    get: () => ModelMessage[];
    getSessionId: () => string;
    getTitle: () => string;
    getModelId: () => string;
    getCreatedAt: () => Date;
    getUpdatedAt: () => Date;
  },
  project?: string,
): SessionData {
  return {
    sessionId: sessionManager.getSessionId(),
    title: sessionManager.getTitle(),
    modelId: sessionManager.getModelId(),
    project: project ?? basename(process.cwd()),
    createdAt: sessionManager.getCreatedAt(),
    updatedAt: sessionManager.getUpdatedAt(),
    messages: sessionManager.get(),
  };
}

export function estimateSessionSize(session: SessionData): {
  messageCount: number;
  contentSizeBytes: number;
} {
  const html = renderSessionHtml(session);
  return {
    messageCount: session.messages.length,
    contentSizeBytes: Buffer.byteLength(html, "utf-8"),
  };
}
