import { EventEmitter } from "./event-emitter";
import { TextOp } from "./text-op";
import { TextOperation } from "./text-operation";

export class Client extends EventEmitter() {
  state: ClientState = new Synchronized();

  setState(state) {
    this.state = state;
  }

  // Call this method when the user changes the document.
  applyClient(operation: TextOperation) {
    this.setState(this.state.applyClient(this, operation));
  }

  // Call this method with a new operation from the server
  applyServer(operation: TextOperation) {
    this.setState(this.state.applyServer(this, operation));
  }

  serverAck() {
    this.setState(this.state.serverAck(this));
  }

  serverRetry() {
    this.setState(this.state.serverRetry(this));
  }

  // Override this method.
  sendOperation(operation) {
    throw new Error("sendOperation must be defined in child class");
  }

  // Override this method.
  applyOperation(operation) {
    throw new Error("applyOperation must be defined in child class");
  }
}

interface ClientState {
  applyClient(client: Client, operation: TextOperation);
  applyServer(client: Client, operation: TextOperation);
  serverAck(client: Client);
  serverRetry(client: Client);
}

export class AwaitingConfirm implements ClientState {
  // In the 'AwaitingConfirm' state, there's one operation the client has sent
  // to the server and is still waiting for an acknowledgement.
  constructor(private outstanding: TextOperation) {
    // Save the pending operation
    this.outstanding = outstanding;
  }

  applyClient(client: Client, operation: TextOperation) {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'AwaitingWithBuffer' state
    return new AwaitingWithBuffer(this.outstanding, operation);
  }

  applyServer(client: Client, operation: TextOperation) {
    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    var pair = this.outstanding.transform(operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  }

  serverAck(client) {
    // The client's operation has been acknowledged
    // => switch to synchronized state
    return new Synchronized();
  }

  serverRetry(client) {
    client.sendOperation(this.outstanding);
    return this;
  }
}

export class AwaitingWithBuffer implements ClientState {
  // In the 'AwaitingWithBuffer' state, the client is waiting for an operation
  // to be acknowledged by the server while buffering the edits the user makes
  constructor(
    private outstanding: TextOperation,
    private buffer: TextOperation
  ) {}

  applyClient(client: Client, operation: TextOperation) {
    // Compose the user's changes onto the buffer
    var newBuffer = this.buffer.compose(operation);
    return new AwaitingWithBuffer(this.outstanding, newBuffer);
  }

  applyServer(client: Client, operation: TextOperation) {
    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    var pair1 = this.outstanding.transform(operation);
    var pair2 = this.buffer.transform(pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  }

  serverRetry(client: Client) {
    // Merge with our buffer and resend.
    var outstanding = this.outstanding.compose(this.buffer);
    client.sendOperation(outstanding);
    return new AwaitingConfirm(outstanding);
  }

  serverAck(client: Client) {
    // The pending operation has been acknowledged
    // => send buffer
    client.sendOperation(this.buffer);
    return new AwaitingConfirm(this.buffer);
  }
}

export class Synchronized implements ClientState {
  // In the 'Synchronized' state, there is no pending operation that the client
  // has sent to the server.
  constructor() {}

  applyClient(client: Client, operation: TextOperation) {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'AwaitingConfirm' state
    client.sendOperation(operation);
    return new AwaitingConfirm(operation);
  }

  applyServer(client: Client, operation: TextOperation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  }

  serverAck(client) {
    throw new Error("There is no pending operation.");
  }

  serverRetry(client) {
    throw new Error("There is no pending operation.");
  }
}
