# JSONSpecs Node Server

Минимальный backend validation service на Node.js для запуска `jsonspecs` **только через готовый snapshot**.

Сервис:

- загружает snapshot при старте;
- поднимает `POST /v1/validate`;
- принимает `context` и `payload`;
- выполняет валидацию через `jsonspecs`;
- возвращает результат проверки;
- по явному запросу возвращает безопасный `basic` trace.

Без UI, без hot reload, без песочницы, без документации.

## Требования

- Node.js 20+
- npm

## Установка

```bash
npm install
```

До публикации `jsonspecs@2.0.0` исходники движка должны находиться в соседнем каталоге `../jsonspecs`. После публикации standalone/deploy checkout может сначала выполнить `npm run deps:registry`, а затем `npm ci`; команда материализует точную версию движка из npm в тот же pinned sibling-каталог.

## Запуск

Нужно передать путь к snapshot через переменную окружения `SNAPSHOT_PATH`.

Пример:

```bash
SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

Если хочешь запустить на другом порту:

```bash
PORT=3100 SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

## Что должен содержать snapshot

Сервис работает только с **готовым snapshot**, собранным заранее через `jsonspecs-cli`.

То есть здесь не происходит:

- компиляции rules project;
- сборки manifest;
- чтения исходных правил из repo.

Сервис использует только итоговый build artifact.

## Endpoint

### POST `/v1/validate`

#### Request

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

Допустимы только `false` и `"basic"`. Режим `verbose` через HTTP API намеренно недоступен, поскольку может раскрыть значения payload. По умолчанию поле `trace` в ответе отсутствует.

#### Response

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
  ]
}
```

HTTP status отражает только обработку запроса движком:

- `200` — движок вернул обычный результат (`OK`, `WARNING` или `ERROR`);
- `400` — некорректный JSON или контракт HTTP-запроса;
- `500` — движок вернул `ABORT` либо сервер не смог выполнить запрос.

При `ABORT` тело сохраняет структурированный runtime result с `status: "ABORT"`, `control: "STOP"` и стабильным `error.code`.

## Healthcheck

### GET `/health`

Быстрая проверка, что сервис поднят:

```bash
curl http://localhost:3000/health
```

Пример ответа:

```json
{
  "ok": true
}
```

## Быстрая проверка через файл `payload.json`

Если в `payload.json` у тебя уже лежит полный request с обоими полями:

- `context`
- `payload`

то проверить можно так:

```bash
curl -X POST http://localhost:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json
```

Если хочешь красивый вывод:

```bash
curl -s -X POST http://localhost:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json | jq
```

## Полезные переменные окружения

### `SNAPSHOT_PATH`

Обязательная. Путь к snapshot-файлу.

Пример:

```bash
SNAPSHOT_PATH=/absolute/path/to/snapshot.json
```

### `PORT`

Опциональная. Порт HTTP-сервера.

По умолчанию:

```text
3000
```

## Минимальный сценарий запуска

### 1. Установить зависимости

```bash
npm install
```

### 2. Запустить сервер со snapshot

```bash
SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
```

### 3. Проверить health

```bash
curl http://localhost:3000/health
```

### 4. Отправить тестовый payload

```bash
curl -X POST http://localhost:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json
```

## Ограничения текущей версии

Этот сервис специально сделан минимальным:

- только snapshot runtime;
- только один validation endpoint;
- без auth;
- без persistence;
- без docs;
- без live rebuild.

Его задача быть тонкой production-like обёрткой над Node runtime.
