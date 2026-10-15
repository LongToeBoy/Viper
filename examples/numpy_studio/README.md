# Array — NumPy Studio

A complete, editable Viper demo: a soft green dashboard with sample datasets,
live statistics, an eight-bin histogram and a real NumPy import. All visual
elements are standard Viper controls; the application uses the existing anchor
solver, CSS theme, event dispatcher and runtime.

![NumPy Studio running in Windows WebView2](preview.png)

From the repository root, install Viper and the demo dependency once:

```powershell
python -m pip install -e .
python -m pip install -r examples/numpy_studio/requirements.txt
```

Run the finished application:

```powershell
python -m examples.numpy_studio.app
```

Open it in the designer:

```powershell
python -m examples.numpy_studio.edit
```

Or open `project.json` through Viper's File > Open, then press F6 for Preview
or F5 for Run. Both launchers resolve the JSON relative to themselves and also
work by absolute path from another working directory when Viper is installed.

Try this:

1. Compare **Weekly sales**, **Sensor readings** and **Spot the outlier**.
   The mean and median react differently to an extreme value.
2. Click **Generate new data** for 32 fresh normally distributed observations.
3. Replace the dataset with `10, 20, 30, 40` and choose **Analyze data**.
   Expect mean/median 25 and population standard deviation about 11.18.
4. Enable **Standardize values**. NumPy transforms the data into z-scores;
   the mean becomes 0 and population standard deviation becomes 1. The input
   stays unchanged, so toggling back restores the raw analysis.
5. Try invalid text, a constant dataset, negative numbers or scientific notation.
   Invalid input preserves the last valid results and shows an inline message.
6. Resize the window. Shared hard-anchor links keep the card contents together;
   the sidebar fills between opposing window anchors.

Select **NumPyStudio** in Project Explorer to inspect its **Imports** block:
`import numpy as np`. Open the Analyze button's Events tab for the real
`np.array`, `np.mean`, `np.median`, `np.std`, `np.percentile` and
`np.histogram` calls. MeanValue also has a change handler that updates the footer.
Outliers use Tukey's 1.5×IQR fences. Histogram bins include their lower edge and
exclude their upper edge, except the last bin, which includes both edges.
Zero-variance datasets standardize to zero. Input is limited to 2–2,000 finite
values with absolute magnitude at most 1e12.

The theme and Python source are embedded in `project.json`; the example does
not need a network connection. Use File > Build / Package to export it. Python
export collects NumPy into requirements; executable export bundles the installed
NumPy package through the existing Windows builder. Linux remains unverified.

`studio.css` and `events.py` are readable source for the bundled example.
To explicitly regenerate the original `project.json`, run
`python -m examples.numpy_studio.create_project`. This replaces that JSON;
save your own designer edits under another filename before regenerating.
