import { Adapter } from "./adapter";
import { EditorClient } from "./editor-client";
import { EntityManager } from "./entity-manager";
import { EventEmitter } from "./event-emitter";
import { FirebaseAdapter } from "./firebase-adapter";
import { debug, elt } from "./utils";

export interface FirepadOptions {
  richTextShortcuts?: boolean;
  richTextToolbar?: boolean;
  imageInsertionUI?: boolean;
  userId?: string;
  userColor?: string;
  defaultText?: string | null;
}

export class Firepad extends EventEmitter() {
  private firepadWrapper: HTMLElement;
  private zombie_: boolean = false;
  private options: FirepadOptions;

  private imageInsertionUI: boolean;
  private entityManager: EntityManager;
  private firebaseAdapter: FirebaseAdapter;
  private client: EditorClient;
  private ready: boolean = false;
  private defaultText: string | null;

  constructor(
    readonly ref: firebase.database.Reference,
    readonly adapter: Adapter,
    options: FirepadOptions
  ) {
    super();
    debug("the very top");

    this.options = Object.assign<FirepadOptions, FirepadOptions>(
      {
        richTextShortcuts: false,
        richTextToolbar: false,
        imageInsertionUI: true,
        defaultText: null,
      },
      options
    );

    this.defaultText = this.options.defaultText || null;

    const editorWrapper = adapter.getContainer();
    this.firepadWrapper = elt("div", null, { class: "firepad" });
    editorWrapper.parentNode!.replaceChild(this.firepadWrapper, editorWrapper);
    this.firepadWrapper.appendChild(editorWrapper);

    // Provide an easy way to get the firepad instance associated with this CodeMirror instance.
    this.adapter.setFirepad(this);

    if (this.options.richTextShortcuts) {
      // if (!CodeMirror.keyMap["richtext"]) {
      //   this.initializeKeyMap_();
      // }
      // this.codeMirror_.setOption("keyMap", "richtext");
      this.firepadWrapper.className += " firepad-richtext";
    }

    this.imageInsertionUI = this.options.imageInsertionUI || false;

    if (this.options.richTextToolbar) {
      this.addToolbar_();
      this.firepadWrapper.className += " firepad-richtext firepad-with-toolbar";
    }

    this.addPoweredByLogo_();

    this.adapter.refresh();

    const userId = this.options.userId || ref.push().key;
    const userColor = this.options.userColor || colorFromUserId(userId);

    this.entityManager = new EntityManager();

    this.firebaseAdapter = new FirebaseAdapter(ref, userId!, userColor);
    // if (this.codeMirror_) {
    //   this.richTextCodeMirror_ = new RichTextCodeMirror(
    //     this.codeMirror_,
    //     this.entityManager_,
    //     { cssPrefix: "firepad-" }
    //   );
    //   this.editorAdapter_ = new RichTextCodeMirrorAdapter(
    //     this.richTextCodeMirror_
    //   );
    // } else if (this.ace_) {
    //   this.editorAdapter_ = new ACEAdapter(this.ace_);
    // } else {
    //   this.editorAdapter_ = new MonacoAdapter(this.monaco_);
    // }
    this.client = new EditorClient(this.firebaseAdapter, this.adapter);

    this.firebaseAdapter.on("cursor", (...args: any[]) => {
      this.trigger("cursor", ...args);
    });

    // if (this.codeMirror_) {
    //   this.richTextCodeMirror_.on("newLine", function () {
    //     self.trigger.apply(self, ["newLine"].concat([].slice.call(arguments)));
    //   });
    // }

    this.firebaseAdapter.on("ready", () => {
      this.ready = true;
      this.adapter.grabDocumentState();

      debug("firebaseadapter ready", this.defaultText, this.isHistoryEmpty());
      if (this.defaultText && this.isHistoryEmpty()) {
        this.setText(this.defaultText);
      }

      this.trigger("ready");
    });

    this.client.on("synced", (isSynced: boolean) => {
      this.trigger("synced", isSynced);
    });

    // // Hack for IE8 to make font icons work more reliably.
    // // http://stackoverflow.com/questions/9809351/ie8-css-font-face-fonts-only-working-for-before-content-on-over-and-sometimes
    // if (
    //   navigator.appName == "Microsoft Internet Explorer" &&
    //   navigator.userAgent.match(/MSIE 8\./)
    // ) {
    //   window.onload = function () {
    //     var head = document.getElementsByTagName("head")[0],
    //       style = document.createElement("style");
    //     style.type = "text/css";
    //     style.styleSheet.cssText = ":before,:after{content:none !important;}";
    //     head.appendChild(style);
    //     setTimeout(function () {
    //       head.removeChild(style);
    //     }, 0);
    //   };
    // }
  }

