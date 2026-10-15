"""Saved as editable event source in project.json; NumPy comes from Window imports.

Only Viper control properties are changed. No HTML, host APIs or custom renderer.
"""


def studio_action(event):
    presets = {
        'PresetSales': '42, 48, 51, 45, 62, 58, 65, 71, 68, 74, 82, 77, 63, 59, 66, 72, 85, 91, 79, 83, 69, 76, 88, 94',
        'PresetSensor': '19.8, 20.1, 20.3, 19.9, 20.2, 20.0, 19.7, 20.4, 20.1, 19.8, 20.3, 20.2, 19.9, 20.0, 20.1, 20.4',
        'PresetOutlier': '12, 14, 13, 15, 11, 14, 13, 12, 16, 13, 14, 12, 15, 13, 14, 95',
    }
    sender = event.sender.Name
    if sender in presets:
        DataInput.Text = presets[sender]
    elif sender == 'Generate':
        sample = np.random.default_rng().normal(65, 14, 32).round(1)
        DataInput.Text = ', '.join(str(value) for value in sample)

    # Input changes caused by a preset also notify this handler. Analyze once:
    # the original click already sees the new value and returns all UI patches.
    if sender == 'DataInput' and event.get('property') == 'Text':
        return

    try:
        tokens = DataInput.Text.replace(',', ' ').replace(';', ' ').split()
        if not 2 <= len(tokens) <= 2000:
            raise ValueError('Enter 2 to 2,000 numbers, separated by commas or spaces.')
        values = np.array([float(token) for token in tokens], dtype=float)
        if not np.all(np.isfinite(values)) or np.max(np.abs(values)) > 1e12:
            raise ValueError('Use finite numbers between -1e12 and 1e12.')
    except ValueError as error:
        message = str(error) if 'Enter ' in str(error) or 'Use finite' in str(error) else 'One value is not a number. Try 12, 18, 24, 30.'
        ErrorMessage.Text = message
        ErrorMessage.Visible = True
        InputStatus.Visible = False
        FooterStatus.Text = 'Check your dataset. The last valid analysis is still shown.'
        return

    ErrorMessage.Visible = False
    InputStatus.Visible = True
    normalized = Standardize.Checked
    spread = float(np.std(values))
    if normalized:
        values = (values - np.mean(values)) / spread if spread > 0 else np.zeros_like(values)

    def number(value):
        # Avoid negative zero and keep very small/large values readable.
        value = float(value)
        if value == 0:
            value = 0.0
        if (0 < abs(value) < 0.01) or abs(value) >= 100000:
            return f'{value:.2e}'
        return f'{value:,.2f}'.rstrip('0').rstrip('.')

    mean, median, std = float(np.mean(values)), float(np.median(values)), float(np.std(values))
    if normalized:
        # Suppress floating-point residue around zero after centering, while
        # preserving genuinely small values in an untransformed dataset.
        mean = 0.0 if abs(mean) < 1e-10 else mean
        median = 0.0 if abs(median) < 1e-10 else median
    CountValue.Text = str(values.size)
    MeanValue.Text = number(mean)
    MedianValue.Text = number(median)
    SpreadValue.Text = number(std)
    RangeValue.Text = f'{number(np.min(values))}  →  {number(np.max(values))}'
    counts, edges = np.histogram(values, bins=8)
    peak = max(1, int(np.max(counts)))
    for index, count in enumerate(counts):
        event.controls[f'Bin{index}'].Text = f'{edges[index]:.3g} – {edges[index + 1]:.3g}'
        event.controls[f'Bar{index}'].Text = '━' * max(1, round(28 * int(count) / peak)) if count else ''
        event.controls[f'Frequency{index}'].Text = str(int(count))

    q1, q3 = np.percentile(values, [25, 75])
    iqr = q3 - q1
    outliers = int(np.count_nonzero((values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)))
    if std == 0:
        insight = 'Every value is the same.\nThere is no variation in this dataset.'
    elif outliers:
        insight = f'{outliers} potential outlier' + ('s' if outliers != 1 else '') + ' beyond the IQR fences.\nCompare the mean with the median.'
    else:
        insight = 'No outliers beyond the IQR fences.\nLoad the outlier sample to see the difference.'
    InsightText.Text = insight
    ChartTitle.Text = 'Distribution' + (' · standardized' if normalized else '')
    mode = 'Z-scores: centered on 0, population standard deviation 1.' if normalized and spread > 0 else (
        'Constant data maps to zeros when standardized.' if normalized else 'Raw values · population standard deviation · 8 equal-width bins')
    InputStatus.Text = f'{values.size} values ready.  {mode}'
    OperationCode.Text = '(x - np.mean(x)) / np.std(x)' if normalized else 'np.histogram(x, bins=8)'
    ModuleBadge.Text = f'NumPy {np.__version__}  /  live'
    FooterStatus.Text = 'Analysis refreshed in Python.'


def mean_changed(event):
    """Demonstrates Viper's Python property-change notification chain."""
    FooterStatus.Text = 'Analysis refreshed · mean change event received'
