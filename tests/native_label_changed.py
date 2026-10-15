calls = 0


def native_label_changed(event):
    global calls
    if not event.sender.Text.startswith('Change test:'):
        return
    calls += 1
    NameInput.Text = f'Label change #{calls}: {event["value"]}'
    MainPanel.Text = f'{event["event"]}:{event["property"]}:{event.form.id}'
