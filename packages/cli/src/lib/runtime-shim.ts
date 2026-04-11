/** Mock runtime for validating bundles outside the iOS app. */
export const RUNTIME_SHIM = `
  var Application = {
    scheduleRequest: function(){ return Promise.resolve([{status:200,headers:{}}, '']) },
    getDefaultUserAgent: function(){ return Promise.resolve('test') },
    getCookies: function(){ return Promise.resolve({}) },
    setCookie: function(){},
    getMaxContentRating: function(){ return Promise.resolve('adult') }
  };
  var BasicRateLimiter = function(){ this.registerInterceptor = function(){}; };
  var InterceptorManager = function(){ this.registerInterceptor = function(){}; this.interceptRequest = null; };
  var webkit = { messageHandlers: { nativeLog: { postMessage: function(){} }, nativeRequest: { postMessage: function(){} }, getCookies: { postMessage: function(){} }, setCookie: { postMessage: function(){} } } };
  var window = globalThis; window.__pendingRequests = {}; window.__pendingCookies = {};
  if (!globalThis.console) globalThis.console = { log:function(){}, warn:function(){}, error:function(){}, debug:function(){}, info:function(){} };
`;

/** Runtime shim for the playground — makes real HTTP requests via Node fetch(). */
export const PLAYGROUND_RUNTIME = `
  var Application = {
    async scheduleRequest(request) {
      const resp = await fetch(request.url, {
        method: request.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...request.headers,
        },
        body: request.body ?? undefined,
      });
      const text = await resp.text();
      return [
        { status: resp.status, headers: Object.fromEntries(resp.headers.entries()) },
        text,
      ];
    },
    async getDefaultUserAgent() {
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    },
    async getCookies(_url) { return {}; },
    setCookie(_url, _name, _value) {},
    async getMaxContentRating() { return 'adult'; },
  };
  var BasicRateLimiter = function(){ this.registerInterceptor = function(){}; };
  var InterceptorManager = function(){ this.registerInterceptor = function(){}; this.interceptRequest = null; };
  var webkit = { messageHandlers: { nativeLog: { postMessage: function(){} }, nativeRequest: { postMessage: function(){} }, getCookies: { postMessage: function(){} }, setCookie: { postMessage: function(){} } } };
  var window = globalThis; window.__pendingRequests = {}; window.__pendingCookies = {};
  if (!globalThis.console) globalThis.console = { log:function(){}, warn:function(){}, error:function(){}, debug:function(){}, info:function(){} };
`;
