/* Renderer-specific transports live here; application code sees only viperHost. */
(() => {
  let nextId = 0;
  const pending = new Map();
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function connect() {
    if (window.pywebview && window.pywebview.api) {
      resolveReady(message => window.pywebview.api.post_message(message));
    } else if (window.webkit && window.webkit.messageHandlers.viper) {
      resolveReady(message => window.webkit.messageHandlers.viper.postMessage(JSON.stringify(message)));
    }
  }
  window.addEventListener('pywebviewready', connect);
  window.viperHost = {
    async request(command, payload = {}) {
      const transport = await ready;
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('The desktop host did not respond.'));
        }, 300000);
        pending.set(id, {resolve, reject, timer});
        try {
          Promise.resolve(transport({id, command, payload})).catch(error => {
            clearTimeout(timer); pending.delete(id); reject(error);
          });
        } catch (error) {
          clearTimeout(timer); pending.delete(id); reject(error);
        }
      });
    },
    receive(message) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    }
  };
  connect();
})();
