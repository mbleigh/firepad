import * as monaco from "monaco-editor";
import { Firepad } from "./index";
import { Adapter } from "./adapter";
import { Cursor, CursorData } from "./cursor";
import { TextOperation } from "./text-operation";

/**
 * @function getCSS - For Internal Usage Only
 * @param {String} clazz - CSS Class Name
 * @param {String} bgColor - Background Color
 * @param {String} color - Font Color
 * @returns CSS Style Rules according to Parameters
 */
var getCSS = function getCSS(clazz, bgColor, color) {
  return (
    "." +
    clazz +
    " {\n  position: relative;\n" +
    "background-color: " +
    bgColor +
    ";\n" +
    "border-left: 2px solid " +
    color +
    ";\n}"
  );
};

export class MonacoAdapter implements Adapter {
  editorModel: monaco.editor.ITextModel;
  lastDocLines: string[];
  lastCursorRange: monaco.Selection;
  callbacks: { [name: string]: Function } = {};
  otherCursors: any[] = [];
  addedStyleRules: any[] = [];
  ignoreChanges: boolean = false;

  /**
   * @function addStyleRule - For Internal Usage Only
   * @desc Creates style element in document head and pushed all the style rules
   * @param {String} clazz - CSS Class Name
   * @param {String} css - CSS Style Rules
   */
  addStyleRule(clazz: string, css: string) {
    /** House Keeping */
    if (typeof document === "undefined" || document === null) {
      return false;
    }

    /** Add style rules only once */
    if (this.addedStyleRules.indexOf(clazz) === -1) {
      var styleElement = document.createElement("style");
      var styleSheet = document.createTextNode(css);
      styleElement.appendChild(styleSheet);
      document.head.appendChild(styleElement);
      this.addedStyleRules.push(clazz);
    }
  }

  private changeHandler: monaco.IDisposable;
  private didBlurHandler: monaco.IDisposable;
  private didFocusHandler: monaco.IDisposable;
  private didChangeCursorPositionHandler: monaco.IDisposable;

  constructor(public editor: monaco.editor.IStandaloneCodeEditor) {
    /** Monaco Member Variables */
    this.editorModel = this.editor.getModel()!;
    this.lastDocLines = this.editorModel.getLinesContent();
    this.lastCursorRange = this.editor.getSelection()!;

    /** Editor Callback Handler */
    this.changeHandler = this.editor.onDidChangeModelContent(this.onChange);
    this.didBlurHandler = this.editor.onDidBlurEditorWidget(this.onBlur);
    this.didFocusHandler = this.editor.onDidFocusEditorWidget(this.onFocus);
    this.didChangeCursorPositionHandler = this.editor.onDidChangeCursorPosition(
      this.onCursorActivity
    );
  }

  /**
   * @method detach - Clears an Instance of Editor Adapter
   */
  detach() {
    this.changeHandler.dispose();
    this.didBlurHandler.dispose();
    this.didFocusHandler.dispose();
    this.didChangeCursorPositionHandler.dispose();
  }

  getContainer(): HTMLElement {
    return this.getContainer();
  }

  /**
   * @method getCursor - Get current cursor position
   * @returns Firepad Cursor object
   */
  getCursor(): Cursor {
    var selection = this.editor.getSelection();

    /** Fallback to last cursor change */
    if (typeof selection === "undefined" || selection === null) {
      selection = this.lastCursorRange;
    }

    /** Obtain selection indexes */
    var startPos = selection.getStartPosition();
    var endPos = selection.getEndPosition();
    var start = this.editorModel.getOffsetAt(startPos);
    var end = this.editorModel.getOffsetAt(endPos);

    /** If Selection is Inversed */
    if (start > end) {
      var _ref = [end, start];
      start = _ref[0];
      end = _ref[1];
    }

    /** Return cursor position */
    return new Cursor(start, end);
  }

