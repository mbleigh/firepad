import { TextOperation } from "./text-operation";

export class WrappedOperation {
  constructor(private wrapped: TextOperation, private meta) {}

  apply() {
    return this.wrapped.apply.apply(this.wrapped, arguments as any);
  }

  invert() {
    var meta = this.meta;
    return new WrappedOperation(
      this.wrapped.invert.apply(this.wrapped, arguments as any),
      meta && typeof meta === "object" && typeof meta.invert === "function"
        ? meta.invert.apply(meta, arguments)
        : meta
    );
  }

  compose(other) {
    return new WrappedOperation(
      this.wrapped.compose(other.wrapped),
      composeMeta(this.meta, other.meta)
    );
  }

  static transform(a, b) {
    var pair = a.wrapped.transform(b.wrapped);
    return [
      new WrappedOperation(pair[0], transformMeta(a.meta, b.wrapped)),
      new WrappedOperation(pair[1], transformMeta(b.meta, a.wrapped)),
    ];
  }

  // convenience method to write transform(a, b) as a.transform(b)
  transform(other) {
    return WrappedOperation.transform(this, other);
  }
}

function transformMeta(meta, operation) {
  if (meta && typeof meta === "object") {
    if (typeof meta.transform === "function") {
      return meta.transform(operation);
    }
  }
  return meta;
}

// Copy all properties from source to target.
function copy(source, target) {
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      target[key] = source[key];
    }
  }
}

function composeMeta(a, b) {
  if (a && typeof a === "object") {
    if (typeof a.compose === "function") {
      return a.compose(b);
    }
    var meta = {};
    copy(a, meta);
    copy(b, meta);
    return meta;
  }
  return b;
}
