# API Reference

Полная документация по всем эндпоинтам API.

## Base URL

```
http://localhost:3000
```

## Аутентификация

Большинство эндпоинтов требуют JWT токен в заголовке Authorization:

```
Authorization: Bearer <your_jwt_token>
```

---

## Auth Endpoints

### POST /auth/register

Регистрация нового пользователя.

**Request Body:**
```json
{
  "fullName": "Иван Иванов",
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Validation:**
- `fullName`: обязательное поле, строка
- `email`: обязательное поле, валидный email
- `password`: обязательное поле, минимум 6 символов

**Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "Иван Иванов",
    "email": "ivan@example.com"
  }
}
```

**Errors:**
- `409 Conflict`: Пользователь с таким email уже существует

---

### POST /auth/login

Вход в систему.

**Request Body:**
```json
{
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "Иван Иванов",
    "email": "ivan@example.com"
  }
}
```

**Errors:**
- `401 Unauthorized`: Неверные учетные данные

---

### GET /auth/me

Получить информацию о текущем пользователе.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "userId": "507f1f77bcf86cd799439011",
    "email": "ivan@example.com",
    "fullName": "Иван Иванов"
  }
}
```

**Errors:**
- `401 Unauthorized`: Токен отсутствует или недействителен

---

## Users Endpoints

### GET /users

Получить список всех пользователей (для добавления участников в встречу).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "Иван Иванов",
    "email": "ivan@example.com"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "fullName": "Петр Петров",
    "email": "petr@example.com"
  }
]
```

---

## Meetings Endpoints

### POST /meetings

Создать новую встречу.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Обсуждение нового проекта",
  "question": "Какие технологии использовать для нового проекта?",
  "participantIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Validation:**
- `title`: обязательное поле, строка
- `question`: обязательное поле, строка
- `participantIds`: опциональное поле, массив строк (ObjectId)

**Response (201):**
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "title": "Обсуждение нового проекта",
  "question": "Какие технологии использовать для нового проекта?",
  "creatorId": "507f1f77bcf86cd799439011",
  "participantIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "currentPhase": "discussion",
  "status": "upcoming",
  "evaluations": [],
  "summaries": [],
  "createdAt": "2026-01-19T10:00:00.000Z",
  "updatedAt": "2026-01-19T10:00:00.000Z"
}
```

---

### GET /meetings

Получить все встречи текущего пользователя.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `filter`: (опционально) `current` или `past`
  - `current`: встречи со статусом `upcoming` или `active`
  - `past`: встречи со статусом `finished`

**Examples:**
```
GET /meetings
GET /meetings?filter=current
GET /meetings?filter=past
```

**Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439020",
    "title": "Обсуждение нового проекта",
    "question": "Какие технологии использовать?",
    "creatorId": {
      "_id": "507f1f77bcf86cd799439011",
      "fullName": "Иван Иванов",
      "email": "ivan@example.com"
    },
    "participantIds": [...],
    "currentPhase": "discussion",
    "status": "active",
    "createdAt": "2026-01-19T10:00:00.000Z"
  }
]
```

---

### GET /meetings/:id

Получить встречу по ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "title": "Обсуждение нового проекта",
  "question": "Какие технологии использовать?",
  "creatorId": {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "Иван Иванов",
    "email": "ivan@example.com"
  },
  "participantIds": [...],
  "currentPhase": "evaluation",
  "status": "active",
  "evaluations": [...],
  "summaries": [...],
  "createdAt": "2026-01-19T10:00:00.000Z",
  "updatedAt": "2026-01-19T11:00:00.000Z"
}
```

**Errors:**
- `400 Bad Request`: Неверный ID встречи
- `404 Not Found`: Встреча не найдена
- `403 Forbidden`: Пользователь не является участником встречи

---

### PATCH /meetings/:id

Обновить встречу (только создатель).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Новое название встречи",
  "question": "Обновленный вопрос",
  "participantIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439013"]
}
```

**Validation:**
- Все поля опциональны
- `title`: строка
- `question`: строка
- `participantIds`: массив строк (ObjectId)

**Response (200):** Обновленная встреча

**Errors:**
- `403 Forbidden`: Только создатель может обновить встречу

---

