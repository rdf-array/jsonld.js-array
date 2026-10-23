#!/usr/bin/env node
/**
 * A dependency-free static server for the JSON-LD-array playground.
 *
 *   npm run build && node playground/serve.js [port]
 *
 * Then open http://localhost:8080/playground/ (the port given, or 8080).
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = parseInt(process.argv[2], 10) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if(pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  const file = path.join(root, pathname);
  if(!file.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if(error) {
      response.writeHead(404, {'Content-Type': 'text/plain'});
      response.end(`Not found: ${pathname}`);
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`JSON-LD-array playground: http://localhost:${port}/playground/`);
});
