// Bundles mcp-app/chart.ts into a single self-contained HTML file served as
// the MCP Apps ui:// resource. Run: npm run build:mcp-app (also runs on prebuild).
import { build } from "esbuild";
import fs from "node:fs";

const { outputFiles } = await build({
  entryPoints: ["mcp-app/chart.ts"],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
});

const js = outputFiles[0].text;
if (js.includes("</script>")) throw new Error("bundle contains </script>; cannot inline");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MUNDIAL·26 chart</title>
<style>
  html, body { margin: 0; }
  body {
    background: #0a150e;
    color: #edf2e8;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 16px;
    border: 1px solid #1c3325;
    border-radius: 8px;
  }
</style>
</head>
<body>
<figure id="chart" style="margin:0"></figure>
<script>${js}</script>
</body>
</html>
`;

fs.writeFileSync("assets/mcp-chart-app.html", html);
console.log(`assets/mcp-chart-app.html — ${(html.length / 1024).toFixed(0)} kB`);
