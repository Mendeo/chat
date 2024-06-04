'use strict';
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('input-text');
const submit = document.getElementById('submit');
const USER_SESSION_ID = document.querySelector('[data-user-session-id]').getAttribute('data-user-session-id');

chatArea.value = '';
const socket = new WebSocket(`ws://${location.host}`);
socket.addEventListener('open', ()=>
{
	socket.send(USER_SESSION_ID + '+');
	submit.addEventListener('click', ()=>
	{
		if (msgInput.checkValidity())
		{
			socket.send(USER_SESSION_ID + msgInput.value);
			msgInput.value = '';
		}
	});
});

socket.addEventListener('message', (e)=>
{
	chatArea.value += e.data + '\n';
});
socket.addEventListener('error', (e)=>
{
	chatArea.value += 'Ошибка отправки сообщения! ' + e;
});
socket.addEventListener('close', (e)=>
{
	if (e.wasClean)
	{
		chatArea.value += `Соединение закрыто чисто, код=${e.code} причина=${e.reason}`;
	}
	else
	{
		chatArea.value += 'Соединение прервано';
	}
});
msgInput.addEventListener('input', ()=>
{
	msgInput.reportValidity();
});
msgInput.addEventListener('keydown', (e) =>
{
	if (e.code === 'Enter' || e.code === 'NumpadEnter')
		{
			submit.click();
		}
});