### DELETE /meetings/:id

Удалить встречу (только создатель).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):** Empty

**Errors:**
- `403 Forbidden`: Только создатель может удалить встречу

---

### PATCH /meetings/:id/phase

Изменить фазу встречи (только создатель).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "phase": "evaluation"
}
```

**Validation:**
- `phase`: обязательное поле, одно из значений: `discussion`, `evaluation`, `summary`, `finished`

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "currentPhase": "evaluation",
  "status": "active",
  ...
}
```

**Примечания:**
- При изменении фазы на `finished`, статус автоматически меняется на `finished`
- При изменении с `discussion` на `evaluation`, статус меняется с `upcoming` на `active`
- Изменение фазы триггерит WebSocket событие `phaseChanged`

**Errors:**
- `403 Forbidden`: Только создатель может менять фазу

---

### POST /meetings/:id/evaluations

Отправить оценку (только в фазе evaluation).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "understandingScore": 85,
  "influences": [
    {
      "participantId": "507f1f77bcf86cd799439012",
      "influencePercentage": 60
    },
    {
      "participantId": "507f1f77bcf86cd799439013",
      "influencePercentage": 40
    }
  ],
  "emotionalEvaluations": [
    {
      "targetParticipantId": "507f1f77bcf86cd799439012",
      "emotionalScale": 80,
      "isToxic": false
    },
    {
      "targetParticipantId": "507f1f77bcf86cd799439013",
      "emotionalScale": -20,
      "isToxic": true
    }
  ]
}
```

**Validation:**
- `understandingScore`: обязательное поле, число 0-100
- `influences`: массив объектов
  - `participantId`: ObjectId участника
  - `influencePercentage`: число 0-100
- `emotionalEvaluations`: массив объектов
  - `targetParticipantId`: ObjectId участника
  - `emotionalScale`: число от -100 до 100
  - `isToxic`: boolean

**Response (200):** Обновленная встреча с добавленной оценкой

**Errors:**
- `400 Bad Request`: Встреча не в фазе evaluation

---

### POST /meetings/:id/summaries

Отправить резюме (только в фазе summary).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "taskDescription": "Реализовать аутентификацию пользователей",
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90
}
```

**Validation:**
- `taskDescription`: обязательное поле, строка
- `deadline`: обязательное поле, ISO дата
- `contributionImportance`: обязательное поле, число 0-100

**Response (200):** Обновленная встреча с добавленным резюме

**Errors:**
- `400 Bad Request`: Встреча не в фазе summary

---

### GET /meetings/:id/statistics

Получить статистику встречи (только для завершенных встреч).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "question": "Какие технологии использовать для нового проекта?",
  "averageUnderstanding": 82.5,
  "participantStats": [
    {
      "participant": {
        "_id": "507f1f77bcf86cd799439011",
        "fullName": "Иван Иванов",
        "email": "ivan@example.com"
      },
      "understandingScore": 85,
      "averageEmotionalScale": 60,
      "toxicityFlags": 0
    },
    {
      "participant": {
        "_id": "507f1f77bcf86cd799439012",
        "fullName": "Петр Петров",
        "email": "petr@example.com"
      },
      "understandingScore": 80,
      "averageEmotionalScale": -10,
      "toxicityFlags": 2
    }
  ]
}
```

**Примечания:**
- `averageUnderstanding`: средняя оценка понимания по всем участникам
- `averageEmotionalScale`: средняя эмоциональная оценка, полученная участником от других
- `toxicityFlags`: количество раз, когда участника отметили как токсичного

**Errors:**
- `400 Bad Request`: Статистика доступна только для завершенных встреч

---

## Tasks Endpoints

### POST /tasks

Создать новую задачу.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "description": "Реализовать аутентификацию пользователей",
  "meetingId": "507f1f77bcf86cd799439020",
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90
}
```

**Validation:**
- `description`: обязательное поле, строка
- `meetingId`: обязательное поле, ObjectId
- `deadline`: обязательное поле, ISO дата
- `contributionImportance`: обязательное поле, число 0-100

