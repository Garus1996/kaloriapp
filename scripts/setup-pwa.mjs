import fs from "node:fs";
const path = "app.json";
if (!fs.existsSync(path)) throw new Error("Fant ikke app.json i prosjektmappen.");
const json = JSON.parse(fs.readFileSync(path, "utf8"));
json.expo ??= {};
json.expo.name = json.expo.name || "Kaloriapp";
json.expo.slug = "kaloriapp";
json.expo.scheme = json.expo.scheme || "kaloriapp";
json.expo.web = {
  ...(json.expo.web || {}),
  bundler: "metro",
  output: "single",
  favicon: "./public/favicon.png"
};
json.expo.experiments = { ...(json.expo.experiments || {}), baseUrl: "/kaloriapp" };
fs.writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
console.log("app.json er konfigurert for GitHub Pages /kaloriapp");
