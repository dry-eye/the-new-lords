# New Lords — Pipeline розробки

Черга задач — GitHub Issues репо `dry-eye/the-new-lords`. Джерело істини дизайну — `docs/DESIGN.md`. Статус задачі = label.

## Статуси (labels)

| Label | Значення |
|---|---|
| `status:to-design` | Треба дизайн-рішення — у код **не брати** |
| `status:to-do` | Готове до коду — worker може брати |
| `status:in-progress` | Worker узяв — Builder або Tester у роботі (займає слот пулу) |

Done = PR замерджено (squash) — issue closed через `Closes #N`.

## Ролі

**Worker** — довготривала loop-сесія, тримає пул **≤10 суб-агентів** у роботі (кожен у власному git-worktree). Кожну задачу ведуть **два агенти послідовно**:

- **Builder** — бере issue зі `status:to-do` → `in-progress`, реалізує, verify (build+browser зелені), пушить гілку, відкриває PR з `Closes #N`. **Сам не мержить.**
- **Tester/Integrator** — *інший* агент незалежно тестує цей PR: зелений → **squash-мержить у `main`** (issue закривається через `Closes #N`, без людського рев'ю); близько → **дороблює** гілку і мержить; принципово неясно → повертає issue в `to-design` з коментарем «що саме неясно» і закриває PR.

Два агенти = кожна зміна незалежно перевірена перед `main`. Щотіку worker добирає задачі зі `status:to-do`, поки пул < 10 агентів (менше — лише якщо готових задач менше). Стан відновлює з GitHub: `in-progress` без PR → треба Builder; `in-progress` з відкритим PR → треба Tester.

**Design-сесія** (skill, спирається на `sync-design`) — розбирає `to-design`: уточнює/брейнштормить через інтерв'ю, фіксує рішення в `docs/DESIGN.md`, повертає issue в `to-do` (або нарізає нові issue).

**Feedback-сесія** — ти дивишся `main`, даєш фідбек; вона нарізає нові issue → `to-do` (ясне) або `to-design` (треба уточнити).

## Потік

```
to-design → to-do → in-progress ─Builder→ PR ─Tester→ squash-merge → main → issue closed
    ↑______ Builder/Tester повертає в to-design, якщо неясно ______|
```

Відкат: 1 задача = 1 squash-коміт → Revert на її PR відкочує рівно її.
