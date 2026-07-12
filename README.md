# JSONSpecs Node Server

Минимальный snapshot-only HTTP validation service на Node.js для запуска готового `jsonspecs` snapshot.

Сервис:

- загружает `snapshot.json` при старте;
- проверяет snapshot через `jsonspecs.compileSnapshot()`;
- поднимает `POST /v1/validate`;
- принимает `context` и `payload`;
- возвращает transport-safe runtime result движка;
- по явному запросу возвращает безопасный `basic` trace.

Без UI, без hot reload, без чтения исходных правил, без генерации документации.

## Требования

- Node.js 20+
- npm

## Установка

Для локальной разработки рядом должен быть checkout `../jsonspecs`, потому что исходный `package.json` использует sibling dependency:

```bash
git clone https://github.com/catindev/jsonspecs.git
git clone https://github.com/catindev/jsonspecs-node-server.git
cd jsonspecs-node-server
npm install
```

Для standalone/deploy checkout можно материализовать pinned engine из npm:

```bash
npm run deps:registry
npm ci
```

Версия движка зафиксирована в `package.json`:

```json
{
  "config": {
    "jsonspecsVersion": "2.1.1",
    "jsonspecsGitRef": "v2.1.1"
  }
}
```

## Snapshot

Сервис работает только с готовым snapshot, собранным заранее через `jsonspecs-cli build`.

Здесь не происходит:

- компиляции rules project из `rules/`;
- чтения `manifest.json`;
- загрузки исходных правил из репозитория правил;
- rebuild при изменениях файлов.

По умолчанию используется встроенный `./snapshot.json`. Другой snapshot можно подключить через `SNAPSHOT_PATH`:

```bash
SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

Snapshot должен иметь нормативную форму:

```json
{
  "format": "jsonspecs-snapshot",
  "formatVersion": 1,
  "sourceHash": "...",
  "engine": { "minVersion": "2.1.1" },
  "artifacts": [],
  "meta": {
    "projectId": "nominal-beneficiaries-rules",
    "projectTitle": "Бенефициары ном. счетов (FL_RESIDENT)",
    "rulesetVersion": "1.0.0"
  }
}
```

При старте сервер проверяет формат, hash и engine compatibility через `compileSnapshot()`. Если snapshot невалиден, процесс не стартует.

## Запуск

```bash
npm start
```

С другим snapshot:

```bash
SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

С другим портом:

```bash
PORT=3100 SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

## Docker и Coolify

Репозиторий содержит production Dockerfile. Во время сборки он материализует точную версию `jsonspecs` из npm и сохраняет sibling-layout внутри образа.

Локальная сборка и запуск:

```bash
docker build -t jsonspecs-node-server .
docker run --rm -p 3000:3000 jsonspecs-node-server
```

Для Coolify:

- source: Public Repository;
- branch: `main`;
- build pack: Dockerfile;
- port: `3000`;
- healthcheck path: `/health`.

Встроенный `snapshot.json` используется по умолчанию. Если нужен внешний snapshot, передай `SNAPSHOT_PATH`.

## Endpoint

### POST `/v1/validate`

Request:

```json
{
  "context": {
    "pipelineId": "entrypoints.fl_resident.full_validation",
    "currentDate": "2026-03-29"
  },
  "payload": {
    "beneficiary": {
      "inn": "1234567890470"
    }
  }
}
```

`context.pipelineId` обязателен. `payload` опционален, но если передан, должен быть JSON object. Request body ограничен Express-лимитом `2mb`.

Для безопасного диагностического trace добавь верхнеуровневое поле:

```json
{
  "trace": "basic",
  "context": {
    "pipelineId": "entrypoints.fl_resident.full_validation"
  },
  "payload": {}
}
```

Допустимы только `false` и `"basic"`. Режим `"verbose"` через HTTP API намеренно недоступен, потому что может раскрыть значения payload. По умолчанию поля `trace` в ответе нет.

Response:

```json
{
  "context": {
    "pipelineId": "entrypoints.fl_resident.full_validation",
    "currentDate": "2026-03-29"
  },
  "status": "ERROR",
  "control": "STOP",
  "issues": [
    {
      "kind": "ISSUE",
      "level": "ERROR",
      "code": "FL.INN.LENGTH_12",
      "message": "ИНН ФЛ должен содержать ровно 12 цифр",
      "field": "beneficiary.inn",
      "ruleId": "library.fl.inn_length_12",
      "expected": "^\\d{12}$",
      "actual": "1234567890470"
    }
  ],
  "ruleset": {
    "sourceHash": "d9444d0733786696aaa2e98f6bfae4fedd5804a0b65c36b13645cab1df46c9a5",
    "rulesetVersion": "1.0.0",
    "projectId": "nominal-beneficiaries-rules"
  }
}
```

HTTP status отражает обработку запроса, а не бизнес-успешность проверки:

- `200` — движок вернул обычный runtime result: `OK`, `OK_WITH_WARNINGS`, `ERROR` или `EXCEPTION`;
- `400` — невалидный JSON или нарушение HTTP request contract;
- `500` — движок вернул `ABORT` либо сервер не смог выполнить запрос.

При `ABORT` тело сохраняет структурированный result с `status: "ABORT"`, `control: "STOP"` и стабильным `error.code`.

## Healthcheck

### GET `/health`

```bash
curl http://localhost:3000/health
```

Ответ:

```json
{
  "ok": true
}
```

## Быстрая проверка через `payload.json`

Если в `payload.json` лежит полный request:

```json
{
  "context": {
    "pipelineId": "entrypoints.fl_resident.full_validation",
    "currentDate": "2026-03-29"
  },
  "payload": {}
}
```

Запуск:

```bash
curl -s -X POST http://localhost:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json | jq
```

## Переменные окружения

| Variable | Default | Description |
| --- | --- | --- |
| `SNAPSHOT_PATH` | `./snapshot.json` | Путь к snapshot-файлу. |
| `PORT` | `3000` | HTTP port. |

## Тесты

```bash
npm test
```

Тесты проверяют:

- согласованность `snapshot.json` и `build-info.json`;
- boot нормативного snapshot;
- `/health`;
- `/v1/validate`;
- отсутствие trace по умолчанию;
- ruleset provenance в ответе;
- `ABORT` как HTTP 500;
- запрет `verbose` trace;
- отсутствие raw payload values в `basic` trace;
- custom identifier operators через `ctx.get()`.

Текущее покрытие и рекомендуемые доработки тестов зафиксированы в [TESTING.md](./TESTING.md).

## Ограничения текущей версии

Сервис намеренно минимальный:

- один snapshot на процесс;
- один validation endpoint;
- без auth;
- без persistence;
- без live rebuild;
- без UI.

Если endpoint открывается наружу, добавь внешний auth/rate limit и подумай о лимите размера trace response.
