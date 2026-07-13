# New Lords — Pipeline розробки

Черга задач — GitHub Issues репо `dry-eye/the-new-lords`. Джерело істини дизайну — `docs/DESIGN.md`. Статус задачі = label.

## Статуси (labels)

| Label | Значення |
|---|---|
| `status:to-design` | Треба дизайн-рішення — у код **не брати** |
| `status:to-do` | Готове до коду — worker може брати |
| `status:in-progress` | Worker узяв (займає слот пулу) |

Done = issue **closed** (worker закриває, коли злив у `master`).

## Ролі

**Worker** — довготривала loop-сесія, тримає пул ≤10 задач у роботі. Щотіку добирає задачі зі `status:to-do` до максимуму (менше 10 — лише якщо готових задач менше), кожну веде суб-агент у власному git-worktree. Взяв → `in-progress`. Готово → зливає гілку в `master` напряму (без PR) і закриває issue. Щось неясно → повертає issue в `to-design` з коментарем «що саме неясно».

**Design-сесія** (skill, спирається на `sync-design`) — розбирає `to-design`: уточнює/брейнштормить через інтерв'ю, фіксує рішення в `docs/DESIGN.md`, повертає issue в `to-do` (або нарізає нові issue).

**Feedback-сесія** — ти дивишся `master`, даєш фідбек; вона нарізає нові issue → `to-do` (ясне) або `to-design` (треба уточнити).

## Потік

```
to-design → to-do → in-progress → merge у master + issue closed
    ↑___ worker повертає, якщо неясно ___|
```
