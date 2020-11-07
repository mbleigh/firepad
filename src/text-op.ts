import { assert } from "./utils";

export class TextOp {
  chars: number | null = null;
  text: string | null = null;
  attributes: object | null = null;

  // Operation are essentially lists of ops. There are three types of ops:
  //
  // * Retain ops: Advance the cursor position by a given number of characters.
  //   Represented by positive ints.
  // * Insert ops: Insert a given string at the current cursor position.
  //   Represented by strings.
  // * Delete ops: Delete the next n characters. Represented by negative ints.
  constructor(type: "insert", text: string, attributes?: object);
  constructor(type: "delete", chars: number);
  constructor(type: "retain", chars: number, attributes?: object);
  constructor(
    readonly type: "insert" | "delete" | "retain",
    charsOrText: number | string,
    attributes: object = {}
  ) {
    if (type === "insert") {
      this.text = charsOrText as string;
      assert(typeof this.text === "string");
      this.attributes = attributes;
      assert(typeof this.attributes === "object");
    } else if (type === "delete") {
      this.chars = charsOrText as number;
      assert(typeof this.chars === "number");
    } else if (type === "retain") {
      this.chars = charsOrText as number;
      assert(typeof this.chars === "number");
      this.attributes = attributes;
      assert(typeof this.attributes === "object");
    }
  }

  isInsert() {
    return this.type === "insert";
  }
  isDelete() {
    return this.type === "delete";
  }
  isRetain() {
    return this.type === "retain";
  }

  equals(other) {
    return (
      this.type === other.type &&
      this.text === other.text &&
      this.chars === other.chars &&
      this.attributesEqual(other.attributes)
    );
  }

  attributesEqual(otherAttributes) {
    for (var attr in this.attributes) {
      if (this.attributes[attr] !== otherAttributes[attr]) {
        return false;
      }
    }

    for (attr in otherAttributes) {
      if (this.attributes?.[attr] !== otherAttributes[attr]) {
        return false;
      }
    }

    return true;
  }

  hasEmptyAttributes() {
    var empty = true;
    for (var attr in this.attributes) {
      empty = false;
      break;
    }

    return empty;
  }
}
