# Render Deployment Guide

Пошаговое руководство по развертыванию NestJS API на Render.

## Предварительные требования

✅ Аккаунт на [Render.com](https://render.com)  
✅ GitHub репозиторий с вашим кодом  
✅ MongoDB Atlas кластер и connection string

---

## Шаг 1: Создание Web Service на Render

1. Откройте [Render Dashboard](https://dashboard.render.com/)
2. Нажмите **"New"** → **"Web Service"**
3. Подключите ваш GitHub репозиторий
4. Выберите ветку для деплоя (обычно `main` или `master`)

---

## Шаг 2: Настройка Build Settings

### ⚠️ КРИТИЧЕСКИ ВАЖНО: Используйте правильные команды

В разделе **"Build & Deploy"** укажите:

| Настройка | Значение |
|-----------|----------|
| **Language** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:prod` |

**НЕ ИСПОЛЬЗУЙТЕ:**
- ❌ `npm run start` (это development режим)
- ❌ `nest start` (не работает в продакшене)
- ❌ `node app.js` (неправильный путь)

---

## Шаг 3: Environment Variables

В разделе **"Environment"** добавьте следующие переменные:

### Обязательные переменные:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/meetings-quality?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRATION=7d

# Application
NODE_ENV=production

# CORS (URL вашего фронтенда)
FRONTEND_URL=https://your-frontend.onrender.com
```

### ⚠️ Важно про PORT:

**НЕ устанавливайте переменную PORT вручную!**

Render автоматически предоставляет `PORT` - наш код уже настроен на его использование.

---

## Шаг 4: План и Instance Type

### Для начала выберите:

- **Instance Type:** Free (для тестирования)
- **Region:** Ближайший к вашим пользователям

### ⚠️ Ограничения Free плана:

- 512 MB RAM (может быть недостаточно для больших нагрузок)
- Сервис "засыпает" после 15 минут неактивности
- Первый запрос после "сна" может быть медленным (cold start)

### Для продакшена рекомендуется:

- **Starter Plan** ($7/месяц) - 512 MB RAM, не засыпает
- **Standard Plan** ($25/месяц) - 2 GB RAM, автоскейлинг

---

## Шаг 5: Проверка настроек MongoDB Atlas

### Network Access:

1. Перейдите в MongoDB Atlas → **Network Access**
2. Нажмите **"Add IP Address"**
3. Выберите **"Allow Access from Anywhere"** (`0.0.0.0/0`)
   - Или добавьте конкретные IP Render (см. [Render Docs](https://render.com/docs/static-outbound-ip-addresses))

### Database User:

1. Перейдите в **Database Access**
2. Убедитесь, что пользователь существует и имеет права **Read and write to any database**
3. Проверьте, что пароль не содержит специальных символов (или они правильно закодированы в URL)

---

## Шаг 6: Deploy!

1. Нажмите **"Create Web Service"**
2. Render начнет сборку и деплой
3. Следите за логами в реальном времени

### Что должно произойти:

```
==> Running 'npm install && npm run build'
✓ Зависимости установлены
✓ TypeScript скомпилирован

==> Running 'npm run start:prod'
🔧 Environment: production
🔌 Attempting to bind to port: XXXX
🚀 Application is running on port: XXXX
📚 Swagger documentation available at: /api
✅ Server successfully started!

==> Your service is live 🎉
```

---

## Troubleshooting

### Проблема 1: "No open ports detected"

**Причина:** Неправильная команда запуска или порт не привязан.

**Решение:**
- Убедитесь, что Start Command: `npm run start:prod`
- НЕ устанавливайте переменную `PORT` вручную
- Проверьте, что в логах есть `Attempting to bind to port:`

### Проблема 2: "JavaScript heap out of memory"

**Причина:** Недостаточно памяти для сборки.

**Решение 1:** Оптимизация сборки (уже добавлена)
```json
"start:prod": "node --max-old-space-size=512 dist/main"
```

**Решение 2:** Увеличить память (платные планы)
- Starter: 512 MB
- Standard: 2 GB

**Решение 3:** Уменьшить зависимости
```bash
# Проверьте размер node_modules
npm run build -- --stats
```

### Проблема 3: "MongooseServerSelectionError"

**Причина:** Не может подключиться к MongoDB.

**Решение:**
1. Проверьте `MONGODB_URI` в Environment Variables
2. Убедитесь, что IP добавлен в Network Access на MongoDB Atlas
3. Проверьте username/password в connection string
4. Попробуйте подключиться из терминала Render:
```bash
# В Render Shell
curl -I mongodb+srv://your-cluster.mongodb.net
```

### Проблема 4: "502 Bad Gateway"

**Причина:** Приложение не запустилось или упало.

**Решение:**
1. Проверьте логи в Render Dashboard
2. Убедитесь, что все environment variables установлены
3. Проверьте, что приложение запускается локально с теми же переменными

### Проблема 5: CORS ошибки

**Причина:** Фронтенд не разрешен в CORS.

**Решение:**
Установите правильный `FRONTEND_URL`:
```bash
FRONTEND_URL=https://your-frontend-app.onrender.com
```

Или разрешите несколько доменов (обновите `main.ts`):
```typescript
app.enableCors({
  origin: [
    'https://your-frontend.onrender.com',
    'https://your-custom-domain.com',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : ''
  ].filter(Boolean),
  credentials: true,
});
```

---

## Проверка деплоя

### 1. Проверьте здоровье API:

```bash
curl https://your-app.onrender.com/
```

### 2. Проверьте Swagger документацию:

```
https://your-app.onrender.com/api
```

### 3. Протестируйте регистрацию:

```bash
curl -X POST https://your-app.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## Continuous Deployment

### Автоматический деплой:

Render автоматически разворачивает изменения при каждом push в выбранную ветку GitHub.

### Отключить автодеплой:

1. Перейдите в Settings → Build & Deploy
2. Отключите **"Auto-Deploy"**
3. Деплойте вручную через Dashboard

### Deploy Hooks:

Создайте webhook для деплоя из CI/CD:

1. Settings → Deploy Hook
2. Скопируйте URL
3. Используйте в GitHub Actions или другом CI/CD

---

## Мониторинг и логи

### Просмотр логов:

1. Откройте ваш Web Service в Dashboard
2. Перейдите на вкладку **"Logs"**
3. Логи обновляются в реальном времени

### Метрики:

На вкладке **"Metrics"** доступны:
- CPU usage
- Memory usage
- Request count
- Response time

### Алерты:

Настройте уведомления в Settings → Notifications:
- Deploy success/failure
- Service down
- High CPU/Memory usage

---

## Custom Domain

### Добавление своего домена:

1. Settings → Custom Domains
2. Нажмите **"Add Custom Domain"**
3. Введите ваш домен (например, `api.yourdomain.com`)
4. Добавьте DNS записи (Render покажет инструкции):
   - CNAME: `api.yourdomain.com` → `your-app.onrender.com`
5. SSL сертификат настраивается автоматически (Let's Encrypt)

---

## Оптимизация для продакшена

### 1. Включите compression:

```bash
npm install compression
```

```typescript
// main.ts
import * as compression from 'compression';

app.use(compression());
```

### 2. Настройте rate limiting:

```bash
npm install @nestjs/throttler
```

### 3. Добавьте health check endpoint:

```typescript
// app.controller.ts
@Get('health')
health() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
```

### 4. Настройте мониторинг:

- [Sentry](https://sentry.io) для отслеживания ошибок
- [LogRocket](https://logrocket.com) для session replay
- [DataDog](https://www.datadoghq.com) для APM

---

## Стоимость

### Free Tier:
- ✅ Отлично для разработки и тестирования
- ❌ Сервис засыпает после 15 минут неактивности
- ❌ 512 MB RAM может быть недостаточно

### Starter ($7/мес):
- ✅ Не засыпает
- ✅ 512 MB RAM
- ✅ Подходит для небольших продакшн приложений

### Standard ($25/мес):
- ✅ 2 GB RAM
- ✅ Автоскейлинг
- ✅ Рекомендуется для продакшена

---

## Чеклист перед деплоем

- [ ] `MONGODB_URI` настроен и протестирован
- [ ] `JWT_SECRET` установлен (минимум 32 символа)
- [ ] `FRONTEND_URL` указывает на правильный домен
- [ ] `NODE_ENV=production` установлен
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm run start:prod`
- [ ] MongoDB Atlas разрешает подключения (Network Access)
- [ ] Все зависимости в `package.json`
- [ ] `.gitignore` не исключает важные файлы

---

## Полезные ссылки

- [Render Documentation](https://render.com/docs)
- [Node.js Deployment Guide](https://render.com/docs/deploy-node-express-app)
- [Environment Variables](https://render.com/docs/environment-variables)
- [Static Outbound IPs](https://render.com/docs/static-outbound-ip-addresses)
- [MongoDB Atlas Setup](https://www.mongodb.com/docs/atlas/getting-started/)

---

## Поддержка

Если возникли проблемы:

1. Проверьте логи в Render Dashboard
2. Убедитесь, что все environment variables установлены
3. Проверьте подключение к MongoDB Atlas
4. Обратитесь в [Render Community](https://community.render.com/)
