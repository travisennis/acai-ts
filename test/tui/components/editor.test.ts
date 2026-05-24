import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Editor } from '../../../source/tui/components/editor.ts';

describe('Editor deleteWordBackwards', () => {
  it('deletes a single character when cursor is after whitespace', () => {
    const editor = new Editor();
    // Set initial state
    editor.setText('hello ');
    editor['state'].cursorCol = 6; // cursor at end: "hello |"

    // Access private method via bracket notation for testing
    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'hello');
    assert.equal(editor['state'].cursorCol, 5);
  });

  it('deletes a single punctuation character when cursor is after punctuation', () => {
    const editor = new Editor();
    editor.setText('hello.');
    editor['state'].cursorCol = 6;

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'hello');
    assert.equal(editor['state'].cursorCol, 5);
  });

  it('deletes an entire word when cursor is after alphanumeric characters', () => {
    const editor = new Editor();
    editor.setText('hello world');
    editor['state'].cursorCol = 11; // after "world"

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'hello ');
    assert.equal(editor['state'].cursorCol, 6);
  });

  it('deletes the first word when cursor is at the end of a single word', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 5;

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), '');
    assert.equal(editor['state'].cursorCol, 0);
  });

  it('merges with previous line when cursor is at column 0 on second line', () => {
    const editor = new Editor();
    editor.setText('first line\nsecond line');
    editor['state'].cursorLine = 1;
    editor['state'].cursorCol = 0;

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'first linesecond line');
    assert.equal(editor['state'].cursorLine, 0);
    assert.equal(editor['state'].cursorCol, 10); // length of "first line"
  });

  it('does nothing when cursor is at column 0 on first line', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 0;

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'hello');
    assert.equal(editor['state'].cursorCol, 0);
  });

  it('handles empty text gracefully', () => {
    const editor = new Editor();
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 0;

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), '');
    assert.equal(editor['state'].cursorCol, 0);
  });

  it('deletes only one word when multiple words precede cursor', () => {
    const editor = new Editor();
    editor.setText('foo bar baz');
    editor['state'].cursorCol = 11; // after "baz"

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'foo bar ');
    assert.equal(editor['state'].cursorCol, 8);
  });

  it('deletes until previous whitespace when cursor is after multiple spaces', () => {
    const editor = new Editor();
    editor.setText('foo   bar');
    editor['state'].cursorCol = 9; // after "bar"

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'foo   ');
    assert.equal(editor['state'].cursorCol, 6);
  });

  it('resets historyIndex to -1', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['historyIndex'] = 0;
    editor['state'].cursorCol = 5;

    editor['deleteWordBackwards']();

    assert.equal(editor['historyIndex'], -1);
  });

  it('calls onChange callback after deleting', () => {
    const editor = new Editor();
    let changedText = '';
    editor.onChange = (text: string) => {
      changedText = text;
    };
    editor.setText('hello');
    editor['state'].cursorCol = 5;

    editor['deleteWordBackwards']();

    assert.equal(changedText, '');
  });

  it('does not throw when onChange is not set', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 5;

    assert.doesNotThrow(() => {
      editor['deleteWordBackwards']();
    });
  });

  it('stops at word boundary when mixed content precedes cursor', () => {
    const editor = new Editor();
    editor.setText('hello.world foo');
    editor['state'].cursorCol = 16; // after "foo"

    editor['deleteWordBackwards']();

    assert.equal(editor.getText(), 'hello.world ');
    assert.equal(editor['state'].cursorCol, 12);
  });

  it('treats code punctuation as word boundaries', () => {
    const editor = new Editor();
    editor.setText('foo()');
    editor['state'].cursorCol = 5;

    editor['deleteWordBackwards']();

    // Cursor is after ')', which is punctuation, so it deletes just the paren
    assert.equal(editor.getText(), 'foo(');
    assert.equal(editor['state'].cursorCol, 4);
  });

  it('handles cursor in the middle of a word', () => {
    const editor = new Editor();
    editor.setText('hello world');
    editor['state'].cursorCol = 7; // cursor after 'w' in 'world'

    editor['deleteWordBackwards']();

    // Deletes from cursor position backwards to word boundary
    assert.equal(editor.getText(), 'hello orld');
    assert.equal(editor['state'].cursorCol, 6);
  });
});

