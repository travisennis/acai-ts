import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import stripAnsi from "../../source/terminal/strip-ansi.ts";
import { Markdown } from "../../source/tui/components/markdown.ts";

describe("Markdown inline token rendering", () => {
  describe("text tokens", () => {
    it("should render plain text", () => {
      const md = new Markdown("Hello world", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(visible.some((l) => l.includes("Hello world")));
    });

    it("should render text with escaped characters", () => {
      const md = new Markdown("Text with <angle> & stuff", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(visible.some((l) => l.includes("Text with")));
    });
  });

  describe("strong (bold) tokens", () => {
    it("should render **bold** text", () => {
      const md = new Markdown("This is **bold** text", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("bold"));
      assert.ok(line, "Should contain 'bold'");
      assert.ok(line?.includes("This is"));
    });

    it("should render __bold__ text", () => {
      const md = new Markdown("This is __bold__ text", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(visible.some((l) => l.includes("This is")));
    });
  });

  describe("em (italic) tokens", () => {
    it("should render *italic* text", () => {
      const md = new Markdown("This is *italic* text", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(visible.some((l) => l.includes("This is")));
    });

    it("should render _italic_ text", () => {
      const md = new Markdown("This is _italic_ text", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(visible.some((l) => l.includes("This is")));
    });
  });

  describe("codespan tokens", () => {
    it("should render `inline code`", () => {
      const md = new Markdown("Use the `cmd` command", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("cmd"));
      assert.ok(line, "Should contain 'cmd'");
      assert.ok(line?.includes("Use the"));
    });
  });

  describe("link tokens", () => {
    it("should render [text](url) links", () => {
      const md = new Markdown("Visit [example](https://example.com) now", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("example"));
      assert.ok(line, "Should contain 'example'");
      assert.ok(line?.includes("Visit"));
      assert.ok(line?.includes("now"));
    });

    it("should render link with matching text and href", () => {
      const md = new Markdown("Go to https://example.com", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(
        visible.some((l) => l.includes("example.com")),
        "Should include the URL",
      );
    });
  });

  describe("br (line break) tokens", () => {
    it("should render hard line breaks", () => {
      const md = new Markdown("Line 1  \nLine 2", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const nonEmpty = visible.filter((l) => l.trim().length > 0);
      assert.ok(
        nonEmpty.some((l) => l.includes("Line 1")),
        "Should contain 'Line 1'",
      );
      assert.ok(
        nonEmpty.some((l) => l.includes("Line 2")),
        "Should contain 'Line 2'",
      );
    });
  });

  describe("del (strikethrough) tokens", () => {
    it("should render ~~strikethrough~~ text", () => {
      const md = new Markdown("This is ~~struck~~ text", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("struck"));
      assert.ok(line, "Should contain 'struck'");
      assert.ok(line?.includes("This is"));
    });
  });

  describe("image tokens", () => {
    it("should render ![alt](url) images", () => {
      const md = new Markdown("See ![logo](https://example.com/logo.png)", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("Image: logo"));
      assert.ok(line, "Should contain 'Image: logo'");
    });

    it("should render image with empty alt text", () => {
      const md = new Markdown("![](https://example.com/img.png)", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(
        visible.some((l) => l.includes("Image:")),
        "Should contain 'Image:'",
      );
    });
  });

  describe("combined inline formatting", () => {
    it("should render mixed bold and italic", () => {
      const md = new Markdown("**bold** and *italic* together", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("together"));
      assert.ok(line, "Should contain 'together'");
    });

    it("should render bold text with nested emphasis", () => {
      const md = new Markdown("**bold *and italic* text**", {
        paddingX: 0,
        paddingY: 0,
      });
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      assert.ok(
        visible.some((l) => l.includes("bold")),
        "Should contain 'bold'",
      );
    });

    it("should render text with code and link", () => {
      const md = new Markdown(
        "Run `install` to get [started](https://example.com)",
        { paddingX: 0, paddingY: 0 },
      );
      const lines = md.render(80);
      const visible = lines.map((l) => stripAnsi(l));
      const line = visible.find((l) => l.includes("install"));
      assert.ok(line, "Should contain 'install'");
    });
  });
});
