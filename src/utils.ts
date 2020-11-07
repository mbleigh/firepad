export function elt(
  tag: string,
  content: string | HTMLElement[] | null,
  attrs: { [name: string]: string }
) {
  var e = document.createElement(tag);
  if (typeof content === "string") {
    setTextContent(e, content);
  } else if (content) {
    for (var i = 0; i < content.length; ++i) {
      e.appendChild(content[i]);
    }
  }
  for (var attr in attrs || {}) {
    e.setAttribute(attr, attrs[attr]);
  }
  return e;
}

export function setTextContent(e: HTMLElement, str: string) {
  e.innerHTML = "";
  e.appendChild(document.createTextNode(str));
}

export function on(
  emitter: { addEventListener?: Function; attachEvent?: Function },
  type: string,
  f: Function,
  capture: boolean = false
) {
  if (emitter.addEventListener) {
    emitter.addEventListener(type, f, capture);
  } else if (emitter.attachEvent) {
    emitter.attachEvent("on" + type, f);
  }
}

export function off(
  emitter: { removeEventListener?: Function; detachEvent?: Function },
  type: string,
  f: Function,
  capture: boolean = false
) {
  if (emitter.removeEventListener) {
    emitter.removeEventListener(type, f, capture || false);
  } else if (emitter.detachEvent) {
    emitter.detachEvent("on" + type, f);
  }
}

export function preventDefault(e: {
  preventDefault?: () => void;
  returnValue?: boolean;
}) {
  if (e.preventDefault) {
    e.preventDefault();
  } else {
    e.returnValue = false;
  }
}

export function stopPropagation(e: {
  stopPropagation?: Function;
  cancelBubble?: boolean;
}) {
  if (e.stopPropagation) {
    e.stopPropagation();
  } else {
    e.cancelBubble = true;
  }
}

export function stopEvent(e: any) {
  preventDefault(e);
  stopPropagation(e);
}

export function stopEventAnd(fn: Function) {
  return function (e) {
    fn(e);
    stopEvent(e);
    return false;
  };
}

export function trim(str: string) {
  return str.replace(/^\s+/g, "").replace(/\s+$/g, "");
}

export function stringEndsWith(str: string, suffix: string) {
  var list = typeof suffix == "string" ? [suffix] : suffix;
  for (var i = 0; i < list.length; i++) {
    var suffix = list[i];
    if (str.indexOf(suffix, str.length - suffix.length) !== -1) return true;
  }
  return false;
}

export function assert(b: any, msg: string = "assertion error") {
  if (!b) {
    throw new Error(msg);
  }
}

export function log(...args: any[]) {
  if (typeof console !== "undefined" && typeof console.log !== "undefined") {
    args.unshift("Firepad:");
    console.log.apply(console, args);
  }
}