  dispose() {
    this.zombie_ = true; // We've been disposed.  No longer valid to do anything.

    const editorWrapper = this.adapter.getContainer();
    this.firepadWrapper.removeChild(editorWrapper);
    this.firepadWrapper.parentNode!.replaceChild(
      editorWrapper,
      this.firepadWrapper
    );

    this.adapter.setFirepad(null);
    this.adapter.dispose();
    // if (this.codeMirror_ && this.codeMirror_.getOption("keyMap") === "richtext") {
    //   this.codeMirror_.setOption("keyMap", "default");
    // }

    this.firebaseAdapter.dispose();
    // this.editorAdapter_.detach();
    // if (this.richTextCodeMirror_) this.richTextCodeMirror_.detach();
  }

  setUserId(userId: string) {
    this.firebaseAdapter.setUserId(userId);
  }

  setUserColor(color: string) {
    this.firebaseAdapter.setColor(color);
  }

  getText(): string {
    this.assertready("getText");
    return this.adapter.getText();
    // if (this.codeMirror_) return this.richTextCodeMirror_.getText();
    // else if (this.ace_) return this.ace_.getSession().getDocument().getValue();
    // else return this.monaco_.getModel().getValue();
  }

  setText(textPieces: string) {
    this.assertready("setText");
    this.adapter.setText(textPieces);
    // if (this.monaco_) {
    //   return this.monaco_.getModel().setValue(textPieces);
    // } else if (this.ace_) {
    //   return this.ace_.getSession().getDocument().setValue(textPieces);
    // } else {
    //   // HACK: Hide CodeMirror during setText to prevent lots of extra renders.
    //   this.codeMirror_.getWrapperElement().style.display = "none";
    //   this.codeMirror_.setValue("");
    //   this.insertText(0, textPieces);
    //   this.codeMirror_.getWrapperElement().style.display = "";
    //   this.codeMirror_.refresh();
    // }
    this.adapter.setCursor({ position: 0, selectionEnd: 0 });
  }

  insertTextAtCursor(textPieces: string) {
    this.adapter.insertTextAtCursor(textPieces);
    // this.insertText(
    //   this.codeMirror_.indexFromPos(this.codeMirror_.getCursor()),
    //   textPieces
    // );
  }

  insertText(index: number, textPieces: string) {
    return this.adapter.insertText(index, textPieces);
    // utils.assert(!this.ace_, "Not supported for ace yet.");
    // utils.assert(!this.monaco_, "Not supported for monaco yet.");
    // this.assertready("insertText");

    // // Wrap it in an array if it's not already.
    // if (Object.prototype.toString.call(textPieces) !== "[object Array]") {
    //   textPieces = [textPieces];
    // }

    // var self = this;
    // self.codeMirror_.operation(function () {
    //   // HACK: We should check if we're actually at the beginning of a line; but checking for index == 0 is sufficient
    //   // for the setText() case.
    //   var atNewLine = index === 0;
    //   var inserts = firepad.textPiecesToInserts(atNewLine, textPieces);

    //   for (var i = 0; i < inserts.length; i++) {
    //     var string = inserts[i].string;
    //     var attributes = inserts[i].attributes;
    //     self.richTextCodeMirror_.insertText(index, string, attributes);
    //     index += string.length;
    //   }
    // });
  }

  getOperationForSpan(start: number, end: number) {
    throw new Error("Unimplemented");
    // var text = this.richTextCodeMirror_.getRange(start, end);
    // var spans = this.richTextCodeMirror_.getAttributeSpans(start, end);
    // var pos = 0;
    // var op = new firepad.TextOperation();
    // for (var i = 0; i < spans.length; i++) {
    //   op.insert(text.substr(pos, spans[i].length), spans[i].attributes);
    //   pos += spans[i].length;
    // }
    // return op;
  }

  getHtml() {
    return this.getHtmlFromRange(null, null);
  }

  getHtmlFromSelection() {
    throw new Error("Unimplemented");
    // var startPos = this.codeMirror_.getCursor("start"),
    // endPos = this.codeMirror_.getCursor("end");
    // var startIndex = this.codeMirror_.indexFromPos(startPos),
    //   endIndex = this.codeMirror_.indexFromPos(endPos);
    // return this.getHtmlFromRange(startIndex, endIndex);
  }

  getHtmlFromRange(start, end) {
    throw new Error("Unimplemented");
    // this.assertready("getHtmlFromRange");
    // var doc =
    //   start != null && end != null
    //     ? this.getOperationForSpan(start, end)
    //     : this.getOperationForSpan(0, this.codeMirror_.getValue().length);
    // return firepad.SerializeHtml(doc, this.entityManager_);
  }

  insertHtml(index, html) {
    throw new Error("Unimplemented");
    // var lines = parseHtml(html, this.entityManager_);
    // this.insertText(index, lines);
  }

