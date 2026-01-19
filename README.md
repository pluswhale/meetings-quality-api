# Meetings Quality API

Backend API для платформы отслеживания качества встреч.

## Технологии

- **NestJS** - прогрессивный Node.js фреймворк
- **MongoDB** - NoSQL база данных (MongoDB Atlas)
- **Mongoose** - ODM для MongoDB
- **JWT** - аутентификация
- **Socket.io** - WebSocket для обновлений в реальном времени
- **class-validator** - валидация данных

## Возможности

### Аутентификация
- Регистрация пользователей
- Вход в систему
- JWT токены для защиты API

### Управление встречами
- Создание встреч с вопросами
- Три фазы встречи: Обсуждение → Оценка → Резюме
- Переключение фаз в реальном времени (WebSocket)
- Добавление участников

### Фаза оценки
- Самооценка понимания (0-100)
- Оценка влияния других участников (в процентах)
- Эмоциональная оценка участников (шкала -100 до 100)
- Отметка токсичности участников

### Фаза резюме
- Создание задач из встречи
- Установка дедлайнов
- Оценка важности своего вклада

### Управление задачами
- Просмотр своих задач
- Редактирование задач
- Фильтрация: текущие/прошлые

### Статистика
- Средняя оценка понимания
- Статистика по каждому участнику
- Эмоциональные оценки
- Флаги токсичности

## Установка и запуск

### Предварительные требования

- Node.js (v16 или выше)
- npm или yarn
- MongoDB Atlas аккаунт

### Шаг 1: Установка зависимостей

```bash
npm install
```

### Шаг 2: Настройка MongoDB Atlas

1. Создайте аккаунт на [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Создайте новый кластер (бесплатный M0 tier подойдет для разработки)
3. Создайте пользователя базы данных:
   - Database Access → Add New Database User
   - Выберите имя пользователя и пароль
4. Разрешите доступ с вашего IP:
   - Network Access → Add IP Address
   - Добавьте текущий IP или 0.0.0.0/0 (для разработки)
5. Получите строку подключения:
   - Нажмите "Connect" на вашем кластере
   - Выберите "Connect your application"
   - Скопируйте connection string

### Шаг 3: Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```bash
cp .env.example .env
```

Отредактируйте `.env` файл:

```env
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://your-username:your-password@cluster0.xxxxx.mongodb.net/meetings-quality?retryWrites=true&w=majority

# JWT секретный ключ (замените на свой случайный ключ)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Срок действия JWT токена
JWT_EXPIRATION=7d

# Порт сервера
PORT=3000

# Режим работы
NODE_ENV=development

# URL фронтенда для CORS
FRONTEND_URL=http://localhost:5173
```

**Важно:** Замените `your-username`, `your-password` и `cluster0.xxxxx` на ваши данные из MongoDB Atlas.

### Шаг 4: Запуск сервера

Режим разработки (с автоперезагрузкой):
```bash
npm run start:dev
```

Режим продакшена:
```bash
npm run build
npm run start:prod
```

Сервер запустится на `http://localhost:3000`

## Структура проекта

```
src/
├── auth/                      # Модуль аутентификации
│   ├── decorators/           # Декораторы (CurrentUser)
│   ├── dto/                  # DTO для аутентификации
│   ├── guards/               # Guards (JwtAuthGuard)
│   ├── strategies/           # Passport стратегии (JWT)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── users/                     # Модуль пользователей
│   ├── dto/                  # DTO пользователей
│   ├── schemas/              # Mongoose схемы
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── meetings/                  # Модуль встреч
│   ├── dto/                  # DTO встреч
│   ├── schemas/              # Mongoose схемы
│   ├── meetings.controller.ts
│   ├── meetings.service.ts
│   ├── meetings.gateway.ts   # WebSocket gateway
│   └── meetings.module.ts
├── tasks/                     # Модуль задач
│   ├── dto/                  # DTO задач
│   ├── schemas/              # Mongoose схемы
│   ├── tasks.controller.ts
│   ├── tasks.service.ts
│   └── tasks.module.ts
├── app.module.ts              # Главный модуль
└── main.ts                    # Точка входа
```

## API Endpoints

### Аутентификация

#### POST /auth/register
Регистрация нового пользователя

**Body:**
```json
{
  "fullName": "Иван Иванов",
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Response:**
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

#### POST /auth/login
Вход в систему

**Body:**
```json
{
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Response:** Такой же как при регистрации

#### GET /auth/me
Получить текущего пользователя

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "userId": "507f1f77bcf86cd799439011",
    "email": "ivan@example.com",
    "fullName": "Иван Иванов"
  }
}
```

### Пользователи

#### GET /users
Получить список всех пользователей (для добавления в встречу)

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "Иван Иванов",
    "email": "ivan@example.com"
  }
]
```

