import { EventEmitter } from "./event-emitter";
import { TextOperation } from "./text-operation";
import { assert, debug, log } from "./utils";
import type firebase from "firebase";

const SERVER_TIMESTAMP = { ".sv": "timestamp" };

// Save a checkpoint every 100 edits.
var CHECKPOINT_FREQUENCY = 100;

export class FirebaseAdapter extends EventEmitter([
  "ready",
  "cursor",
  "operation",
  "ack",
  "retry",
]) {
  ready: boolean = false;

  private firebaseCallbacks: {
    ref: firebase.database.Reference | firebase.database.Query;
    eventType: firebase.database.EventType;
    callback: (a: firebase.database.DataSnapshot, b?: string | null) => any;
    context: any;
  }[] = [];

  private zombie: boolean = false;
  // We store the current document state as a TextOperation so we can write checkpoints to Firebase occasionally.
  // TODO: Consider more efficient ways to do this. (composing text operations is ~linear in the length of the document).
  private document?: TextOperation = new TextOperation();
  // The next expected revision.
  private revision: number = 0;
  private checkpointrevision?: number;
  // This is used for two purposes:
  // 1) On initialization, we fill this with the latest checkpoint and any subsequent operations and then
  //      process them all together.
  // 2) If we ever receive revisions out-of-order (e.g. rev 5 before rev 4), we queue them here until it's time
  //    for them to be handled. [this should never happen with well-behaved clients; but if it /does/ happen we want
  //    to handle it gracefully.]
  private pendingReceivedRevisions: any = {};

  private userId?: string;
  private userColor: string | null = null;
  private userRef?: firebase.database.Reference;
  private cursor: { position: number; selectionEnd: number } | null = null;
  private sent: { id: string; op: any } | null = null;

  constructor(
    private ref: firebase.database.Reference,
    userId?: string,
    userColor?: string
  ) {
    super();
    if (userId) {
      this.setUserId(userId);
      this.setColor(userColor!);

      const connectedRef = ref.root.child(".info/connected");

      this.firebaseOn(
        connectedRef,
        "value",
        (snapshot) => {
          if (snapshot.val() === true) {
            this.initializeUserData();
          }
        },
        this
      );

      // Once we're initialized, start tracking users' cursors.
      this.on("ready", () => {
        this.monitorCursors();
      });
    } else {
      this.setUserId(ref.push().key!);
    }

    // Avoid triggering any events until our callers have had a chance to attach their listeners.
    setTimeout(() => {
      this.monitorHistory();
    }, 0);
  }

  dispose() {
    this.removefirebaseCallbacks();
    this.handleInitialRevisions = () => {};

    if (!this.ready) {
      this.on("ready", () => {
        this.dispose();
      });
      return;
    }

    if (this.userRef) {
      this.userRef.child("cursor").remove();
      this.userRef.child("color").remove();
    }

    (this.ref as any) = null;
    this.document = undefined;
    this.zombie = true;
  }

  setUserId(userId: string) {
    if (this.userRef) {
      // Clean up existing data.  Avoid nuking another user's data
      // (if a future user takes our old name).
      this.userRef.child("cursor").remove();
      this.userRef.child("cursor").onDisconnect().cancel();
      this.userRef.child("color").remove();
      this.userRef.child("color").onDisconnect().cancel();
    }

    this.userId = userId;
    this.userRef = this.ref.child("users").child(userId);

    this.initializeUserData();
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  isHistoryEmpty(): boolean {
    assert(this.ready, "Not ready yet.");
    return this.revision === 0;
  }

  /*
   * Send operation, retrying on connection failure. Takes an optional callback with signature:
   * function(error, committed).
   * An exception will be thrown on transaction failure, which should only happen on
   * catastrophic failure like a security rule violation.
   */
  sendOperation(operation: any, callback?: Function) {
    // If we're not ready yet, do nothing right now, and trigger a retry when we're ready.
    if (!this.ready) {
      this.on("ready", () => {
        this.trigger("retry");
      });
      return;
    }

    debug(this.document, operation);
    // Sanity check that this operation is valid.
    assert(
      this.document?.targetLength === operation.baseLength,
      "sendOperation() called with invalid operation."
    );

    // Convert revision into an id that will sort properly lexicographically.
    var revisionId = revisionToId(this.revision);

    const doTransaction = (revisionId, revisionData) => {
      this.ref
        .child("history")
        .child(revisionId)
        .transaction(
          (current) => {
            if (current === null) {
              return revisionData;
            }
          },
          (error, committed, snapshot) => {
            if (error) {
              if (error.message === "disconnect") {
                if (this.sent && this.sent.id === revisionId) {
                  // We haven't seen our transaction succeed or fail.  Send it again.
                  setTimeout(function () {
                    doTransaction(revisionId, revisionData);
                  }, 0);
                } else if (callback) {
                  callback(error, false);
                }
              } else {
                log("Transaction failure!", error);
                throw error;
              }
            } else {
              if (callback) callback(null, committed);
            }
          },
          /*applyLocally=*/ false
        );
    };

    this.sent = { id: revisionId, op: operation };
    doTransaction(revisionId, {
      a: this.userId,
      o: operation.toJSON(),
      t: SERVER_TIMESTAMP,
    });
  }

  sendCursor(obj: { position: number; selectionEnd: number } | null) {
    this.userRef!.child("cursor").set(obj);
    this.cursor = obj;
  }

  setColor(color: string | null) {
    this.userRef!.child("color").set(color);
    this.userColor = color;
  }

  getDocument() {
    return this.document;
  }

  registerCallbacks(callbacks: { [type: string]: Function }) {
    for (var eventType in callbacks) {
      this.on(eventType, callbacks[eventType]);
    }
  }

  private initializeUserData() {
    this.userRef!.child("cursor").onDisconnect().remove();
    this.userRef!.child("color").onDisconnect().remove();

    this.sendCursor(this.cursor || null);
    this.setColor(this.userColor || null);
  }

  private monitorCursors() {
    var usersRef = this.ref.child("users");

    const childChanged = (childSnap) => {
      var userId = childSnap.key;
      var userData = childSnap.val();
      this.trigger("cursor", userId, userData.cursor, userData.color);
    };

    this.firebaseOn(usersRef, "child_added", childChanged);
    this.firebaseOn(usersRef, "child_changed", childChanged);

    this.firebaseOn(usersRef, "child_removed", (childSnap) => {
      var userId = childSnap.key;
      this.trigger("cursor", userId, null);
    });
  }

  monitorHistory() {
    // Get the latest checkpoint as a starting point so we don't have to re-play entire history.
    this.ref.child("checkpoint").once("value", (s) => {
      if (this.zombie) {
        return;
      } // just in case we were cleaned up before we got the checkpoint data.
      var revisionId = s.child("id").val(),
        op = s.child("o").val(),
        author = s.child("a").val();
      if (op != null && revisionId != null && author !== null) {
        this.pendingReceivedRevisions[revisionId] = { o: op, a: author };
        this.checkpointrevision = revisionFromId(revisionId);
        this.monitorHistoryStartingAt(this.checkpointrevision + 1);
      } else {
        debug("no history found, starting from scratch");
        this.checkpointrevision = 0;
        this.monitorHistoryStartingAt(this.checkpointrevision);
      }
    });
  }

  monitorHistoryStartingAt(revision: number) {
    var historyRef = this.ref
      .child("history")
      .startAt(null, revisionToId(revision));

    setTimeout(() => {
      this.firebaseOn(historyRef, "child_added", (revisionSnapshot) => {
        var revisionId = revisionSnapshot.key;
        this.pendingReceivedRevisions[revisionId!] = revisionSnapshot.val();
        if (this.ready) {
          this.handlePendingReceivedRevisions();
        }
      });

      historyRef.once("value", (snap) => {
        debug("history value:", snap.val());

        this.handleInitialRevisions();
      });
    }, 0);
  }

  handleInitialRevisions() {
    assert(!this.ready, "Should not be called multiple times.");

    // Compose the checkpoint and all subsequent revisions into a single operation to apply at once.
    this.revision = this.checkpointrevision!;
    let revisionId = revisionToId(this.revision),
      pending = this.pendingReceivedRevisions;
    while (pending[revisionId] != null) {
      var revision = this.parserevision(pending[revisionId]);
      if (!revision) {
        // If a misbehaved client adds a bad operation, just ignore it.
        log(
          "Invalid operation.",
          this.ref.toString(),
          revisionId,
          pending[revisionId]
        );
      } else {
        this.document = this.document!.compose(revision.operation!);
      }

      delete pending[revisionId];
      this.revision++;
      revisionId = revisionToId(this.revision);
    }

    debug("triggering operation:", this.document);
    this.trigger("operation", this.document);

    this.ready = true;

    setTimeout(() => {
      this.trigger("ready");
    }, 0);
  }

  handlePendingReceivedRevisions() {
    var pending = this.pendingReceivedRevisions;
    var revisionId = revisionToId(this.revision);
    var triggerRetry = false;
    while (pending[revisionId] != null) {
      this.revision++;

      var revision = this.parserevision(pending[revisionId]);
      if (!revision) {
        // If a misbehaved client adds a bad operation, just ignore it.
        log(
          "Invalid operation.",
          this.ref.toString(),
          revisionId,
          pending[revisionId]
        );
      } else {
        this.document = this.document!.compose(revision.operation!);
        if (this.sent && revisionId === this.sent.id) {
          // We have an outstanding change at this revision id.
          if (
            this.sent.op.equals(revision.operation) &&
            revision.author === this.userId
          ) {
            // This is our change; it succeeded.
            if (this.revision % CHECKPOINT_FREQUENCY === 0) {
              this.saveCheckpoint();
            }
            this.sent = null;
            this.trigger("ack");
          } else {
            // our op failed.  Trigger a retry after we're done catching up on any incoming ops.
            triggerRetry = true;
            this.trigger("operation", revision.operation);
          }
        } else {
          this.trigger("operation", revision.operation);
        }
      }
      delete pending[revisionId];

      revisionId = revisionToId(this.revision);
    }

    if (triggerRetry) {
      this.sent = null;
      this.trigger("retry");
    }
  }

  parserevision(data) {
    // We could do some of this validation via security rules.  But it's nice to be robust, just in case.
    if (typeof data !== "object") {
      return null;
    }
    if (typeof data.a !== "string" || typeof data.o !== "object") {
      return null;
    }
    let op: TextOperation | null = null;
    try {
      op = TextOperation.fromJSON(data.o);
    } catch (e) {
      return null;
    }

    if (op.baseLength !== this.document!.targetLength) {
      return null;
    }
    return { author: data.a, operation: op };
  }

  saveCheckpoint() {
    this.ref.child("checkpoint").set({
      a: this.userId,
      o: this.document!.toJSON(),
      id: revisionToId(this.revision - 1), // use the id for the revision we just wrote.
    });
  }

  firebaseOn(
    ref: firebase.database.Reference | firebase.database.Query,
    eventType: firebase.database.EventType,
    callback: (a: firebase.database.DataSnapshot, b?: string | null) => any,
    context?: any
  ) {
    this.firebaseCallbacks.push({
      ref,
      eventType: eventType,
      callback: callback,
      context: context,
    });
    ref.on(eventType, callback, context);
    return callback;
  }

  firebaseOff(
    ref: firebase.database.Reference | firebase.database.Query,
    eventType: firebase.database.EventType,
    callback: (a: firebase.database.DataSnapshot, b?: string | null) => any,
    context: any
  ) {
    ref.off(eventType, callback, context);
    for (var i = 0; i < this.firebaseCallbacks.length; i++) {
      var l = this.firebaseCallbacks[i];
      if (
        l.ref === ref &&
        l.eventType === eventType &&
        l.callback === callback &&
        l.context === context
      ) {
        this.firebaseCallbacks.splice(i, 1);
        break;
      }
    }
  }

  removefirebaseCallbacks() {
    for (var i = 0; i < this.firebaseCallbacks.length; i++) {
      var l = this.firebaseCallbacks[i];
      l.ref.off(l.eventType, l.callback, l.context);
    }
    this.firebaseCallbacks = [];
  }
}

// Based off ideas from http://www.zanopha.com/docs/elen.pdf
const characters =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function revisionToId(revision) {
  if (revision === 0) {
    return "A0";
  }

  var str = "";
  while (revision > 0) {
    var digit = revision % characters.length;
    str = characters[digit] + str;
    revision -= digit;
    revision /= characters.length;
  }

  // Prefix with length (starting at 'A' for length 1) to ensure the id's sort lexicographically.
  var prefix = characters[str.length + 9];
  return prefix + str;
}

function revisionFromId(revisionId) {
  assert(
    revisionId.length > 0 &&
      revisionId[0] === characters[revisionId.length + 8],
    `Can't construct revision from id "${revisionId}"`
  );
  var revision = 0;
  for (var i = 1; i < revisionId.length; i++) {
    revision *= characters.length;
    revision += characters.indexOf(revisionId[i]);
  }
  return revision;
}
