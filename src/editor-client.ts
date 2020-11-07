import { Adapter } from "./adapter";
import { AwaitingWithBuffer, Client, Synchronized } from "./client";
import { Cursor, CursorData } from "./cursor";
import { FirebaseAdapter } from "./firebase-adapter";
import { UndoManager } from "./undo-manager";
import { WrappedOperation } from "./wrapped-operation";

export class EditorClient extends Client {
  private undoManager = new UndoManager();
  private clients = {};
  private cursor?: Cursor;
  private focused: boolean = false;

  constructor(
    private serverAdapter: FirebaseAdapter,
    private editorAdapter: Adapter
  ) {
    super();

    this.editorAdapter.registerCallbacks({
      change: function (operation, inverse) {
        this.onChange(operation, inverse);
      },
      cursorActivity: function () {
        this.onCursorActivity();
      },
      blur: function () {
        this.onBlur();
      },
      focus: function () {
        this.onFocus();
      },
    });
    this.editorAdapter.registerUndo(() => {
      this.undo();
    });
    this.editorAdapter.registerRedo(() => {
      this.redo();
    });

    this.serverAdapter.registerCallbacks({
      ack: () => {
        this.serverAck();
        if (this.focused && this.state instanceof Synchronized) {
          this.updateCursor();
          this.sendCursor(this.cursor);
        }
        this.emitStatus();
      },
      retry: () => {
        this.serverRetry();
      },
      operation: (operation) => {
        this.applyServer(operation);
      },
      cursor: (clientId, cursor, color) => {
        if (
          this.serverAdapter.getUserId() === clientId ||
          !(this.state instanceof Synchronized)
        ) {
          return;
        }
        var client = this.getClientObject(clientId);
        if (cursor) {
          if (color) client.setColor(color);
          client.updateCursor(Cursor.fromJSON(cursor));
        } else {
          client.removeCursor();
        }
      },
    });
  }

  getClientObject(clientId) {
    var client = this.clients[clientId];
    if (client) {
      return client;
    }
    return (this.clients[clientId] = new OtherClient(
      clientId,
      this.editorAdapter
    ));
  }

  applyUnredo(operation) {
    this.undoManager.add(this.editorAdapter.invertOperation(operation));
    this.editorAdapter.applyOperation(operation.wrapped);
    this.cursor = operation.meta.cursorAfter;
    if (this.cursor) this.editorAdapter.setCursor(this.cursor);
    this.applyClient(operation.wrapped);
  }

  undo() {
    if (!this.undoManager.canUndo()) {
      return;
    }
    this.undoManager.performUndo((o) => {
      this.applyUnredo(o);
    });
  }

  redo() {
    if (!this.undoManager.canRedo()) {
      return;
    }
    this.undoManager.performRedo((o) => {
      this.applyUnredo(o);
    });
  }

  onChange(textOperation, inverse) {
    var cursorBefore = this.cursor;
    this.updateCursor();

    var compose =
      this.undoManager.undoStack.length > 0 &&
      inverse.shouldBeComposedWithInverted(
        last(this.undoManager.undoStack).wrapped
      );
    var inverseMeta = new SelfMeta(this.cursor!, cursorBefore!);
    this.undoManager.add(new WrappedOperation(inverse, inverseMeta), compose);
    this.applyClient(textOperation);
  }

  updateCursor() {
    this.cursor = this.editorAdapter.getCursor();
  }

  onCursorActivity() {
    var oldCursor = this.cursor;
    this.updateCursor();
    if (!this.focused || (oldCursor && this.cursor!.equals(oldCursor))) {
      return;
    }
    this.sendCursor(this.cursor);
  }

  onBlur() {
    this.cursor = undefined;
    this.sendCursor(null);
    this.focused = false;
  }

  onFocus() {
    this.focused = true;
    this.onCursorActivity();
  }

  sendCursor(cursor) {
    if (this.state instanceof AwaitingWithBuffer) {
      return;
    }
    this.serverAdapter.sendCursor(cursor);
  }

  sendOperation(operation) {
    this.serverAdapter.sendOperation(operation);
    this.emitStatus();
  }

  applyOperation(operation) {
    this.editorAdapter.applyOperation(operation);
    this.updateCursor();
    this.undoManager.transform(new WrappedOperation(operation, null));
  }

  emitStatus() {
    setTimeout(() => {
      this.trigger("synced", this.state instanceof Synchronized);
    }, 0);
  }
}

// Set Const.prototype.__proto__ to Super.prototype
function inherit(Const, Super) {
  function F() {}
  F.prototype = Super.prototype;
  Const.prototype = new F();
  Const.prototype.constructor = Const;
}

function last(arr) {
  return arr[arr.length - 1];
}

class SelfMeta {
  constructor(private cursorBefore?: Cursor, private cursorAfter?: Cursor) {}

  invert() {
    return new SelfMeta(this.cursorAfter, this.cursorBefore);
  }

  compose(other) {
    return new SelfMeta(this.cursorBefore, other.cursorAfter);
  }

  transform(operation) {
    return new SelfMeta(
      this.cursorBefore ? this.cursorBefore.transform(operation) : undefined,
      this.cursorAfter ? this.cursorAfter.transform(operation) : undefined
    );
  }
}

class OtherClient {
  cursor?: CursorData;
  color?: string;
  mark?: any;

  constructor(private id: string, private editorAdapter: Adapter) {
    this.id = id;
    this.editorAdapter = editorAdapter;
  }

  setColor(color) {
    this.color = color;
  }

  updateCursor(cursor) {
    this.removeCursor();
    this.cursor = cursor;
    this.mark = this.editorAdapter.setOtherCursor(cursor, this.color!, this.id);
  }

  removeCursor() {
    if (this.mark) {
      this.mark.clear();
    }
  }
}
