def native_control(event):
    mode = event.get('value', '')
    if mode == 'native':
        return 'native:' + event['window_id']
    if mode == 'read':
        StatusLabel.Text = NameInput.Text
    elif mode == 'count':
        NameInput.Text = str(int(NameInput.Text) + 1)
    elif mode == 'disable':
        NameInput.Enabled = False
        StatusLabel.Visible = False
        Launch.Text = 'Changed label'
    elif mode == 'enable':
        NameInput.Enabled = True
        StatusLabel.Visible = True
        Launch.Text = 'Launch'
    elif mode == 'bad':
        NameInput.Text = 'Partial write'
        NameInput.MissingProperty = True
    else:
        NameInput.Text = 'Hello World'
    return 'native:' + event['window_id']
