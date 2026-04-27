# jarvis-openclaw

**Projeto consumidor NPM** que hospeda uma cópia patcheada do `openclaw` pra que o gateway daemon do Jarvis (Eduardo Rodrigues) execute código modificado em vez do código global.

## Por que existe

O canal WhatsApp do OpenClaw subscreve apenas em `messages.upsert` do Baileys — reações inbound (👍, ❤️, etc.) **não chegam ao agente**. Documentado nas issues `openclaw/openclaw#21905` e `#5114`.

A solução é um **patch local** em `node_modules/openclaw/dist/extensions/whatsapp/monitor-*.js` que adiciona subscriber em `messages.reaction` e injeta como evento sintético via `enqueueSystemEvent` (mesmo mecanismo que Slack/Mattermost usam pra eventos não-textuais).

`patch-package` exige um projeto NPM dedicado pra capturar e reaplicar o diff. Esse projeto é o `~/jarvis-openclaw/`. **Sem ele**, qualquer mudança no install global some no próximo `npm i -g openclaw`.

## Distinção dos paths confusos

| Path | Função | Conteúdo |
|---|---|---|
| `~/.openclaw-claw-jarvis/` | **State dir do gateway** | `openclaw.json` (config), sessões `agents/main/sessions/*.jsonl`, `memory/main.sqlite`, `cron/`, `delivery-queue/`, `credentials/`, `media/`. **Não tem código.** |
| `~/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/` | **Código global** (instalado via `npm i -g openclaw`) | `dist/index.js`, `dist/extensions/whatsapp/`, etc. **Sem patch.** Continua sendo usado pelo CLI `openclaw message send`. |
| `~/jarvis-openclaw/` (este dir) | **Código patcheado** | `package.json` + `node_modules/openclaw/` + `patches/`. ExecStart da systemd unit aponta pra cá. |

Os dois primeiros são preexistentes e não foram modificados. Esse aqui é novo.

## Estrutura

```
~/jarvis-openclaw/
├── package.json              # deps: openclaw@2026.4.24 (versão EXATA), patch-package, postinstall-postinstall
├── package-lock.json
├── patches/
│   └── openclaw+2026.4.24.patch    # diff do monitor-*.js capturado por patch-package
├── node_modules/
│   └── openclaw/             # código que o gateway daemon executa
│       └── dist/extensions/whatsapp/monitor-*.js   # arquivo patcheado
└── .git/                     # repo local — patches/ é versionado pra não perder
```

## Como o patch é aplicado

`package.json` declara hook `postinstall: patch-package`. Toda vez que `npm install` rodar (inclusive depois de `rm -rf node_modules`), `patch-package` reaplica os diffs em `patches/` em cima do `node_modules/openclaw/` recém-baixado.

**Sentinela em runtime:** o patch insere `console.info("[jarvis-patch:wa-reactions] subscription installed", new Date().toISOString())` no startup do gateway. Verificar com:

```bash
journalctl --user -u openclaw-gateway-claw-jarvis.service --since "5 minutes ago" \
  | grep "jarvis-patch:wa-reactions"
```

Se a linha **não** aparecer após o gateway iniciar, o patch falhou silenciosamente. Inspecionar `node_modules/openclaw/dist/extensions/whatsapp/monitor-*.js` em busca da string `jarvis-patch`.

## Como o gateway encontra esse código

A systemd user unit `openclaw-gateway-claw-jarvis.service` foi modificada de:

```ini
ExecStart=/home/jarvis/.nvm/versions/node/v22.22.2/bin/node \
  /home/jarvis/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/dist/index.js \
  gateway --port 18789
```

Para:

```ini
ExecStart=/home/jarvis/.nvm/versions/node/v22.22.2/bin/node \
  /home/jarvis/jarvis-openclaw/node_modules/openclaw/dist/index.js \
  gateway --port 18789
WorkingDirectory=/home/jarvis/jarvis-openclaw
```

(Backup do unit original em `~/.config/systemd/user/openclaw-gateway-claw-jarvis.service.bak-pre-patch-<data>`.)

O CLI `openclaw` continua usando a instalação global — só o **gateway daemon** usa este código local. Vantagens:
- CLI atualizável independente
- Blast radius do patch limitado ao gateway
- Skill `openclaw-jarvis-whatsapp-send` continua funcionando sem modificação

## Como atualizar o OpenClaw no futuro

1. **Mudar versão**: `npm i openclaw@<nova-versão>` em `~/jarvis-openclaw/`.
2. **Tentar reaplicar**: o `postinstall: patch-package` roda automaticamente.
   - **Sucesso silencioso** → reload o gateway e validar sentinela.
   - **Falha em vermelho** → patch precisa de rebase manual:
     ```bash
     # 1. Localizar o novo arquivo (hash mudou)
     grep -rln '"messages.upsert"' node_modules/openclaw/dist/extensions/whatsapp/
     # 2. Reaplicar a edição manualmente nesse arquivo (ver patches/openclaw+2026.4.24.patch como referência)
     # 3. Recapturar
     rm patches/openclaw+*.patch
     npx patch-package openclaw
     git add patches/ package.json package-lock.json
     git commit -m "rebase patch for openclaw v<nova-versão>"
     ```
3. **Restart o gateway**: `systemctl --user restart openclaw-gateway-claw-jarvis.service`.
4. **Validar sentinela** no journal.

## Como reverter

Se algo quebrar:

```bash
# 1. Restaurar systemd unit pro install global
cp ~/.config/systemd/user/openclaw-gateway-claw-jarvis.service.bak-pre-patch-* \
   ~/.config/systemd/user/openclaw-gateway-claw-jarvis.service
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway-claw-jarvis.service
```

Sistema volta ao estado anterior em ~30s. O dir `~/jarvis-openclaw/` permanece pra debug ou re-aplicação.

## Quando remover esse projeto inteiro

Quando o upstream OpenClaw landar uma das issues `#21905` (`channels.whatsapp.reactionNotifications`) ou `#5114` (subscrever `messages.reaction` nativamente):

1. Atualizar `npm i -g openclaw@latest` (instalação global volta a ser suficiente).
2. Configurar nativamente no `~/.openclaw-claw-jarvis/openclaw.json`: `channels.whatsapp.reactionNotifications: "all"`.
3. Reverter systemd unit pro path global (mesmo `cp ... .bak-pre-patch-*` da seção Reverter).
4. `rm -rf ~/jarvis-openclaw/` (depois de confirmar que tudo continua funcionando).

## Sobre o uso de `patch-package` em pacote tão grande quanto `openclaw`

`openclaw` é um pacote que muda quase diariamente (releases datadas `vYYYY.M.D`). Patches contra ele têm risco maior de conflito a cada update do que patches contra pacotes pequenos isolados. Mitigações:

- **Versão EXATA travada** no package.json (`openclaw@2026.4.24`, não `^` nem `latest`). Update é sempre intencional.
- **Sentinela de log** detecta na hora se patch não pegou.
- **Hash no nome do arquivo** (`monitor-BifLJ1dl.js`) muda em rebuilds — patch-package falha logo, melhor que falha silenciosa.

Se a frequência de rebases doer, a alternativa é forkar `openclaw/openclaw` no GitHub e manter um build próprio. Mais pesado, considerado se o patch crescer pra mais de uma feature.
