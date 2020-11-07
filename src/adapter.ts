import { Cursor, CursorData } from "./cursor";
import type { Firepad } from "./index";
import { TextOperation } from "./text-operation";

export interface Adapter {
  grabDocumentState();
  detach();
  getCursor(): Cursor;
  setCursor(cursor: CursorData);
  setOtherCursor(
    cursor: { position: number; selectionEnd: number },
    color: string,
    clientID: any
  );
  invertOperation(operation: TextOperation);
  applyOperation(operation: TextOperation);
  registerUndo(undo: Function);
  registerRedo(redo: Function);
  registerCallbacks(callbacks: { [name: string]: Function });
  getContainer(): HTMLElement;
  setFirepad(pad: Firepad | null);
  refresh();
  dispose();
  getText(): string;
  setText(text: string): void;
  insertTextAtCursor(text: string): void;
  insertText(pos: number, text: string): void;
}