### Встречи

#### POST /meetings
Создать встречу

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "title": "Обсуждение нового проекта",
  "question": "Какие технологии использовать для нового проекта?",
  "participantIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

#### GET /meetings
Получить все встречи текущего пользователя

**Query параметры:**
- `filter` - фильтр: `current` (текущие) или `past` (прошлые)

**Headers:**
```
Authorization: Bearer <token>
```

**Example:**
```
GET /meetings?filter=current
```

#### GET /meetings/:id
Получить встречу по ID

**Headers:**
```
Authorization: Bearer <token>
```

#### PATCH /meetings/:id
Обновить встречу (только создатель)

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "title": "Новое название",
  "question": "Новый вопрос",
  "participantIds": ["507f1f77bcf86cd799439011"]
}
```

#### DELETE /meetings/:id
Удалить встречу (только создатель)

**Headers:**
```
Authorization: Bearer <token>
```

#### PATCH /meetings/:id/phase
Изменить фазу встречи (только создатель)

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "phase": "evaluation"
}
```

**Возможные значения phase:**
- `discussion` - обсуждение
- `evaluation` - оценка
- `summary` - резюме
- `finished` - завершена

#### POST /meetings/:id/evaluations
Отправить оценку (только в фазе evaluation)

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
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

**Примечания:**
- `understandingScore`: 0-100
- `influencePercentage`: 0-100
- `emotionalScale`: -100 (negative) до 100 (positive)
- Сумма `influencePercentage` должна быть 100%

#### POST /meetings/:id/summaries
Отправить резюме (только в фазе summary)

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "taskDescription": "Реализовать аутентификацию пользователей",
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90
}
```

#### GET /meetings/:id/statistics
Получить статистику встречи (только для завершенных встреч)

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "question": "Какие технологии использовать?",
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
    }
  ]
}
```

### Задачи

#### POST /tasks
Создать задачу

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "description": "Реализовать аутентификацию",
  "meetingId": "507f1f77bcf86cd799439020",
  "deadline": "2026-02-01T00:00:00.000Z",
  "contributionImportance": 90
}
```

#### GET /tasks
Получить все задачи текущего пользователя

**Query параметры:**
- `filter` - фильтр: `current` (активные) или `past` (завершенные)

**Headers:**
```
Authorization: Bearer <token>
```

#### GET /tasks/meeting/:meetingId
Получить все задачи из конкретной встречи

**Headers:**
```
Authorization: Bearer <token>
```

#### GET /tasks/:id
Получить задачу по ID

**Headers:**
```
Authorization: Bearer <token>
```

#### PATCH /tasks/:id
Обновить задачу (только автор)

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "description": "Обновленное описание",
  "deadline": "2026-02-15T00:00:00.000Z",
  "contributionImportance": 95,
  "isCompleted": true
}
```

#### DELETE /tasks/:id
Удалить задачу (только автор)

**Headers:**
```
Authorization: Bearer <token>
```

## WebSocket Events