  /**
   * @method setCursor - Set Selection on Monaco Editor Instance
   */
  setCursor(cursor: CursorData) {
    var position = cursor.position;
    var selectionEnd = cursor.selectionEnd;
    var start = this.editorModel.getPositionAt(position);
    var end = this.editorModel.getPositionAt(selectionEnd);

    /** If selection is inversed */
    if (position > selectionEnd) {
      var _ref = [end, start];
      start = _ref[0];
      end = _ref[1];
    }

    /** Create Selection in the Editor */
    this.editor.setSelection(
      new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      )
    );
  }

  /**
   * @method setOtherCursor - Set Remote Selection on Monaco Editor
   */
  setOtherCursor(cursor: CursorData, color: string, clientID: any) {
    /** House Keeping */
    if (
      typeof cursor !== "object" ||
      typeof cursor.position !== "number" ||
      typeof cursor.selectionEnd !== "number"
    ) {
      return false;
    }

    if (typeof color !== "string" || !color.match(/^#[a-fA-F0-9]{3,6}$/)) {
      return false;
    }

    /** Extract Positions */
    var position = cursor.position;
    var selectionEnd = cursor.selectionEnd;

    if (position < 0 || selectionEnd < 0) {
      return false;
    }

    /** Fetch Client Cursor Information */
    var otherCursor = this.otherCursors.find(function (cursor) {
      return cursor.clientID === clientID;
    });

    /** Initialize empty array, if client does not exist */
    if (!otherCursor) {
      otherCursor = {
        clientID: clientID,
        decoration: [],
      };
      this.otherCursors.push(otherCursor);
    }

    /** Remove Earlier Decorations, if any, or initialize empty decor */
    otherCursor.decoration = this.editor.deltaDecorations(
      otherCursor.decoration,
      []
    );
    var clazz = "other-client-selection-" + color.replace("#", "");
    var css, ret;

    if (position === selectionEnd) {
      /** Show only cursor */
      clazz = clazz.replace("selection", "cursor");

      /** Generate Style rules and add them to document */
      css = getCSS(clazz, "transparent", color);
      ret = this.addStyleRule(clazz, css);
    } else {
      /** Generate Style rules and add them to document */
      css = getCSS(clazz, color, color);
      ret = this.addStyleRule(clazz, css);
    }

    /** Return if failed to add css */
    if (ret == false) {
      console.log(
        "Monaco Adapter: Failed to add some css style.\n" +
          "Please make sure you're running on supported environment."
      );
    }

    /** Get co-ordinate position in Editor */
    var start = this.editorModel.getPositionAt(position);
    var end = this.editorModel.getPositionAt(selectionEnd);

    /** Selection is inversed */
    if (position > selectionEnd) {
      var _ref = [end, start];
      start = _ref[0];
      end = _ref[1];
    }

    /** Add decoration to the Editor */
    otherCursor.decoration = this.editor.deltaDecorations(
      otherCursor.decoration,
      [
        {
          range: new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column
          ),
          options: {
            className: clazz,
          },
        },
      ]
    );

    /** Clear cursor method */
    return {
      clear: () => {
        otherCursor.decoration = this.editor.deltaDecorations(
          otherCursor.decoration,
          []
        );
      },
    };
  }

  /**
   * @method registerCallbacks - Assign callback functions to internal property
   * @param {function[]} callbacks - Set of callback functions
   */
  registerCallbacks(callbacks: { [name: string]: Function }) {
    this.callbacks = Object.assign({}, this.callbacks, callbacks);
  }

  /**
   * @method registerUndo
   * @param {function} callback - Callback Handler for Undo Event
   */
  registerUndo(callback: Function) {
    if (typeof callback === "function") {
      this.callbacks.undo = callback;
    } else {
      throw new Error(
        "MonacoAdapter: registerUndo method expects a " +
          "callback function in parameter"
      );
    }
  }

  /**
   * @method registerRedo
   * @param {function} callback - Callback Handler for Redo Event
   */
  registerRedo(callback: Function) {
    if (typeof callback === "function") {
      this.callbacks.redo = callback;
    } else {
      throw new Error(
        "MonacoAdapter: registerRedo method expects a " +
          "callback function in parameter"
      );
    }
  }

  /**
   * @method operationFromMonacoChanges - Convert Monaco Changes to OT.js Ops
   * @param {Object} change - Change in Editor
   * @param {string} content - Last Editor Content
   * @param {Number} offset - Offset between changes of same event
   * @returns Pair of Operation and Inverse
   * Note: OT.js Operation expects the cursor to be at the end of content
   */
  operationFromMonacoChanges(change: any, content: string, offset: number) {
    /** Change Informations */
    var text = change.text;
    var rangeLength = change.rangeLength;
    var rangeOffset = change.rangeOffset;

    /** Additional SEEK distance */
    var restLength = content.length + offset - rangeOffset;

    /** Declare OT.js Operation Variables */
    var change_op, inverse_op, replaced_text;

    if (text.length === 0 && rangeLength > 0) {
      /** Delete Operation */
      replaced_text = content.slice(rangeOffset, rangeOffset + rangeLength);

      change_op = new TextOperation()
        .retain(rangeOffset)
        .delete(rangeLength)
        .retain(restLength - rangeLength);

      inverse_op = new TextOperation()
        .retain(rangeOffset)
        .insert(replaced_text)
        .retain(restLength - rangeLength);
    } else if (text.length > 0 && rangeLength > 0) {
      /** Replace Operation */
      replaced_text = content.slice(rangeOffset, rangeOffset + rangeLength);

      change_op = new TextOperation()
        .retain(rangeOffset)
        .delete(rangeLength)
        .insert(text)
        .retain(restLength - rangeLength);

      inverse_op = new TextOperation()
        .retain(rangeOffset)
        .delete(text.length)
        .insert(replaced_text)
        .retain(restLength - rangeLength);
    } else {
      /** Insert Operation */
      change_op = new TextOperation()
        .retain(rangeOffset)
        .insert(text)
        .retain(restLength);

      inverse_op = new TextOperation()
        .retain(rangeOffset)
        .delete(text)
        .retain(restLength);
    }

    return [change_op, inverse_op];
  }

  onChange = (event: monaco.editor.IModelContentChangedEvent): void => {
    if (!this.ignoreChanges) {
      var content = this.lastDocLines.join(this.editorModel.getEOL());
      var offset = 0;

      /** If no change information recieved */
      if (!event.changes) {
        var op = new TextOperation().retain(content.length);
        this.trigger("change", op, op);
      }

      /** Iterate through all changes */
      event.changes.forEach((change) => {
        var pair = this.operationFromMonacoChanges(change, content, offset);
        offset += pair[0].targetLength - pair[0].baseLength;

        this.trigger("change", pair);
      });

      /** Update Editor Content */
      this.lastDocLines = this.editorModel.getLinesContent();
    }
  };

  /**
   * @method trigger - Event Handler
   * @param {string} event - Event name
   * @param  {...any} args - Callback arguments
   */
  trigger(event: string, ...args: any[]) {
    if (!this.callbacks.hasOwnProperty(event)) {
      return;
    }

    const action: Function = this.callbacks[event];

    if (typeof action !== "function") {
      return;
    }

    action.apply(null, args);
  }

  /**
   * @method onBlur - Blur event handler
   */
  onBlur = (): void => {
    if (this.editor.getSelection()!.isEmpty()) {
      this.trigger("blur");
    }
  };

  /**
   * @method onFocus - Focus event handler
   */
  onFocus = (): void => {
    this.trigger("focus");
  };

  /**
   * @method onCursorActivity - CursorActivity event handler
   */
  onCursorActivity = (
    event: monaco.editor.ICursorPositionChangedEvent
  ): void => {
    setTimeout(() => {
      return this.trigger("cursorActivity");
    }, 1);
  };

  /**
   * @method applyOperation
   * @param {Operation} operation - OT.js Operation Object
   */
  applyOperation(operation: any) {
    if (!operation.isNoop()) {
      this.ignoreChanges = true;
    }

    /** Get Operations List */
    var opsList = operation.ops;
    var index = 0;

    for (const op of opsList) {
      /** Retain Operation */
      if (op.isRetain()) {
        index += op.chars;
      } else if (op.isInsert()) {
        /** Insert Operation */
        var pos = this.editorModel.getPositionAt(index);

        this.editor.executeEdits("my-source", [
          {
            range: new monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column
            ),
            text: op.text,
            forceMoveMarkers: true,
          },
        ]);

        index += op.text.length;
      } else if (op.isDelete()) {
        /** Delete Operation */
        var from = this.editorModel.getPositionAt(index);
        var to = this.editorModel.getPositionAt(index + op.chars);

        this.editor.executeEdits("my-source", [
          {
            range: new monaco.Range(
              from.lineNumber,
              from.column,
              to.lineNumber,
              to.column
            ),
            text: "",
            forceMoveMarkers: true,
          },
        ]);
      }
    }

    /** Update Editor Content and Reset Config */
    this.lastDocLines = this.editorModel.getLinesContent();
    this.ignoreChanges = false;
  }

  /**
   * @method invertOperation
   * @param {Operation} operation - OT.js Operation Object
   */
  invertOperation(operation: any) {
    operation.invert(this.getValue());
  }

  getValue(): string {
    return this.editor.getValue();
  }

  setFirepad(pad: Firepad) {
    (this.editor as any).firepad = pad;
  }

  grabDocumentState() {
    this.lastDocLines = this.editorModel.getLinesContent();
    this.lastCursorRange = this.editor.getSelection()!;
  }

  refresh() {
    // noop
  }

  dispose() {}

  getText(): string {
    return this.editorModel.getValue();
  }

  setText(text: string): void {
    return this.editorModel.setValue(text);
  }

  insertTextAtCursor(text: string): void {
    this.editor.executeEdits("my-source", [
      { text, range: this.editor.getSelection()!, forceMoveMarkers: true },
    ]);
  }

  insertText(pos: number, text: string): void {
    throw new Error("Firepad: Monaco adapter does not implement insertText");
  }
}
