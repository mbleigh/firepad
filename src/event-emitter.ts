export function EventEmitter(allowedEvents?: string[]) {
  return class {
    eventListeners: {
      [type: string]: { callback: Function; context?: any }[];
    } = {};

    on(eventType: string, callback: Function, context?: any) {
      this.validateEventType(eventType);
      this.eventListeners[eventType] = this.eventListeners[eventType] || [];
      this.eventListeners[eventType].push({
        callback: callback,
        context,
      });
    }

    off(eventType: string, callback: Function) {
      this.validateEventType(eventType);
      this.eventListeners = this.eventListeners || {};
      var listeners = this.eventListeners[eventType] || [];
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].callback === callback) {
          listeners.splice(i, 1);
          return;
        }
      }
    }

    trigger(eventType: string, ...args: any[]) {
      for (const listener of this.eventListeners[eventType] || []) {
        listener.callback.apply(listener.context, args);
      }
    }

    private validateEventType(eventType: string) {
      if (allowedEvents && !allowedEvents.includes(eventType)) {
        throw new Error(`Unknown event "${eventType}"`);
      }
    }
  };
}
