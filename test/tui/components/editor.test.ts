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
