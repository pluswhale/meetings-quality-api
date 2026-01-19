# OpenAPI Generation Guide

Генерация OpenAPI спецификации для использования на фронтенде.

## Как это работает

Аналогично `prisma generate`, команда `npm run openapi:generate` создает статический файл `generated/openapi.json` с полной OpenAPI спецификацией вашего API.

## Генерация OpenAPI спецификации

```bash
npm run openapi:generate
```

Это создаст файл: `generated/openapi.json`

## Использование на фронтенде

### 1. В вашем frontend проекте создайте `orval.config.ts`:

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      // Используйте относительный путь к generated/openapi.json из backend
      target: '../meetings-quality-api/generated/openapi.json',
      
      // Или если backend в монорепо:
      // target: './packages/backend/generated/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/models',
      client: 'react-query',
      mock: false,
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: 'src/api/mutator/custom-instance.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
    },
  },
});
```

### 2. Создайте `src/api/mutator/custom-instance.ts` на фронтенде:

```typescript
import Axios, { AxiosRequestConfig, AxiosError } from 'axios';

export const AXIOS_INSTANCE = Axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3002',
  withCredentials: true,
});

AXIOS_INSTANCE.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
    }
    return Promise.reject(error);
  }
);

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = Axios.CancelToken.source();
  
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-ignore
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };

  return promise;
};

export type ErrorType<Error> = AxiosError<Error>;

export default customInstance;
```

### 3. Генерируйте API клиент на фронтенде:

```bash
cd your-frontend-project
npx orval
```

## Workflow для разработки

### Backend разработчик:

1. Изменяете API (добавляете новые endpoints, DTOs и т.д.)
2. Запускаете:
   ```bash
   npm run openapi:generate
   ```
3. Коммитите `generated/openapi.json` в git
4. Пушите изменения

### Frontend разработчик:

1. Пулит изменения из backend репозитория
2. Запускает в frontend проекте:
   ```bash
   npx orval
   ```
3. Получает обновленные типы и API клиент

## Автоматизация

### Добавьте в pre-commit hook (опционально):

```bash
# .husky/pre-commit
npm run openapi:generate
git add generated/openapi.json
```

### Или добавьте в CI/CD:

```yaml
# .github/workflows/generate-openapi.yml
name: Generate OpenAPI
on:
  push:
    branches: [main]

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run openapi:generate
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: "chore: regenerate OpenAPI spec"
          file_pattern: generated/openapi.json
```

## Структура проекта

```
meetings-quality-api/
├── generated/
│   └── openapi.json          # ✅ Генерируемый файл (коммитится в git)
├── scripts/
│   └── generate-openapi.ts   # Скрипт генерации
├── src/
│   └── ...                   # Ваш код
└── package.json              # Содержит "openapi:generate" script
```

## Преимущества этого подхода

✅ **Не нужен запущенный backend** - Frontend может генерировать клиент без запущенного сервера  
✅ **Версионность** - OpenAPI spec в git, можно видеть изменения в PR  
✅ **Быстрая генерация** - Не нужны HTTP запросы  
✅ **Оффлайн разработка** - Frontend может работать без доступа к backend серверу  
✅ **CI/CD friendly** - Легко интегрировать в пайплайны  

## Когда регенерировать

Запускайте `npm run openapi:generate` когда:

- ✅ Добавляете новый endpoint
- ✅ Изменяете DTO
- ✅ Обновляете валидацию
- ✅ Меняете типы ответов
- ✅ Добавляете новые Swagger декораторы

## Troubleshooting

### Ошибка: "Cannot find module '../src/app.module'"

**Решение:** Убедитесь, что вы запускаете команду из корня backend проекта

### Ошибка: "MongooseError: Connection failed"

**Решение:** Скрипт не требует подключения к БД. Если ошибка все равно возникает, временно закомментируйте подключение к MongoDB в `app.module.ts` во время генерации

### Frontend не видит изменения

**Решение:** 
1. Убедитесь, что `generated/openapi.json` обновлен
2. Запустите `npx orval` снова на frontend
3. Перезапустите dev сервер frontend

## Сравнение с Prisma

| Prisma | OpenAPI Generate |
|--------|------------------|
| `prisma generate` | `npm run openapi:generate` |
| Генерирует Prisma Client | Генерирует OpenAPI spec |
| Используется для работы с БД | Используется для генерации frontend клиента |
| Изменения в schema.prisma → регенерация | Изменения в API → регенерация |

## Пример использования на фронтенде

После генерации используйте хуки в компонентах:

```typescript
import { useMeetingsControllerFindAll } from '@/api/generated/meetings/meetings';

function MeetingsList() {
  const { data, isLoading } = useMeetingsControllerFindAll({
    filter: 'current',
  });

  if (isLoading) return <div>Загрузка...</div>;

  return (
    <div>
      {data?.map((meeting) => (
        <div key={meeting._id}>{meeting.title}</div>
      ))}
    </div>
  );
}
```

Все полностью типизировано! 🎉
