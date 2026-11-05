"use strict";

function createStore(initial) {
  let state = initial;
  const listeners = [];
  return {
    getState: () => state,
    setState(next) {
      state = next;
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener) => listeners.push(listener)
  };
}

// A quantity control bound to a store. render() returns what the screen would show.
function createQuantityControl(store) {
  const snapshot = store.getState();
  return {
    increment() {
      store.setState({ ...snapshot, count: snapshot.count + 1 });
    },
    render() {
      return `Qty: ${store.getState().count}`;
    }
  };
}

module.exports = { createStore, createQuantityControl };
