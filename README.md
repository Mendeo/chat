# Простой чат на web сокетах

* Пользователи имеют свой логин и пароль. Логинятся при помощи базовой http аутентификации.
* Есть возможность обмена файлами.

Перед запуском нужно подготовить файл "users.json" формата:
```json
{
	"user_name": "password_in_MD5"
}
```
Можно в корень положить "onmessage.mp3". Этот звук будет воспроизводится, если пришло сообщение и окно с чатом не активно.
