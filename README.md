# JSONSpecs Node Server

Минимальный backend validation service на Node.js для запуска `jsonspecs` **только через готовый snapshot**.

Сервис:

- загружает snapshot при старте;
- поднимает `POST /v1/validate`;
- принимает `context` и `payload`;
- выполняет валидацию через `jsonspecs`;
- возвращает результат проверки.

Без UI, без hot reload, без песочницы, без документации.

## Требования

- Node.js 20+
- npm

## Установка

```bash
npm install
```

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

### `TRACE`

Опциональная. Если `TRACE=1`, сервис оставляет trace в ответе.
Если не задано, trace вырезается из ответа.

Пример:

```bash
TRACE=1 SNAPSHOT_PATH=/absolute/path/to/snapshot.json npm start
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
