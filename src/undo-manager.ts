import { ITextOperation, TextOperation } from "./text-operation";

enum UndoState {
  NORMAL = "normal",
  UNDOING = "undoing",
  REDOING = "redoing",
}

export class UndoManager {
  state: UndoState = UndoState.NORMAL;
  dontCompose: boolean = false;
  undoStack: any[] = [];
  redoStack: any[] = [];

  // Create a new UndoManager with an optional maximum history size.
  constructor(private maxItems: number = 50) {}

  // Add an operation to the undo or redo stack, depending on the current state
  // of the UndoManager. The operation added must be the inverse of the last
  // edit. When `compose` is true, compose the operation with the last operation
  // unless the last operation was alread pushed on the redo stack or was hidden
  // by a newer operation on the undo stack.
  add(operation: ITextOperation, compose: boolean = false) {
    if (this.state === UndoState.UNDOING) {
      this.redoStack.push(operation);
      this.dontCompose = true;
    } else if (this.state === UndoState.REDOING) {
      this.undoStack.push(operation);
      this.dontCompose = true;
    } else {
      var undoStack = this.undoStack;
      if (!this.dontCompose && compose && undoStack.length > 0) {
        undoStack.push(operation.compose(undoStack.pop()));
      } else {
        undoStack.push(operation);
        if (undoStack.length > this.maxItems) {
          undoStack.shift();
        }
      }
      this.dontCompose = false;
      this.redoStack = [];
    }
  }

  // Transform the undo and redo stacks against a operation by another client.
  transform(operation: ITextOperation) {
    this.undoStack = transformStack(this.undoStack, operation);
    this.redoStack = transformStack(this.redoStack, operation);
  }

  // Perform an undo by calling a function with the latest operation on the undo
  // stack. The function is expected to call the `add` method with the inverse
  // of the operation, which pushes the inverse on the redo stack.
  performUndo(fn: (operation: ITextOperation) => any) {
    this.state = UndoState.UNDOING;
    if (this.undoStack.length === 0) {
      throw new Error("undo not possible");
    }
    fn(this.undoStack.pop());
    this.state = UndoState.NORMAL;
  }

  // The inverse of `performUndo`.
  performRedo(fn: (operation: ITextOperation) => any) {
    this.state = UndoState.REDOING;
    if (this.redoStack.length === 0) {
      throw new Error("redo not possible");
    }
    fn(this.redoStack.pop());
    this.state = UndoState.NORMAL;
  }

  // Is the undo stack not empty?
  canUndo() {
    return this.undoStack.length !== 0;
  }

  // Is the redo stack not empty?
  canRedo() {
    return this.redoStack.length !== 0;
  }

  // Whether the UndoManager is currently performing an undo.
  isUndoing() {
    return this.state === UndoState.UNDOING;
  }

  // Whether the UndoManager is currently performing a redo.
  isRedoing() {
    return this.state === UndoState.REDOING;
  }
}

function transformStack(stack, operation: ITextOperation) {
  var newStack: ITextOperation[] = [];
  var Operation = operation.constructor;
  for (var i = stack.length - 1; i >= 0; i--) {
    var pair = (operation.constructor as any).transform(stack[i], operation);
    if (typeof pair[0].isNoop !== "function" || !pair[0].isNoop()) {
      newStack.push(pair[0]);
    }
    operation = pair[1];
  }
  return newStack.reverse();
}
