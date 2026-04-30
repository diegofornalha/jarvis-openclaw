# Restauração do tema Claude no control-ui — passo a passo

Documento de incidente: como `https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json` parou de funcionar (HTTP 404) e como foi restaurado.

## Sintoma

No control-ui do OpenClaw (`https://claw-jarvis.agentesintegrados.com.br`), ao importar tema custom colando a URL self-hosted:

```
Only tweakcn.com theme links are supported.
```

Diretamente via `curl`:

```bash
curl -I https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json
# HTTP 404
```

## Diagnóstico

O fluxo da URL é:

```
GET https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json
  → cloudflared tunnel
  → http://localhost:18789  (gateway daemon do OpenClaw)
  → arquivo estático em node_modules/openclaw/dist/control-ui/assets/claude.json
```

O 404 ocorria porque:

1. O JSON canônico ficava em `/home/jarvis/tweakcn-serve/claude.json` e era proxiado por um servidor Python local (`tweakcn-serve.service`).
2. Em algum momento o diretório `/home/jarvis/tweakcn-serve/` foi removido — restou apenas o systemd service e o tunnel cloudflared órfãos.
3. Uma cópia residual sobrevivia em `node_modules/openclaw/dist/control-ui/assets/claude.json` (de uma run antiga do patcher, quando o source ainda existia).
4. Durante um cleanup, rodei `rm -rf node_modules && npm install` pra testar o postinstall — isso apagou a cópia residual.
5. O `npm install` reinstalou `openclaw` do registry, que não traz `claude.json` no tarball.

Resultado: arquivo sumiu permanentemente do sistema. Erro `Only tweakcn.com theme links are supported` é a mensagem secundária — vinha da função `lb()` no bundle do control-ui que valida URLs de import contra a allowlist `Ny`.

## Causas raiz

**Causa 1 — JSON inexistente**: arquivo source apagado, sem backup local, sem cópia versionada.

**Causa 2 — bundle sem patches**: mesmo se o JSON existisse, o bundle JS original (`index-ckUmEo1l.js`) só aceita URLs de `tweakcn.com`/`www.tweakcn.com`. O patcher que ampliava a allowlist e reescrevia o parser `lb()` tinha sido removido junto.

## Solução aplicada

### Passo 1 — Recuperar o JSON da fonte canônica

Os logs do `tweakcn-serve.service` revelaram que ele proxiava `/r/themes/claude` do `tweakcn.com` (linha `GET /r/themes/claude HTTP/1.1 200`). Baixei direto de lá:

```bash
curl -sSL -o /tmp/claude-from-tweakcn.json https://tweakcn.com/r/themes/claude
# 6128 bytes, JSON shadcn registry válido
```

### Passo 2 — Versionar o JSON no repo

Pra não depender mais de fonte externa que pode sumir:

```bash
mkdir -p assets
cp /tmp/claude-from-tweakcn.json assets/claude.json
git add assets/claude.json
```

### Passo 3 — Restaurar o patcher apontando pro repo

Recuperei o `scripts/patch-openclaw-control-ui.js` do commit `46fb940` (anterior ao revert) e mudei só uma linha:

```diff
- const themeSourcePath = "/home/jarvis/tweakcn-serve/claude.json";
+ const themeSourcePath = path.join(root, "assets/claude.json");
```

Também bumpei o `bundleVersion` (cache-bust no `?v=` do `<script>` e `<link>`) pra forçar browsers a baixarem o bundle JS/CSS patcheados em vez de servir do cache:

```diff
- const bundleVersion = "jarvis-claude-theme-20260430-csp9";
+ const bundleVersion = "jarvis-claude-theme-20260430-r2";
```

### Passo 4 — Religar o postinstall

```diff
- "postinstall": "patch-package"
+ "postinstall": "patch-package && node scripts/patch-openclaw-control-ui.js"
```

### Passo 5 — Validar end-to-end com instalação limpa

```bash
rm -rf node_modules && npm install
```

Saída esperada do postinstall:

```
patch-package 8.0.1
Applying patches...
openclaw@2026.4.24 ✔
Applied Jarvis OpenClaw control-ui tweakcn mirror patch.
```

Verificações:

```bash
# 1. JSON servido na URL pública
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json
# → 200

# 2. Allowlist Ny inclui o domínio (deve retornar 2)
grep -c "claw-jarvis.agentesintegrados.com.br" \
  node_modules/openclaw/dist/control-ui/assets/index-ckUmEo1l.js

# 3. Parser lb() reconhece /control-ui/assets/ (deve retornar 2)
grep -c "control-ui/assets/" \
  node_modules/openclaw/dist/control-ui/assets/index-ckUmEo1l.js

# 4. HTML tem cache-bust novo
grep -oE "jarvis-claude-theme-[A-Za-z0-9-]+" \
  node_modules/openclaw/dist/control-ui/index.html

# 5. Patch WA reactions não quebrou (deve retornar 3)
grep -c "jarvis-patch:wa-reactions" \
  node_modules/openclaw/dist/extensions/whatsapp/monitor-*.js
```

