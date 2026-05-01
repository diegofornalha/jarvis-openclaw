const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assetPath = path.join(
  root,
  "node_modules/openclaw/dist/control-ui/assets/index-ckUmEo1l.js",
);
const htmlPath = path.join(root, "node_modules/openclaw/dist/control-ui/index.html");
const cssPath = path.join(root, "node_modules/openclaw/dist/control-ui/assets/index-D13gUwUm.css");
const themeSourcePath = path.join(root, "assets/claude.json");
const bundledThemePath = path.join(root, "node_modules/openclaw/dist/control-ui/assets/claude.json");
const themeUrl = "https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json";
const bundleVersion = "jarvis-claude-theme-20260430-light";

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source;
}

function patchAsset() {
  let source = fs.readFileSync(assetPath, "utf8");

  const allowlistPattern = /var Ny=new Set\(\[[^\]]*?\]\)/;
  if (!allowlistPattern.test(source)) {
    throw new Error("Could not find tweakcn host allowlist in OpenClaw control-ui bundle.");
  }
  source = source.replace(
    allowlistPattern,
    "var Ny=new Set([`tweakcn.com`,`www.tweakcn.com`,`tweakcn.agentesintegrados.com.br`,`claw-jarvis.agentesintegrados.com.br`,window.location.hostname])",
  );
  source = source.replace(
    "Py=/^[A-Za-z0-9_-]{8,128}$/",
    "Py=/^[A-Za-z0-9_-]{3,128}$/",
  );

  const start = "function lb(e){let t=m(e);if(!t)throw Error(`Paste a tweakcn theme link to import.`);";
  const end = "}function ub(e){";
  const startIndex = source.indexOf(start);
  if (startIndex === -1) {
    throw new Error("Could not find tweakcn import parser start in OpenClaw control-ui bundle.");
  }
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex === -1) {
    throw new Error("Could not find tweakcn import parser end in OpenClaw control-ui bundle.");
  }

  const parser =
    "function lb(e){let t=m(e);if(!t)throw Error(`Paste a tweakcn theme link to import.`);let n;try{n=new URL(t,window.location.origin)}catch{throw Error(`Paste a full tweakcn URL.`)}let r=n.pathname.match(/^\\/(?:r\\/)?themes\\/([A-Za-z0-9_-]{3,128})(?:\\.json)?\\/?$/),i=n.pathname.match(/^\\/([A-Za-z0-9_-]{3,128})(?:\\.json)?\\/?$/),a=n.pathname.match(/^\\/control-ui\\/(?:assets\\/)?([A-Za-z0-9_-]{3,128})\\.json\\/?$/);if(r||i||a){let e=(r??i??a)[1];return{themeId:e,sourceUrl:n.href,fetchUrl:`/control-ui/assets/${e}.json`}}if(!Ny.has(n.hostname))throw Error(`Unsupported tweakcn link. Paste a theme URL ending in claude.json.`);let o=$y(n.pathname);return{themeId:o,sourceUrl:n.href,fetchUrl:`/control-ui/assets/${o}.json`}}";

  source =
    source.slice(0, startIndex) +
    parser +
    "function ub(e){" +
    source.slice(endIndex + end.length);

  source = replaceIfPresent(
    source,
    "var BI=[{id:`claw`,label:`Claw`},{id:`knot`,label:`Knot`},{id:`dash`,label:`Dash`}]",
    "var BI=[{id:`claw`,label:`Claw`},{id:`custom`,label:`Claude`},{id:`dash`,label:`Dash`}]",
  );
  source = replaceIfPresent(
    source,
    "var nR=[{id:`claw`,label:`Claw`,description:`Chroma family`,icon:K.zap},{id:`knot`,label:`Knot`,description:`Black & red`,icon:K.link},{id:`dash`,label:`Dash`,description:`Chocolate blueprint`,icon:K.barChart}]",
    "var nR=[{id:`claw`,label:`Claw`,description:`Chroma family`,icon:K.zap},{id:`custom`,label:`Claude`,description:`Seu tema Claude importado do tweakcn`,icon:K.spark},{id:`dash`,label:`Dash`,description:`Chocolate blueprint`,icon:K.barChart}]",
  );
  source = replaceIfPresent(
    source,
    "function $I(e){let t=[...BI,{id:`custom`,label:`Custom`}];return s`",
    "function $I(e){let t=BI;return s`",
  );
  source = replaceIfPresent(
    source,
    "${[...nR,{id:`custom`,label:`Custom`,description:e.hasCustomTheme?`Imported from tweakcn${e.customThemeLabel?`: ${e.customThemeLabel}`:``}`:`Open the tweakcn importer for this browser-local slot`,icon:K.spark}].map(t=>s`",
    "${nR.map(t=>s`",
  );
  const importOpenPattern =
    /openCustomThemeImport\(\)\{this\.customThemeImportExpanded=!0(?:,this\.customThemeImportUrl\|\|\(this\.customThemeImportUrl=`[^`]+`\))?,this\.customThemeImportFocusToken\+=1\}/;
  if (!importOpenPattern.test(source)) {
    throw new Error("Could not find custom theme import opener in OpenClaw control-ui bundle.");
  }
  source = source.replace(
    importOpenPattern,
    `openCustomThemeImport(){this.customThemeImportExpanded=!0,this.customThemeImportUrl||(this.customThemeImportUrl=\`${themeUrl}\`),this.customThemeImportFocusToken+=1}`,
  );

  const importApplyPattern =
    /JM\(this,\{\.\.\.this\.settings(?:,borderRadius:[^,}]+)?,customTheme:e\}\)/;
  if (!importApplyPattern.test(source)) {
    throw new Error("Could not find custom theme settings application in OpenClaw control-ui bundle.");
  }
  source = source.replace(
    importApplyPattern,
    "JM(this,{...this.settings,borderRadius:e.themeId===`claude`?40:this.settings.borderRadius,customTheme:e})",
  );

  const loadRadiusPattern =
    /borderRadius:(?:f===`custom`&&d\?\.themeId===`claude`\?40:)?typeof s\.borderRadius==`number`&&s\.borderRadius>=0&&s\.borderRadius<=100\?Gb\(s\.borderRadius\):i\.borderRadius,customTheme:d\?\?void 0/;
  if (!loadRadiusPattern.test(source)) {
    throw new Error("Could not find settings border radius loader in OpenClaw control-ui bundle.");
  }
  source = source.replace(
    loadRadiusPattern,
    "borderRadius:f===`custom`&&d?.themeId===`claude`?40:typeof s.borderRadius==`number`&&s.borderRadius>=0&&s.borderRadius<=100?Gb(s.borderRadius):i.borderRadius,customTheme:d??void 0",
  );

  const redirectCheckPattern =
    /function fb\(e\)\{if\(!e\)return;let t;try\{t=new URL\(e(?:,window\.location\.origin)?\)\}catch\{throw Error\(`Unexpected tweakcn import response URL\.`\)\}(?:if\(t\.origin===window\.location\.origin&&t\.pathname\.startsWith\(`\/control-ui\/assets\/`\)\)return;)?if\(t\.protocol!==`https:`\|\|!Ny\.has\(t\.hostname\)\)throw Error\(`Unexpected redirect during tweakcn import\.`\)\}/;
  if (!redirectCheckPattern.test(source)) {
    throw new Error("Could not find tweakcn redirect validator in OpenClaw control-ui bundle.");
  }
  source = source.replace(
    redirectCheckPattern,
    "function fb(e){if(!e)return;let t;try{t=new URL(e,window.location.origin)}catch{throw Error(`Unexpected tweakcn import response URL.`)}if(t.origin===window.location.origin&&t.pathname.startsWith(`/control-ui/assets/`))return;if(t.protocol!==`https:`||!Ny.has(t.hostname))throw Error(`Unexpected redirect during tweakcn import.`)}",
  );

  const oldAccentMapping = "[`accent`,_],[`accent-hover`,`color-mix(in srgb, var(--accent) 82%, ${i} 18%)`],[`accent-muted`,_],[`accent-subtle`,`color-mix(in srgb, var(--accent) ${r?`10`:`16`}%, transparent)`],[`accent-foreground`,v],[`accent-glow`,`color-mix(in srgb, var(--accent) ${r?`18`:`30`}%, transparent)`],[`primary`,d]";
  const newAccentMapping = "[`accent`,d],[`accent-hover`,`color-mix(in srgb, var(--accent) 82%, ${i} 18%)`],[`accent-muted`,d],[`accent-subtle`,`color-mix(in srgb, var(--accent) ${r?`10`:`16`}%, transparent)`],[`accent-foreground`,f],[`accent-glow`,`color-mix(in srgb, var(--accent) ${r?`18`:`30`}%, transparent)`],[`primary`,d]";
  if (!source.includes(oldAccentMapping) && !source.includes(newAccentMapping)) {
    throw new Error("Could not find custom theme accent mapping in OpenClaw control-ui bundle.");
  }
  source = replaceIfPresent(source, oldAccentMapping, newAccentMapping);

  fs.writeFileSync(assetPath, source);
}

function patchHtml() {
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(
    "var THEMES = { claw: 1, knot: 1, dash: 1 };",
    "var THEMES = { claw: 1, knot: 1, dash: 1, custom: 1 };",
  );
  // Tema Claude é canonicamente CLARO. Força "custom-light" independente
  // do modo global (light/dark) selecionado pelo usuário. Idempotente:
  // detecta tanto a forma pristine quanto a forma patcheada (com ramo
  // condicional dark/light) de versões anteriores do patcher.
  const customAlwaysLight =
    'theme === "custom"\n              ? "custom-light"\n              : theme === "knot"\n                ? mode === "light"';
  const patchedDarkLight =
    'theme === "custom"\n              ? mode === "light"\n                ? "custom-light"\n                : "custom"\n              : theme === "knot"\n                ? mode === "light"';
  const pristineKnot = 'theme === "knot"\n              ? mode === "light"';
  if (html.includes(customAlwaysLight)) {
    // já no estado desejado, no-op
  } else if (html.includes(patchedDarkLight)) {
    html = html.replace(patchedDarkLight, customAlwaysLight);
  } else if (html.includes(pristineKnot)) {
    html = html.replace(pristineKnot, customAlwaysLight);
  } else {
    throw new Error("Could not find theme resolver branch in OpenClaw control-ui index.html.");
  }
  html = html.replace(
    /\.\/assets\/index-ckUmEo1l\.js(?:\?v=[^"]*)?/,
    `./assets/index-ckUmEo1l.js?v=${bundleVersion}`,
  );
  html = html.replace(
    /\.\/assets\/index-D13gUwUm\.css(?:\?v=[^"]*)?/,
    `./assets/index-D13gUwUm.css?v=${bundleVersion}`,
  );
  fs.writeFileSync(htmlPath, html);
}

function patchCss() {
  let css = fs.readFileSync(cssPath, "utf8");
  css = css.replace("letter-spacing:-.01em", "letter-spacing:0");

  const markerStart = "/* jarvis-claude-theme-overrides:start */";
  const markerEnd = "/* jarvis-claude-theme-overrides:end */";
  const overrides = `${markerStart}
:root[data-theme="custom"],
:root[data-theme="custom-light"] {
  --background: var(--bg);
  --foreground: var(--text);
  --color-background: var(--bg);
  --color-foreground: var(--text);
  --ring: var(--primary);
  --accent: var(--primary);
  --accent-hover: color-mix(in srgb, var(--primary) 82%, var(--primary-foreground) 18%);
  --accent-muted: var(--primary);
  --accent-subtle: color-mix(in srgb, var(--primary) 12%, transparent);
  --accent-foreground: var(--primary-foreground);
  --accent-glow: color-mix(in srgb, var(--primary) 24%, transparent);
  --focus: color-mix(in srgb, var(--primary) 14%, transparent);
  --focus-ring: 0 0 0 2px var(--bg), 0 0 0 3px color-mix(in srgb, var(--primary) 70%, transparent);
  --focus-glow: 0 0 0 2px var(--bg), 0 0 0 3px var(--primary), 0 0 16px var(--accent-glow);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
}
:root[data-theme="custom"] .dreams__bubble,
:root[data-theme="custom-light"] .dreams__bubble,
:root[data-theme="custom"] .dreams__bubble-dot,
:root[data-theme="custom-light"] .dreams__bubble-dot {
  border-color: color-mix(in srgb, var(--primary) 18%, transparent);
}
:root[data-theme="custom-light"] {
  --bg-muted: color-mix(in srgb, var(--bg) 90%, var(--border) 10%) !important;
  --bg-hover: color-mix(in srgb, var(--bg) 84%, var(--border) 16%) !important;
  --panel-hover: color-mix(in srgb, var(--bg) 88%, var(--border) 12%) !important;
  --secondary: color-mix(in srgb, var(--bg) 86%, var(--border) 14%) !important;
  --bg-content: color-mix(in srgb, var(--bg) 94%, var(--border) 6%) !important;
}
${markerEnd}`;

  const start = css.indexOf(markerStart);
  const end = css.indexOf(markerEnd);
  if (start !== -1 && end !== -1 && end >= start) {
    css = `${css.slice(0, start)}${overrides}${css.slice(end + markerEnd.length)}`;
  } else {
    css = `${css}\n${overrides}\n`;
  }

  fs.writeFileSync(cssPath, css);
}

function copyBundledTheme() {
  if (fs.existsSync(themeSourcePath)) {
    fs.copyFileSync(themeSourcePath, bundledThemePath);
    return;
  }
  if (!fs.existsSync(bundledThemePath)) {
    throw new Error(`Missing Claude theme JSON at ${themeSourcePath}`);
  }
}

copyBundledTheme();
patchAsset();
patchHtml();
patchCss();
console.log("Applied Jarvis OpenClaw control-ui tweakcn mirror patch.");