**Response (201):**
```json
{
  "_id": "507f1f77bcf86cd799439030",
  "description": "Реализовать аутентификацию пользователей",
  "authorId": "507f1f77bcf86cd799439011",
  "meetingId": "507f1f77bcf86cd799439020",
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90,
  "isCompleted": false,
  "createdAt": "2026-01-19T10:00:00.000Z",
  "updatedAt": "2026-01-19T10:00:00.000Z"
}
```

---

### GET /tasks

Получить все задачи текущего пользователя.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `filter`: (опционально) `current` или `past`
  - `current`: активные задачи (`isCompleted: false`)
  - `past`: завершенные задачи (`isCompleted: true`)

**Examples:**
```
GET /tasks
GET /tasks?filter=current
GET /tasks?filter=past
```

**Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439030",
    "description": "Реализовать аутентификацию",
    "authorId": {
      "_id": "507f1f77bcf86cd799439011",
      "fullName": "Иван Иванов",
      "email": "ivan@example.com"
    },
    "meetingId": {
      "_id": "507f1f77bcf86cd799439020",
      "title": "Обсуждение проекта",
      "question": "Какие технологии использовать?"
    },
    "deadline": "2026-02-01T00:00:00.000Z",
    "contributionImportance": 90,
    "isCompleted": false
  }
]
```

---

### GET /tasks/meeting/:meetingId

Получить все задачи из конкретной встречи.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):** Массив задач

---

### GET /tasks/:id

Получить задачу по ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439030",
  "description": "Реализовать аутентификацию пользователей",
  "authorId": {...},
  "meetingId": {...},
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90,
  "isCompleted": false
}
```

**Errors:**
- `400 Bad Request`: Неверный ID задачи
- `404 Not Found`: Задача не найдена
- `403 Forbidden`: Можно просматривать только свои задачи

---

### PATCH /tasks/:id

Обновить задачу (только автор).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "description": "Обновленное описание задачи",
  "deadline": "2026-02-15T00:00:00.000Z",
  "contributionImportance": 95,
  "isCompleted": true
}
```

**Validation:**
- Все поля опциональны
- `description`: строка
- `deadline`: ISO дата
- `contributionImportance`: число 0-100
- `isCompleted`: boolean

**Response (200):** Обновленная задача

**Errors:**
- `403 Forbidden`: Только автор может обновить задачу

---

### DELETE /tasks/:id

Удалить задачу (только автор).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):** Empty

**Errors:**
- `403 Forbidden`: Только автор может удалить задачу

---

## WebSocket Events

### Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});
```

### Client Events

#### joinMeeting

Присоединиться к комнате встречи.

**Emit:**
```javascript
socket.emit('joinMeeting', meetingId);
```

**Response:**
```javascript
{
  status: 'joined',
  meetingId: '507f1f77bcf86cd799439020'
}
```

#### leaveMeeting

Покинуть комнату встречи.

**Emit:**
```javascript
socket.emit('leaveMeeting', meetingId);
```

**Response:**
```javascript
{
  status: 'left',
  meetingId: '507f1f77bcf86cd799439020'
}
```

### Server Events

#### phaseChanged

Фаза встречи изменилась.

**Listen:**
```javascript
socket.on('phaseChanged', (data) => {
  console.log('Phase changed:', data);
});
```

**Data:**
```javascript
{
  meetingId: '507f1f77bcf86cd799439020',
  phase: 'evaluation',
  status: 'active'
}
```

#### evaluationSubmitted

Участник отправил оценку.

**Listen:**
```javascript
socket.on('evaluationSubmitted', (data) => {
  console.log('Evaluation submitted:', data);
});
```

#### summarySubmitted

Участник отправил резюме.

**Listen:**
```javascript
socket.on('summarySubmitted', (data) => {
  console.log('Summary submitted:', data);
});
```

---

## Error Responses

Все ошибки возвращаются в следующем формате:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### HTTP Status Codes

- `200 OK` - Успешный запрос
- `201 Created` - Ресурс создан
- `400 Bad Request` - Неверные данные запроса
- `401 Unauthorized` - Требуется аутентификация
- `403 Forbidden` - Доступ запрещен
- `404 Not Found` - Ресурс не найден
- `409 Conflict` - Конфликт (например, email уже существует)
- `500 Internal Server Error` - Внутренняя ошибка сервера