## O que o patcher modifica

O `scripts/patch-openclaw-control-ui.js` mexe em 4 superfícies dentro de `node_modules/openclaw/dist/control-ui/`:

### 1. JSON (`assets/claude.json`)
Cópia do `assets/claude.json` versionado no repo. Se o arquivo já existir em `node_modules`, sobrescreve; se o source não existir, lança erro com diagnóstico claro.

### 2. JS bundle (`assets/index-ckUmEo1l.js`)
- Allowlist `Ny`: adiciona `claw-jarvis.agentesintegrados.com.br`, `tweakcn.agentesintegrados.com.br` e `window.location.hostname`.
- Regex de id de tema: relaxa de `{8,128}` pra `{3,128}` chars (id `claude` tem 6).
- Parser `lb()`: reescreve pra aceitar URLs `/control-ui/assets/<id>.json` same-origin.
- Validador `fb()`: aceita redirects same-origin.
- Listas de tema (`BI`/`nR`): substitui `Knot` por `Claude` no picker.
- Aplicação de tema: força `borderRadius: 40` quando `themeId === "claude"`.
- Mapping accent: usa primary (`d`/`f`) em vez do secundário (`_`/`v`).

### 3. HTML (`index.html`)
- Adiciona `custom: 1` ao `THEMES`.
- Trata `theme === "custom"` resolvendo pra `data-theme="custom"` (dark) ou `"custom-light"` (light).
- Cache-bust `?v=<bundleVersion>` nos `<script src>` e `<link href>`.

### 4. CSS (`assets/index-D13gUwUm.css`)
Bloco delimitado por marcadores `/* jarvis-claude-theme-overrides:start/end */` (idempotente). Faz a ponte semântica entre as variáveis raw que o tweakcn injeta (`--bg`, `--text`, `--primary`, `--border`) e as variáveis que o control-ui consome (`--background`, `--accent*`, `--focus*`, `--shadow*`).

## No browser

1. Hard-refresh: **Ctrl+F5** (ou Cmd+Shift+R no Mac). O `?v=jarvis-claude-theme-20260430-r2` força o reload do bundle.
2. Settings → Themes → **Claude** já aparece como opção nativa (substituiu Knot).
3. Pra importar manualmente: cole `https://claw-jarvis.agentesintegrados.com.br/control-ui/assets/claude.json` no campo de import — agora aceito.

## Manutenção

### Atualizar o tema
Reexportar do tweakcn.com e sobrescrever `assets/claude.json`:

```bash
curl -sSL -o assets/claude.json https://tweakcn.com/r/themes/claude
git add assets/claude.json
git commit -m "chore(theme): refresh claude.json"
```

Bumpa o `bundleVersion` no script pra forçar invalidação de cache do browser.

### Re-aplicar manualmente sem reinstalar
```bash
node scripts/patch-openclaw-control-ui.js
```

Não precisa restart do gateway — ele serve estáticos do disco a cada request.

### Atualizar versão do OpenClaw
Quando subir `npm i openclaw@<nova-versão>`:
- Hashes nos nomes de arquivo (`index-ckUmEo1l.js`, `index-D13gUwUm.css`) podem mudar — patcher vai falhar com `Could not find ... in OpenClaw control-ui bundle`.
- Localizar os novos hashes em `node_modules/openclaw/dist/control-ui/assets/` e atualizar `assetPath` / `cssPath` no script.
- Padrões regex podem ter mudado se o upstream refatorou — ajustar manualmente.

## Caveat herdado

O `patches/openclaw+2026.4.24.patch` (consumido pelo `patch-package`) cobre **apenas** o hunk de WhatsApp reactions em `extensions/whatsapp/monitor-*.js`. Tentativa anterior de incluir também os hunks do bundle control-ui criava conflito com o script imperativo no postinstall (chamadas `replace` em strings já substituídas pelo patch-package).

Decisão: cada arquivo é tocado por **uma só ferramenta** —
- WA monitor → `patch-package` (mudança pequena, hunk legível)
- Control-ui (3 arquivos) → script imperativo (mudanças extensas em bundles minificados, lógica condicional)

## Histórico

```
a23cd27 feat(control-ui): patcher self-contained pra tema Claude         ← fix
2c37e38 revert(control-ui): remove patcher dependente de tweakcn-serve   ← regressão
46fb940 feat(control-ui): patcher pra tema Claude self-hosted no OpenClaw ← original quebrado
bea7493 feat(wa): enhance reaction handling with synthetic system events
93b8f49 feat(wa): inbound reactions as synthetic system events
```