Подключение к WebSocket:
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});
```

### События от клиента

#### joinMeeting
Присоединиться к комнате встречи для получения обновлений

```javascript
socket.emit('joinMeeting', meetingId);
```

#### leaveMeeting
Покинуть комнату встречи

```javascript
socket.emit('leaveMeeting', meetingId);
```

### События от сервера

#### phaseChanged
Фаза встречи изменилась

```javascript
socket.on('phaseChanged', (data) => {
  console.log(data);
  // {
  //   meetingId: "507f1f77bcf86cd799439020",
  //   phase: "evaluation",
  //   status: "active"
  // }
});
```

#### evaluationSubmitted
Участник отправил оценку

```javascript
socket.on('evaluationSubmitted', (data) => {
  console.log(data);
});
```

#### summarySubmitted
Участник отправил резюме

```javascript
socket.on('summarySubmitted', (data) => {
  console.log(data);
});
```

## Схемы данных

### User
```typescript
{
  _id: ObjectId
  fullName: string
  email: string
  password: string (hashed)
  createdAt: Date
  updatedAt: Date
}
```

### Meeting
```typescript
{
  _id: ObjectId
  title: string
  question: string
  creatorId: ObjectId (ref: User)
  participantIds: ObjectId[] (ref: User)
  currentPhase: 'discussion' | 'evaluation' | 'summary' | 'finished'
  status: 'upcoming' | 'active' | 'finished'
  evaluations: Evaluation[]
  summaries: Summary[]
  createdAt: Date
  updatedAt: Date
}
```

### Evaluation
```typescript
{
  participantId: ObjectId (ref: User)
  understandingScore: number (0-100)
  influences: UnderstandingInfluence[]
  emotionalEvaluations: EmotionalEvaluation[]
  submittedAt: Date
}
```

### UnderstandingInfluence
```typescript
{
  participantId: ObjectId (ref: User)
  influencePercentage: number (0-100)
}
```

### EmotionalEvaluation
```typescript
{
  targetParticipantId: ObjectId (ref: User)
  emotionalScale: number (-100 to 100)
  isToxic: boolean
}
```

### Summary
```typescript
{
  participantId: ObjectId (ref: User)
  taskDescription: string
  deadline: Date
  contributionImportance: number (0-100)
  submittedAt: Date
}
```

### Task
```typescript
{
  _id: ObjectId
  description: string
  authorId: ObjectId (ref: User)
  meetingId: ObjectId (ref: Meeting)
  deadline: Date
  contributionImportance: number (0-100)
  isCompleted: boolean
  createdAt: Date
  updatedAt: Date
}
```

## Безопасность

- Пароли хешируются с помощью bcrypt
- JWT токены для аутентификации
- Защита эндпоинтов с помощью Guards
- Валидация входных данных с class-validator
- CORS настроен для фронтенда

## Разработка

### Запуск в режиме разработки
```bash
npm run start:dev
```

### Сборка проекта
```bash
npm run build
```

### Запуск в продакшене
```bash
npm run start:prod
```

### Линтинг
```bash
npm run lint
```

### Форматирование кода
```bash
npm run format
```

## Переменные окружения

| Переменная | Описание | Пример |
|-----------|----------|--------|
| MONGODB_URI | Строка подключения MongoDB | mongodb+srv://user:pass@cluster.mongodb.net/dbname |
| JWT_SECRET | Секретный ключ для JWT | your-secret-key |
| JWT_EXPIRATION | Срок действия JWT токена | 7d |
| PORT | Порт сервера | 3000 |
| NODE_ENV | Режим работы | development / production |
| FRONTEND_URL | URL фронтенда для CORS | http://localhost:5173 |

## Примеры использования API

### Полный flow создания и завершения встречи

1. **Регистрация пользователя:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Иван Иванов",
    "email": "ivan@example.com",
    "password": "password123"
  }'
```

2. **Создание встречи:**
```bash
curl -X POST http://localhost:3000/meetings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Обсуждение проекта",
    "question": "Какие технологии использовать?",
    "participantIds": ["USER_ID_1", "USER_ID_2"]
  }'
```

3. **Переключение в фазу оценки:**
```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phase": "evaluation"
  }'
```

4. **Отправка оценки:**
```bash
curl -X POST http://localhost:3000/meetings/MEETING_ID/evaluations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "understandingScore": 85,
    "influences": [
      {"participantId": "USER_ID_2", "influencePercentage": 100}
    ],
    "emotionalEvaluations": [
      {"targetParticipantId": "USER_ID_2", "emotionalScale": 80, "isToxic": false}
    ]
  }'
```

5. **Переключение в фазу резюме:**
```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phase": "summary"
  }'
```

6. **Отправка резюме:**
```bash
curl -X POST http://localhost:3000/meetings/MEETING_ID/summaries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "taskDescription": "Реализовать аутентификацию",
    "deadline": "2026-02-01T00:00:00.000Z",
    "contributionImportance": 90
  }'
```

7. **Завершение встречи:**
```bash
curl -X PATCH http://localhost:3000/meetings/MEETING_ID/phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phase": "finished"
  }'
```

8. **Получение статистики:**
```bash
curl http://localhost:3000/meetings/MEETING_ID/statistics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Поддержка

При возникновении проблем:
1. Проверьте переменные окружения в `.env`
2. Убедитесь, что MongoDB Atlas доступен
3. Проверьте, что все зависимости установлены
4. Проверьте логи сервера

## Лицензия

MIT
