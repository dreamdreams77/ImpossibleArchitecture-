// Undo/redo over immutable Structure snapshots.
//
// Because every construction operation returns a new Structure, history is a
// stack of references. Pushing a new state after an undo discards the redo
// branch, as in any document editor.

export class History {
  constructor(initial, { limit = 200 } = {}) {
    this.limit = limit;
    this.stack = [initial];
    this.index = 0;
  }

  get current() {
    return this.stack[this.index];
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.stack.length - 1;
  }

  // Record a new state. No-op if it is the same reference as the current one.
  push(next) {
    if (next === this.current) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(next);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }

  // Replace the current state without adding a step. Used to coalesce a
  // continuous gesture, such as dragging, into one undoable change.
  replaceCurrent(next) {
    this.stack[this.index] = next;
  }

  undo() {
    if (!this.canUndo) return this.current;
    this.index -= 1;
    return this.current;
  }

  redo() {
    if (!this.canRedo) return this.current;
    this.index += 1;
    return this.current;
  }
}