describe('Editor render', () => {
  it('renders border lines for empty editor', () => {
    const editor = new Editor();
    const result = editor.render(10);
    // Empty editor: top border + empty line with cursor + bottom border
    assert.equal(result.length, 3);
    assert.equal(result[0], '─'.repeat(10)); // top border
    assert.equal(result[result.length - 1], '─'.repeat(10)); // bottom border
    // Middle line has cursor at position 0 (highlighted space)
    assert.match(result[1], /\x1b\[7m \x1b\[0m/);
  });

  it('renders single line with cursor at end', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 5;
    const result = editor.render(10);
    assert.equal(result.length, 3);
    assert.equal(result[0], '─'.repeat(10));
    assert.equal(result[result.length - 1], '─'.repeat(10));
    // Cursor at end: highlighted space added
    assert.equal(result[1], 'hello' + '\x1b[7m \x1b[0m' + ' '.repeat(4));
  });

  it('renders single line with cursor in middle', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 2;
    const result = editor.render(10);
    assert.equal(result.length, 3);
    // Cursor on 'l' (character at position 2) should be highlighted
    assert.equal(result[1], 'he' + '\x1b[7ml\x1b[0m' + 'lo' + ' '.repeat(5));
  });

  it('renders single line with cursor at start', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 0;
    const result = editor.render(10);
    assert.equal(result.length, 3);
    // Cursor on 'h' should be highlighted
    assert.equal(result[1], '\x1b[7mh\x1b[0m' + 'ello' + ' '.repeat(5));
  });

  it('renders multi-line content', () => {
    const editor = new Editor();
    editor.setText('line one\nline two\nline three');
    editor['state'].cursorLine = 1;
    editor['state'].cursorCol = 4;
    const result = editor.render(20);
    assert.equal(result.length, 5); // top + 3 lines + bottom
    assert.equal(result[0], '─'.repeat(20));
    assert.equal(result[result.length - 1], '─'.repeat(20));
    // Line 0 (no cursor)
    assert.equal(result[1], 'line one' + ' '.repeat(12));
    // Line 1 (cursor on char at col 4: ' ')
    assert.equal(result[2], 'line' + '\x1b[7m \x1b[0m' + 'two' + ' '.repeat(12));
    // Line 2 (no cursor)
    assert.equal(result[3], 'line three' + ' '.repeat(10));
  });

  it('renders word-wrapped line with cursor', () => {
    const editor = new Editor();
    editor.setText('this is a long line that needs wrapping');
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 10;
    const result = editor.render(15);
    // Should have top + wrapped lines + bottom
    assert.ok(result.length > 3);
    assert.equal(result[0], '─'.repeat(15));
    assert.equal(result[result.length - 1], '─'.repeat(15));
    // Cursor line should have ANSI escape codes
    const cursorLine = result.findIndex((line) => line.includes('\x1b[7m'));
    assert.notEqual(cursorLine, -1);
  });

  it('renders cursor at end of full-width line (no room for space)', () => {
    const editor = new Editor();
    editor.setText('hello world!!');
    editor['state'].cursorCol = 14; // at end of exactly 14-char line
    const result = editor.render(15);
    assert.equal(result.length, 3);
    // Cursor at end, width = 14, room available (14 < 15), so highlighted space
    assert.ok(result[1].includes('\x1b[7m \x1b[0m'));
  });

  it('renders cursor at end of line that exactly fills width', () => {
    const editor = new Editor();
    editor.setText('123456789012345'); // 15 chars = width
    editor['state'].cursorCol = 15;
    const result = editor.render(15);
    assert.equal(result.length, 3);
    // Line is at full width, cursor at end
    // Should highlight the last character (at position 14)
    assert.ok(result[1].includes('\x1b[7m5\x1b[0m'));
  });

  it('render pads lines to match width', () => {
    const editor = new Editor();
    editor.setText('short');
    editor['state'].cursorCol = 5;
    const result = editor.render(20);
    assert.equal(result.length, 3);
    // Line should be padded to 20 chars
    assert.equal(
      result[1].replace(/\x1b\[\d+m/g, '').replace(/\x1b\[0m/g, '').length,
      20,
    );
  });

  it('does not add autocomplete list when not autocompleting', () => {
    const editor = new Editor();
    editor.setText('test');
    const result = editor.render(10);
    // Only top + content + bottom = 3 lines
    assert.equal(result.length, 3);
  });
});

describe('Editor layoutText', () => {
  it('returns empty line with cursor for empty editor', () => {
    const editor = new Editor();
    const result = editor['layoutText'](10);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, '');
    assert.equal(result[0].hasCursor, true);
    assert.equal(result[0].cursorPos, 0);
    assert.equal(result[0].width, 0);
  });

  it('returns single line for single-line content that fits', () => {
    const editor = new Editor();
    editor.setText('hello');
    editor['state'].cursorCol = 5;
    const result = editor['layoutText'](10);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'hello');
    assert.equal(result[0].hasCursor, true);
    assert.equal(result[0].cursorPos, 5);
    assert.equal(result[0].width, 5);
  });

  it('returns line without cursor for non-current line', () => {
    const editor = new Editor();
    editor.setText('line one\nline two');
    editor['state'].cursorLine = 1;
    editor['state'].cursorCol = 4;
    const result = editor['layoutText'](20);
    // Line 0 should have hasCursor = false
    assert.equal(result.length, 2);
    assert.equal(result[0].text, 'line one');
    assert.equal(result[0].hasCursor, false);
    assert.equal(result[1].text, 'line two');
    assert.equal(result[1].hasCursor, true);
    assert.equal(result[1].cursorPos, 4);
  });

  it('wraps line that exceeds content width', () => {
    const editor = new Editor();
    editor.setText('this is a long line that needs wrapping');
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 10;
    const result = editor['layoutText'](15);
    // Should produce multiple layout lines
    assert.ok(result.length > 1);
    // Verify cursored line has cursor info
    const cursorLine = result.find((l) => l.hasCursor);
    assert.ok(cursorLine !== undefined);
    assert.ok(cursorLine!.cursorPos !== undefined);
  });

  it('returns single line when content exactly fits width', () => {
    const editor = new Editor();
    editor.setText('123456789012345');
    editor['state'].cursorCol = 15;
    const result = editor['layoutText'](15);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, '123456789012345');
    assert.equal(result[0].hasCursor, true);
    assert.equal(result[0].width, 15);
  });

  it('places cursor in first chunk when cursor is in that range', () => {
    const editor = new Editor();
    editor.setText('this is a long line that needs wrapping');
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 3; // 's' in 'this'
    const result = editor['layoutText'](10);
    // First chunk should have cursor
    assert.ok(result.length > 1);
    assert.equal(result[0].hasCursor, true);
    assert.equal(result[0].cursorPos, 3);
    // Subsequent chunks should not have cursor
    for (let i = 1; i < result.length; i++) {
      assert.equal(result[i].hasCursor, false);
    }
  });

  it('wraps line that exceeds content width into multiple layout lines', () => {
    const editor = new Editor();
    editor.setText('a b c d e f g h i j k l m n o p');
    editor['state'].cursorLine = 0;
    editor['state'].cursorCol = 0;
    const result = editor['layoutText'](5);
    // Should produce multiple layout lines
    assert.ok(result.length > 1, 'should produce multiple wrapped lines');
    // Each chunk should be at most 5 chars wide (or less for edge chunks)
    for (const line of result) {
      assert.ok(line.width <= 5, `chunk width ${line.width} exceeds max width of 5`);
    }
  });

  it('handles editor with single empty line as empty', () => {
    const editor = new Editor();
    editor.setText('');
    const result = editor['layoutText'](10);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, '');
    assert.equal(result[0].hasCursor, true);
    assert.equal(result[0].width, 0);
  });
});
