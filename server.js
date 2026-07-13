const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const PORT = 8731;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/horizon.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("no"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file);
    const type = (ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "text/plain") + "; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}).listen(PORT, () => console.log("serving on http://localhost:" + PORT));
