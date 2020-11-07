import { TextOperation } from "./text-operation";

export interface CursorData {
  position: number;
  selectionEnd: number;
}

export class Cursor {
  // A cursor has a `position` and a `selectionEnd`. Both are zero-based indexes
  // into the document. When nothing is selected, `selectionEnd` is equal to
  // `position`. When there is a selection, `position` is always the side of the
  // selection that would move if you pressed an arrow key.
  constructor(public position: number, public selectionEnd: number) {}

  static fromJSON(obj: CursorData): Cursor {
    return new Cursor(obj.position, obj.selectionEnd);
  }

  equals(other: CursorData): boolean {
    return (
      this.position === other.position &&
      this.selectionEnd === other.selectionEnd
    );
  }

  compose(other: Cursor) {
    return other;
  }

  // Update the cursor with respect to an operation.
  transform(other: TextOperation) {
    function transformIndex(index) {
      var newIndex = index;
      var ops = other.ops;
      for (var i = 0, l = other.ops.length; i < l; i++) {
        if (ops[i].isRetain()) {
          index -= ops[i].chars;
        } else if (ops[i].isInsert()) {
          newIndex += ops[i].text.length;
        } else {
          newIndex -= Math.min(index, ops[i].chars);
          index -= ops[i].chars;
        }
        if (index < 0) {
          break;
        }
      }
      return newIndex;
    }

    var newPosition = transformIndex(this.position);
    if (this.position === this.selectionEnd) {
      return new Cursor(newPosition, newPosition);
    }
    return new Cursor(newPosition, transformIndex(this.selectionEnd));
  }
}
