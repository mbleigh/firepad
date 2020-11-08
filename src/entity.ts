const ATTR = {
  BOLD: "b",
  ITALIC: "i",
  UNDERLINE: "u",
  STRIKE: "s",
  FONT: "f",
  FONT_SIZE: "fs",
  COLOR: "c",
  BACKGROUND_COLOR: "bc",
  ENTITY_SENTINEL: "ent",

  // Line Attributes
  LINE_SENTINEL: "l",
  LINE_INDENT: "li",
  LINE_ALIGN: "la",
  LIST_TYPE: "lt",
};

const SENTINEL = ATTR.ENTITY_SENTINEL;
const PREFIX = SENTINEL + "_";
/**
 * Object to represent an Entity.
 */
export class Entity {
  constructor(public type: string, public info: object) {}

  toAttributes() {
    var attrs = {};
    attrs[SENTINEL] = this.type;

    for (var attr in this.info) {
      attrs[PREFIX + attr] = this.info[attr];
    }

    return attrs;
  }

  static fromAttributes(attributes) {
    var type = attributes[SENTINEL];
    var info = {};
    for (var attr in attributes) {
      if (attr.indexOf(PREFIX) === 0) {
        info[attr.substr(PREFIX.length)] = attributes[attr];
      }
    }

    return new Entity(type, info);
  }
}