  insertHtmlAtCursor(html) {
    throw new Error("Unimplemented");
    // this.insertHtml(
    //   this.codeMirror_.indexFromPos(this.codeMirror_.getCursor()),
    //   html
    // );
  }

  setHtml(html: string) {
    throw new Error("Unimplemented");

    // var lines = parseHtml(html, this.entityManager);
    // this.setText(lines);
  }

  isHistoryEmpty() {
    this.assertready("isHistoryEmpty");
    return this.firebaseAdapter.isHistoryEmpty();
  }

  bold() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleAttribute(ATTR.BOLD);
    // this.codeMirror_.focus();
  }

  italic = function () {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleAttribute(ATTR.ITALIC);
    // this.codeMirror_.focus();
  };

  underline = function () {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleAttribute(ATTR.UNDERLINE);
    // this.codeMirror_.focus();
  };

  strike() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleAttribute(ATTR.STRIKE);
    // this.codeMirror_.focus();
  }

  fontSize(size) {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.setAttribute(ATTR.FONT_SIZE, size);
    // this.codeMirror_.focus();
  }

  font(font) {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.setAttribute(ATTR.FONT, font);
    // this.codeMirror_.focus();
  }

  color(color) {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.setAttribute(ATTR.COLOR, color);
    // this.codeMirror_.focus();
  }

  highlight = function () {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleAttribute(
    //   ATTR.BACKGROUND_COLOR,
    //   "rgba(255,255,0,.65)"
    // );
    // this.codeMirror_.focus();
  };

  align(alignment) {
    throw new Error("Unimplemented");

    // if (alignment !== "left" && alignment !== "center" && alignment !== "right") {
    //   throw new Error('align() must be passed "left", "center", or "right".');
    // }
    // this.richTextCodeMirror_.setLineAttribute(ATTR.LINE_ALIGN, alignment);
    // this.codeMirror_.focus();
  }

  orderedList() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleLineAttribute(ATTR.LIST_TYPE, "o");
    // this.codeMirror_.focus();
  }

  unorderedList = function () {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleLineAttribute(ATTR.LIST_TYPE, "u");
    // this.codeMirror_.focus();
  };

  todo() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.toggleTodo();
    // this.codeMirror_.focus();
  }

  newline() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.newline();
  }

  deleteLeft = function () {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.deleteLeft();
  };

  deleteRight() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.deleteRight();
  }

  indent() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.indent();
    // this.codeMirror_.focus();
  }

  unindent() {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.unindent();
    // this.codeMirror_.focus();
  }

  undo() {
    throw new Error("Unimplemented");

    // this.codeMirror_.undo();
  }

  redo() {
    throw new Error("Unimplemented");

    // this.codeMirror_.redo();
  }

  insertEntity(type, info, origin) {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.insertEntityAtCursor(type, info, origin);
  }

  insertEntityAt(index, type, info, origin) {
    throw new Error("Unimplemented");

    // this.richTextCodeMirror_.insertEntityAt(index, type, info, origin);
  }

  registerEntity(type, options) {
    this.entityManager.register(type, options);
  }

  assertready(funcName: string) {
    if (!this.ready) {
      throw new Error(
        'You must wait for the "ready" event before calling ' + funcName + "."
      );
    }
    if (this.zombie_) {
      throw new Error(
        "You can't use a Firepad after calling dispose()!  [called " +
          funcName +
          "]"
      );
    }
  }

  makeImageDialog_() {
    throw new Error("Unimplemented");
    // this.makeDialog_("img", "Insert image url");
  }

  makeDialog_(id, placeholder) {
    throw new Error("Unimplemented");

    // var self = this;

    // var hideDialog = function () {
    //   var dialog = document.getElementById("overlay");
    //   dialog.style.visibility = "hidden";
    //   self.firepadWrapper_.removeChild(dialog);
    // };

    // var cb = function () {
    //   var dialog = document.getElementById("overlay");
    //   dialog.style.visibility = "hidden";
    //   var src = document.getElementById(id).value;
    //   if (src !== null) self.insertEntity(id, { src: src });
    //   self.firepadWrapper_.removeChild(dialog);
    // };

    // var input = utils.elt("input", null, {
    //   class: "firepad-dialog-input",
    //   id: id,
    //   type: "text",
    //   placeholder: placeholder,
    //   autofocus: "autofocus",
    // });

    // var submit = utils.elt("a", "Submit", {
    //   class: "firepad-btn",
    //   id: "submitbtn",
    // });
    // utils.on(submit, "click", utils.stopEventAnd(cb));

    // var cancel = utils.elt("a", "Cancel", { class: "firepad-btn" });
    // utils.on(cancel, "click", utils.stopEventAnd(hideDialog));

    // var buttonsdiv = utils.elt("div", [submit, cancel], {
    //   class: "firepad-btn-group",
    // });

    // var div = utils.elt("div", [input, buttonsdiv], {
    //   class: "firepad-dialog-div",
    // });
    // var dialog = utils.elt("div", [div], {
    //   class: "firepad-dialog",
    //   id: "overlay",
    // });

    // this.firepadWrapper_.appendChild(dialog);
  }

  addToolbar_() {
    throw new Error("Unimplemented");

    // this.toolbar = new RichTextToolbar(this.imageInsertionUI);

    // this.toolbar.on("undo", this.undo, this);
    // this.toolbar.on("redo", this.redo, this);
    // this.toolbar.on("bold", this.bold, this);
    // this.toolbar.on("italic", this.italic, this);
    // this.toolbar.on("underline", this.underline, this);
    // this.toolbar.on("strike", this.strike, this);
    // this.toolbar.on("font-size", this.fontSize, this);
    // this.toolbar.on("font", this.font, this);
    // this.toolbar.on("color", this.color, this);
    // this.toolbar.on(
    //   "left",
    //   function () {
    //     this.align("left");
    //   },
    //   this
    // );
    // this.toolbar.on(
    //   "center",
    //   function () {
    //     this.align("center");
    //   },
    //   this
    // );
    // this.toolbar.on(
    //   "right",
    //   function () {
    //     this.align("right");
    //   },
    //   this
    // );
    // this.toolbar.on("ordered-list", this.orderedList, this);
    // this.toolbar.on("unordered-list", this.unorderedList, this);
    // this.toolbar.on("todo-list", this.todo, this);
    // this.toolbar.on("indent-increase", this.indent, this);
    // this.toolbar.on("indent-decrease", this.unindent, this);
    // this.toolbar.on("insert-image", this.makeImageDialog_, this);

    // this.firepadWrapper_.insertBefore(
    //   this.toolbar.element(),
    //   this.firepadWrapper_.firstChild
    // );
  }

  addPoweredByLogo_() {
    var poweredBy = elt("a", null, { class: "powered-by-firepad" });
    poweredBy.setAttribute("href", "http://www.firepad.io/");
    poweredBy.setAttribute("target", "_blank");
    this.firepadWrapper.appendChild(poweredBy);
  }

  initializeKeyMap_() {
    throw new Error("Unimplemented");

    // function binder(fn) {
    //   return function (cm) {
    //     // HACK: CodeMirror will often call our key handlers within a cm.operation(), and that
    //     // can mess us up (we rely on events being triggered synchronously when we make CodeMirror
    //     // edits).  So to escape any cm.operation(), we do a setTimeout.
    //     setTimeout(function () {
    //       fn.call(cm.firepad);
    //     }, 0);
    //   };
    // }

    // CodeMirror.keyMap["richtext"] = {
    //   "Ctrl-B": binder(this.bold),
    //   "Cmd-B": binder(this.bold),
    //   "Ctrl-I": binder(this.italic),
    //   "Cmd-I": binder(this.italic),
    //   "Ctrl-U": binder(this.underline),
    //   "Cmd-U": binder(this.underline),
    //   "Ctrl-H": binder(this.highlight),
    //   "Cmd-H": binder(this.highlight),
    //   Enter: binder(this.newline),
    //   Delete: binder(this.deleteRight),
    //   Backspace: binder(this.deleteLeft),
    //   Tab: binder(this.indent),
    //   "Shift-Tab": binder(this.unindent),
    //   fallthrough: ["default"],
    // };
  }
}
function colorFromUserId(userId) {
  var a = 1;
  for (var i = 0; i < userId.length; i++) {
    a = (17 * (a + userId.charCodeAt(i))) % 360;
  }
  var hue = a / 360;

  return hsl2hex(hue, 1, 0.75);
}

function rgb2hex(r, g, b) {
  function digits(n) {
    var m = Math.round(255 * n).toString(16);
    return m.length === 1 ? "0" + m : m;
  }
  return "#" + digits(r) + digits(g) + digits(b);
}

function hsl2hex(h, s, l) {
  if (s === 0) {
    return rgb2hex(l, l, l);
  }
  var var2 = l < 0.5 ? l * (1 + s) : l + s - s * l;
  var var1 = 2 * l - var2;
  var hue2rgb = function (hue) {
    if (hue < 0) {
      hue += 1;
    }
    if (hue > 1) {
      hue -= 1;
    }
    if (6 * hue < 1) {
      return var1 + (var2 - var1) * 6 * hue;
    }
    if (2 * hue < 1) {
      return var2;
    }
    if (3 * hue < 2) {
      return var1 + (var2 - var1) * 6 * (2 / 3 - hue);
    }
    return var1;
  };
  return rgb2hex(hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3));
}
