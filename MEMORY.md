# PROJECT MEMORY & STATE

## 1. Архитектурные решения
- Среда: VS Code + OpenCode (режим Build)
- Модель: MiMo V2.5 Free (OpenCode Zen)
- Управление доступом: Guardrails в opencode.json (ручной апрув на терминальные команды)
- Контракт агента: зафиксирован в AGENTS.md
- Верификатор: powershell -File ./verify.ps1

### Архитектура продукта kladovshik:
- Стек: автономный index.html (HTML5 + CSS3 + Vanilla JS) без внешних серверов.
- Хранение данных: localStorage (автосохранение черновика приемки).
- Экспорт: клиентская генерация .xlsx (SheetJS).
- Целевая платформа: Android (Google Play через Capacitor + защита лицензии Google Play Licensing).

## 2. Текущее состояние проекта
- [x] Инициализация проекта kladovshik и адаптация Harness-файлов (AGENTS.md, MEMORY.md, opencode.json, verify.ps1)
- [x] Разработка ядра и мобильного UI в index.html (Products, штрихованные Variants, стандартные и кастомные Pallets, Boxes, Loose Units)
- [x] Реализация автосохранения в localStorage и офлайн-экспорта в Excel (.xlsx)
- [x] Подготовка конфигурации Capacitor и модуля проверки лицензии для Google Play

## 3. Правило обновления памяти
После завершения каждого крупного этапа обновляй этот файл, отмечая выполненные пункты и фиксируя новые архитектурные решения.
