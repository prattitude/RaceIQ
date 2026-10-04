namespace Trailbrake;

public sealed class MainForm : Form
{
    private readonly Label _npuLabel = CreateValueLabel();
    private readonly Label _raceIqLabel = CreateValueLabel();
    private readonly Label _sessionLabel = CreateValueLabel();
    private readonly Label _forecastLabel = CreateValueLabel();
    private readonly Label _detailLabel = CreateValueLabel();
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };
    private readonly RaceIqClient _raceIq = new();
    private NpuCapabilityReport? _npu;
    private DateTimeOffset _nextNpuPrepareUtc = DateTimeOffset.MinValue;

    public MainForm()
    {
        Text = "Trailbrake";
        Width = 560;
        Height = 420;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.FromArgb(18, 20, 24);
        ForeColor = Color.FromArgb(230, 234, 240);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(20),
            ColumnCount = 1,
            RowCount = 6,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        layout.Controls.Add(new Label
        {
            Text = "Trailbrake companion",
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 14f),
            ForeColor = Color.FromArgb(120, 210, 255),
        }, 0, 0);
        layout.Controls.Add(Labeled("NPU", _npuLabel), 0, 1);
        layout.Controls.Add(Labeled("RaceIQ", _raceIqLabel), 0, 2);
        layout.Controls.Add(Labeled("Session", _sessionLabel), 0, 3);
        layout.Controls.Add(Labeled("Forecast", _forecastLabel), 0, 4);
        _detailLabel.Dock = DockStyle.Fill;
        layout.Controls.Add(_detailLabel, 0, 5);
        Controls.Add(layout);

        _timer.Tick += async (_, _) => await RefreshAsync();
        Shown += async (_, _) =>
        {
            _detailLabel.Text = "Checking NPU and RaceIQ…";
            _npu = await PrepareNpuAsync(forceEnsure: true);
            File.WriteAllText(TrailbrakePaths.NpuCapabilityPath, NpuCapability.ToJson(_npu));
            await RefreshAsync();
            _timer.Start();
        };
        FormClosed += (_, _) =>
        {
            _timer.Stop();
            _raceIq.Dispose();
        };
    }

    private async Task<NpuCapabilityReport> PrepareNpuAsync(bool forceEnsure)
    {
        var report = NpuCapability.Capture();
        var needsPrepare = report.Recommendation.Action
            is NpuCapability.ActionPrepareProvider
            or NpuCapability.ActionInstallProvider;
        if (needsPrepare && (forceEnsure || DateTimeOffset.UtcNow >= _nextNpuPrepareUtc))
        {
            _nextNpuPrepareUtc = DateTimeOffset.UtcNow.AddSeconds(30);
            await NpuCapability.EnsureRecommendedProviderAsync(report);
            report = NpuCapability.Capture();
        }

        return report;
    }

    private async Task RefreshAsync()
    {
        if (_npu is null || !_npu.NpuFeaturesEnabled)
        {
            _npu = await PrepareNpuAsync(forceEnsure: _npu is null);
        }

        var raceIq = await _raceIq.GetStatusAsync();
        var status = CompanionStatusStore.Build(_npu, raceIq);
        CompanionStatusStore.Write(status);

        _npuLabel.Text = status.NpuFeaturesEnabled
            ? $"Ready ({status.NpuProvider})"
            : "Off — prepare the recommended provider with the probe";
        _npuLabel.ForeColor = status.NpuFeaturesEnabled ? Color.FromArgb(120, 220, 160) : Color.FromArgb(240, 140, 120);

        _raceIqLabel.Text = status.RaceIq.Connected
            ? $"Connected ({status.RaceIq.BaseUrl}) · {status.RaceIq.PacketsPerSec:0} pkt/s"
            : status.RaceIq.Error ?? "Not connected";
        _raceIqLabel.ForeColor = status.RaceIq.Connected ? Color.FromArgb(120, 220, 160) : Color.FromArgb(240, 180, 100);

        _sessionLabel.Text = status.RaceIq.SessionId is int sessionId
            ? $"#{sessionId} · {status.RaceIq.DetectedGameName ?? status.RaceIq.DetectedGameId ?? "game"} · car {status.RaceIq.CarOrdinal} · track {status.RaceIq.TrackOrdinal}"
            : status.RaceIq.DetectedGameName is not null
                ? $"{status.RaceIq.DetectedGameName} detected · no active session yet"
                : "No active session";

        _forecastLabel.Text = $"{status.Forecast.State}: {status.Forecast.Message}";
        _forecastLabel.ForeColor = status.Forecast.State == CompanionStatusStore.ForecastArmed
            ? Color.FromArgb(120, 210, 255)
            : Color.FromArgb(200, 200, 210);

        _detailLabel.Text = status.NpuFeaturesEnabled
            ? "Trailbrake is linked to RaceIQ. The approach forecast model is not loaded in this build yet; status is shared with the RaceIQ Settings → Trailbrake panel."
            : string.Join(Environment.NewLine, _npu.Recommendation.Steps);
    }

    private static Control Labeled(string title, Label value)
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        var heading = new Label
        {
            Text = title,
            AutoSize = true,
            ForeColor = Color.FromArgb(150, 160, 175),
            Location = new Point(0, 0),
        };
        value.Location = new Point(0, 22);
        value.AutoSize = true;
        panel.Controls.Add(heading);
        panel.Controls.Add(value);
        return panel;
    }

    private static Label CreateValueLabel() => new()
    {
        AutoSize = true,
        MaximumSize = new Size(500, 0),
    };
}
